<?php

namespace App\Services\Telemetry;

use App\Models\Install;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class TelemetryRecorder
{
    private const MILESTONES = ['app_opened' => 'install', 'first_generation' => 'first_generation', 'autopilot_completed' => 'autopilot_completed'];

    /**
     * Stores a validated batch. Returns the number stored; 0 when the install has opted out.
     *
     * @param  list<array{name: string, ts: int, props: array<string, mixed>}>  $events
     */
    public function record(string $installId, ?int $userId, ?string $version, ?string $country, array $events): int
    {
        $install = Install::firstOrNew(['install_id' => $installId]);
        if ($install->opt_out) {
            return 0;
        }
        $now = now();
        $install->fill(['user_id' => $userId ?? $install->user_id, 'extension_version' => $version ?? $install->extension_version, 'country' => $country ?? $install->country, 'last_seen_at' => $now]);
        $install->first_seen_at ??= $now;
        $install->save();

        DB::transaction(function () use ($events, $installId, $userId, $version, $country) {
            foreach ($events as $e) {
                $at = Carbon::createFromTimestampUTC($e['ts']);
                DB::table('telemetry_events')->insert([
                    'install_id' => $installId, 'user_id' => $userId, 'name' => $e['name'], 'props' => json_encode($e['props']), 'country' => $country,
                    'occurred_at' => $at, 'created_at' => now(), 'updated_at' => now(),
                ]);
                $this->aggregate($e, $at->toDateString(), $version, $country);
                DB::table('telemetry_active_daily')->insertOrIgnore(['day' => $at->toDateString(), 'install_id' => $installId, 'user_id' => $userId]);
                if (isset(self::MILESTONES[$e['name']])) {
                    DB::table('install_milestones')->insertOrIgnore(['install_id' => $installId, 'milestone' => self::MILESTONES[$e['name']], 'reached_at' => $at]);
                }
            }
        });

        return count($events);
    }

    /** @param array{name: string, ts: int, props: array<string, mixed>} $e */
    private function aggregate(array $e, string $day, ?string $version, ?string $country): void
    {
        $p = $e['props'];
        $key = [
            'day' => $day, 'name' => $e['name'], 'provider' => $p['provider'] ?? '', 'model' => $p['model'] ?? '', 'autonomy' => $p['autonomy'] ?? '',
            'version' => $version ?? '', 'country' => $country ?? '', 'item' => $p['item'] ?? ($p['error_code'] ?? ($p['reason'] ?? ($p['gate'] ?? ''))),
            'success' => $p['success'] ?? true,
        ];
        $row = DB::table('telemetry_daily')->where($key)->first();
        $add = ['events' => 1, 'duration_ms' => $p['duration_ms'] ?? 0, 'shots' => $p['shots'] ?? 0, 'flagged' => $p['flagged'] ?? 0];
        if ($row) {
            DB::table('telemetry_daily')->where('id', $row->id)->update(array_map(fn ($c) => DB::raw("{$c} + {$add[$c]}"), array_combine(array_keys($add), array_keys($add))));
        } else {
            DB::table('telemetry_daily')->insert($key + $add);
        }
    }
}
