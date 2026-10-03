<?php

require_once __DIR__.'/../Support/KnownDataset.php';

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/** A small world with known answers: every expected number below is derived from this dataset by hand. */
beforeEach(fn () => seedKnownDataset($this));

afterEach(fn () => Carbon::setTestNow());

it('counts users, signups, installs, active windows and devices', function () {
    expect($this->stats->users())->toBe([
        'total_users' => 3, 'new_signups' => 2,
        'active_24h' => 1,   // only C on Mar 31
        'active_7d' => 1,    // Mar 25..31 -> C
        'active_30d' => 3,   // A, B, C in Mar 2..31
        'installs' => 3, 'new_installs' => 3, 'active_devices' => 1,
    ]);
});

it('builds DAU, WAU and MAU per day with trailing windows', function () {
    $trend = collect($this->stats->activeTrend())->keyBy('day');
    expect($trend)->toHaveCount(31)
        ->and($trend['2026-03-10'])->toMatchArray(['dau' => 1, 'wau' => 1, 'mau' => 1])
        ->and($trend['2026-03-12'])->toMatchArray(['dau' => 1, 'wau' => 2, 'mau' => 2])   // B active; A and B in the last 7 days
        ->and($trend['2026-03-17'])->toMatchArray(['dau' => 1, 'wau' => 2, 'mau' => 2])   // A today, B on Mar 12 still inside 7 days
        ->and($trend['2026-03-25'])->toMatchArray(['dau' => 1, 'wau' => 1, 'mau' => 3])
        ->and($trend['2026-03-31'])->toMatchArray(['dau' => 1, 'wau' => 1, 'mau' => 3]);  // A, B and C all fall inside Mar 2..31
});

it('shows version, plan and country distribution without counting opted-out installs', function () {
    expect($this->stats->versions())->toBe(['0.1.0' => 2, '0.2.0' => 1])
        ->and($this->stats->plans())->toBe(['Free' => 2, 'Pro' => 1])
        ->and($this->stats->countries())->toBe(['PK' => 2, 'US' => 1]);
});

it('computes the funnel from install to paid', function () {
    expect(collect($this->stats->funnel())->pluck('count', 'step')->all())->toBe([
        'Installed' => 3, 'Signed up' => 1, 'First generation' => 2, 'First completed autopilot run' => 1, 'Paid' => 1,
    ]);
});

it('summarises generations per day, per model, and the top error codes inside the range only', function () {
    expect($this->stats->generationsPerDay())->toBe([['day' => '2026-03-10', 'success' => 8, 'failure' => 2], ['day' => '2026-03-11', 'success' => 5, 'failure' => 2]])
        ->and($this->stats->generationsByModel())->toBe([
            ['provider' => 'openai', 'model' => 'img', 'total' => 10, 'failures' => 2], ['provider' => 'fal', 'model' => 'vid', 'total' => 7, 'failures' => 2],
        ])
        ->and($this->stats->topErrors())->toBe(['rate_limited' => 3, 'policy_rejected' => 1]);
});

it('computes autopilot analytics', function () {
    $a = $this->stats->autopilot();
    expect($a)->toMatchArray([
        'started' => 4, 'completed' => 2, 'completion_rate' => 0.5, 'avg_shots_per_run' => 10.0, 'flagged_shot_rate' => 0.15,
        'refinement_acceptance' => 0.7, 'autonomy_split' => ['checkpoints' => 3, 'full_auto' => 1],
        'flag_reasons' => ['policy_rejected' => 2, 'transient' => 1],
    ]);
    expect($a['gates']['characters'])->toBe(['shown' => 4, 'approved' => 3, 'drop_off' => 0.25])
        ->and($a['gates']['locations']['drop_off'])->toBe(0.0)
        ->and($a['gates']['pilot_scene'])->toBe(['shown' => 0, 'approved' => 0, 'drop_off' => null]);
});

it('ranks top presets and templates', function () {
    $c = $this->stats->topContent();
    expect($c['presets'])->toBe(['cam_orbit' => 4, 'cam_pan' => 1])->and($c['templates'])->toBe(['walk' => 6])->and($c['template_catalogue_uses'])->toBe(['Walk' => 6]);
});

it('builds weekly retention cohorts', function () {
    // Cohort week of Mar 9: A (Mar 10) and B (Mar 12). Week 0 both active; week 1 (Mar 16-22) only A; week 2 none.
    $row = collect($this->stats->retention(2))->firstWhere('cohort', '2026-03-09');
    expect($row)->toMatchArray(['size' => 2, 'weeks' => [1.0, 0.5, 0.0]]);
    // Cohort week of Mar 23: C only, active Mar 25 (week 0) and Mar 31 (week 1, starting Mar 30); week 2 is after the range.
    expect(collect($this->stats->retention(2))->firstWhere('cohort', '2026-03-23')['weeks'])->toBe([1.0, 1.0, null]);
});

it('reports system health from the queue tables and recorded latency', function () {
    DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{}', 'attempts' => 0, 'available_at' => time(), 'created_at' => time()]);
    Cache::put('api.latency_ms', [10, 20, 30, 40, 100]);
    expect($this->stats->health())->toMatchArray(['queue_depth' => 1, 'failed_jobs' => 0, 'latency_avg_ms' => 40.0, 'latency_p95_ms' => 40, 'latency_samples' => 5]);
});

it('records API latency through the middleware', function () {
    Cache::forget('api.latency_ms');
    $this->getJson('/api/v1/config');
    expect(Cache::get('api.latency_ms'))->toHaveCount(1);
});
