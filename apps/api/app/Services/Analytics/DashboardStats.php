<?php

namespace App\Services\Analytics;

use App\Models\Device;
use App\Models\Install;
use App\Models\Plan;
use App\Models\Template;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/** Every number on the admin dashboard comes from here, from real tables. Nothing is mocked or hardcoded. */
class DashboardStats
{
    public function __construct(public readonly Carbon $from, public readonly Carbon $to) {}

    public static function forRange(?string $from, ?string $to): self
    {
        $end = $to ? Carbon::parse($to)->endOfDay() : now()->endOfDay();
        $start = $from ? Carbon::parse($from)->startOfDay() : $end->copy()->subDays(29)->startOfDay();

        return new self($start, $end);
    }

    /** @return array<string, int|float> */
    public function users(): array
    {
        return [
            'total_users' => User::count(),
            'new_signups' => User::whereBetween('created_at', [$this->from, $this->to])->count(),
            'active_24h' => $this->activeInstalls($this->to->copy()->subDay()->addSecond(), $this->to),
            'active_7d' => $this->activeInstalls($this->to->copy()->subDays(7)->addSecond(), $this->to),
            'active_30d' => $this->activeInstalls($this->to->copy()->subDays(30)->addSecond(), $this->to),
            'installs' => Install::where('opt_out', false)->count(),
            'new_installs' => Install::where('opt_out', false)->whereBetween('first_seen_at', [$this->from, $this->to])->count(),
            'active_devices' => Device::where('last_seen_at', '>=', $this->to->copy()->subDays(30))->count(),
        ];
    }

    private function activeInstalls(Carbon $from, Carbon $to): int
    {
        return (int) DB::table('telemetry_active_daily')->whereBetween('day', [$from->toDateString(), $to->toDateString()])->distinct()->count('install_id');
    }

    /**
     * DAU, WAU and MAU for each day in the range (trailing windows).
     *
     * @return list<array{day: string, dau: int, wau: int, mau: int}>
     */
    public function activeTrend(): array
    {
        $out = [];
        for ($d = $this->from->copy()->startOfDay(); $d <= $this->to; $d->addDay()) {
            $out[] = [
                'day' => $d->toDateString(),
                'dau' => $this->activeInstalls($d->copy(), $d->copy()),
                'wau' => $this->activeInstalls($d->copy()->subDays(6), $d->copy()),
                'mau' => $this->activeInstalls($d->copy()->subDays(29), $d->copy()),
            ];
        }

        return $out;
    }

    /** @return array<string, int> extension version => installs */
    public function versions(): array
    {
        return Install::where('opt_out', false)->whereNotNull('extension_version')->select('extension_version', DB::raw('count(*) as n'))
            ->groupBy('extension_version')->orderByDesc('n')->pluck('n', 'extension_version')->map(fn ($n) => (int) $n)->all();
    }

    /** @return array<string, int> plan name => users */
    public function plans(): array
    {
        $default = Plan::where('is_default', true)->value('name');
        $rows = User::query()->leftJoin('plans', 'plans.id', '=', 'users.plan_id')->select(DB::raw('coalesce(plans.name, \''.addslashes((string) $default).'\') as plan'), DB::raw('count(*) as n'))
            ->groupBy('plan')->orderByDesc('n')->pluck('n', 'plan');

        return $rows->map(fn ($n) => (int) $n)->all();
    }

    /** @return list<array{step: string, count: int}> */
    public function funnel(): array
    {
        $milestone = fn (string $m) => (int) DB::table('install_milestones')->where('milestone', $m)->whereBetween('reached_at', [$this->from, $this->to])->count();
        $default = Plan::where('is_default', true)->value('id');

        return [
            ['step' => 'Installed', 'count' => $milestone('install')],
            ['step' => 'Signed up', 'count' => Install::whereNotNull('user_id')->whereBetween('first_seen_at', [$this->from, $this->to])->count()],
            ['step' => 'First generation', 'count' => $milestone('first_generation')],
            ['step' => 'First completed autopilot run', 'count' => $milestone('autopilot_completed')],
            ['step' => 'Paid', 'count' => User::whereNotNull('plan_id')->where('plan_id', '!=', $default)->whereBetween('updated_at', [$this->from, $this->to])->count()],
        ];
    }

    /** @return Collection<int, \stdClass> */
    private function daily(string $name)
    {
        return DB::table('telemetry_daily')->where('name', $name)->whereBetween('day', [$this->from->toDateString(), $this->to->toDateString()]);
    }

    /** @return list<array{day: string, success: int, failure: int}> */
    public function generationsPerDay(): array
    {
        $rows = $this->daily('generation')->select('day', 'success', DB::raw('sum(events) as n'))->groupBy('day', 'success')->get();
        $by = [];
        foreach ($rows as $r) {
            $by[$r->day][$r->success ? 'success' : 'failure'] = (int) $r->n;
        }
        ksort($by);

        return collect($by)->map(fn ($v, $day) => ['day' => $day, 'success' => $v['success'] ?? 0, 'failure' => $v['failure'] ?? 0])->values()->all();
    }

    /** @return list<array{provider: string, model: string, total: int, failures: int}> */
    public function generationsByModel(): array
    {
        return $this->daily('generation')->select('provider', 'model', DB::raw('sum(events) as total'), DB::raw('sum(case when success = 0 then events else 0 end) as failures'))
            ->groupBy('provider', 'model')->orderByDesc('total')->get()
            ->map(fn ($r) => ['provider' => $r->provider, 'model' => $r->model, 'total' => (int) $r->total, 'failures' => (int) $r->failures])->all();
    }

    /** @return array<string, int> */
    public function topErrors(int $limit = 10): array
    {
        return $this->daily('generation')->where('success', false)->where('item', '!=', '')->select('item', DB::raw('sum(events) as n'))
            ->groupBy('item')->orderByDesc('n')->limit($limit)->pluck('n', 'item')->map(fn ($n) => (int) $n)->all();
    }

    /** @return array<string, mixed> */
    public function autopilot(): array
    {
        $sum = fn (string $name, string $col = 'events') => (int) $this->daily($name)->sum($col);
        $started = $sum('autopilot_started');
        $completed = $sum('autopilot_completed');
        $shots = $sum('autopilot_completed', 'shots');
        $flagged = $sum('autopilot_completed', 'flagged');
        $gates = [];
        foreach (['characters', 'locations', 'pilot_scene'] as $g) {
            $shown = (int) $this->daily('gate_shown')->where('item', $g)->sum('events');
            $approved = (int) $this->daily('gate_approved')->where('item', $g)->sum('events');
            $gates[$g] = ['shown' => $shown, 'approved' => $approved, 'drop_off' => $shown ? round(1 - $approved / $shown, 4) : null];
        }
        $refShown = $sum('refine_shown');

        return [
            'started' => $started, 'completed' => $completed,
            'completion_rate' => $started ? round($completed / $started, 4) : null,
            'avg_shots_per_run' => $completed ? round($shots / $completed, 2) : null,
            'flagged_shot_rate' => $shots ? round($flagged / $shots, 4) : null,
            'flag_reasons' => $this->daily('shot_flagged')->select('item', DB::raw('sum(events) as n'))->groupBy('item')->orderByDesc('n')->pluck('n', 'item')->map(fn ($n) => (int) $n)->all(),
            'gates' => $gates,
            'refinement_acceptance' => $refShown ? round($sum('refine_accepted') / $refShown, 4) : null,
            'autonomy_split' => $this->daily('autopilot_started')->select('autonomy', DB::raw('sum(events) as n'))->groupBy('autonomy')->pluck('n', 'autonomy')->map(fn ($n) => (int) $n)->all(),
        ];
    }

    /** @return array{templates: array<string, int>, presets: array<string, int>} */
    public function topContent(int $limit = 10): array
    {
        $by = fn (string $name) => $this->daily($name)->select('item', DB::raw('sum(events) as n'))->groupBy('item')->orderByDesc('n')->limit($limit)->pluck('n', 'item')->map(fn ($n) => (int) $n)->all();

        return ['templates' => $by('template_used'), 'presets' => $by('preset_used'), 'template_catalogue_uses' => Template::orderByDesc('use_count')->limit($limit)->pluck('use_count', 'title')->map(fn ($n) => (int) $n)->all()];
    }

    /** @return array<string, int> country code => installs (country level only) */
    public function countries(int $limit = 10): array
    {
        return Install::where('opt_out', false)->whereNotNull('country')->select('country', DB::raw('count(*) as n'))->groupBy('country')->orderByDesc('n')->limit($limit)->pluck('n', 'country')->map(fn ($n) => (int) $n)->all();
    }

    /**
     * Weekly retention cohorts: installs grouped by the week they first appeared, and how many were active in each following week.
     *
     * @return list<array{cohort: string, size: int, weeks: list<float|null>}>
     */
    public function retention(int $weeks = 4): array
    {
        $out = [];
        $installs = Install::where('opt_out', false)->whereNotNull('first_seen_at')->whereBetween('first_seen_at', [$this->from->copy()->startOfWeek(), $this->to])->get();
        foreach ($installs->groupBy(fn ($i) => $i->first_seen_at->copy()->startOfWeek()->toDateString())->sortKeys() as $cohort => $members) {
            $start = Carbon::parse($cohort);
            $ids = $members->pluck('install_id')->all();
            $row = [];
            for ($w = 0; $w <= $weeks; $w++) {
                $ws = $start->copy()->addWeeks($w);
                if ($ws->gt($this->to)) {
                    $row[] = null;

                    continue;
                }
                $active = DB::table('telemetry_active_daily')->whereIn('install_id', $ids)->whereBetween('day', [$ws->toDateString(), $ws->copy()->addDays(6)->toDateString()])->distinct()->count('install_id');
                $row[] = round($active / count($ids), 4);
            }
            $out[] = ['cohort' => $cohort, 'size' => count($ids), 'weeks' => $row];
        }

        return $out;
    }

    /** @return array<string, int|float|null> */
    public function health(): array
    {
        $lat = Cache::get('api.latency_ms', []);
        sort($lat);

        return [
            'queue_depth' => (int) DB::table('jobs')->count(),
            'failed_jobs' => (int) DB::table('failed_jobs')->count(),
            'latency_avg_ms' => $lat ? round(array_sum($lat) / count($lat), 1) : null,
            'latency_p95_ms' => $lat ? $lat[(int) floor(0.95 * (count($lat) - 1))] : null,
            'latency_samples' => count($lat),
        ];
    }
}
