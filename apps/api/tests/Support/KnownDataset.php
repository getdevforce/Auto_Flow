<?php

use App\Models\Device;
use App\Models\Install;
use App\Models\Plan;
use App\Models\Template;
use App\Models\User;
use App\Services\Analytics\DashboardStats;
use Database\Seeders\DefaultPlansSeeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Seeds the small world with known answers used by the dashboard stats and widget tests. */
function seedKnownDataset($test): void
{
    $test->seed(DefaultPlansSeeder::class);
    Carbon::setTestNow('2026-03-31 12:00:00');
    $free = Plan::where('slug', 'free')->first();
    $pro = Plan::where('slug', 'pro')->first();

    // Users: 3 total. u1 and u2 signed up inside the range (Mar 10 and 20), u3 before it. u2 is on Pro.
    $test->u1 = User::factory()->create(['created_at' => '2026-03-10', 'plan_id' => $free->id]);
    $test->u2 = User::factory()->create(['created_at' => '2026-03-20', 'plan_id' => $pro->id, 'updated_at' => '2026-03-21']);
    $test->u3 = User::factory()->create(['created_at' => '2026-01-05', 'plan_id' => null]);
    Device::factory()->create(['user_id' => $test->u1->id, 'last_seen_at' => '2026-03-30']);
    Device::factory()->create(['user_id' => $test->u2->id, 'last_seen_at' => '2025-12-01']); // stale

    // Installs: A (Mar 10, PK, v0.1.0, user u1), B (Mar 12, PK, v0.1.0), C (Mar 25, US, v0.2.0), D opted out.
    $mk = fn ($id, $first, $country, $ver, $user = null, $out = false) => Install::create(['install_id' => $id, 'first_seen_at' => $first, 'last_seen_at' => $first, 'country' => $country, 'extension_version' => $ver, 'user_id' => $user, 'opt_out' => $out]);
    $A = '00000000-0000-4000-8000-00000000000a';
    $B = '00000000-0000-4000-8000-00000000000b';
    $C = '00000000-0000-4000-8000-00000000000c';
    $mk($A, '2026-03-10', 'PK', '0.1.0', $test->u1->id);
    $mk($B, '2026-03-12', 'PK', '0.1.0');
    $mk($C, '2026-03-25', 'US', '0.2.0');
    $mk('00000000-0000-4000-8000-00000000000d', '2026-03-11', 'DE', '0.1.0', null, true);

    // Activity: A active Mar 10, 11, 17; B active Mar 12; C active Mar 25, 31.
    foreach ([[$A, '2026-03-10'], [$A, '2026-03-11'], [$A, '2026-03-17'], [$B, '2026-03-12'], [$C, '2026-03-25'], [$C, '2026-03-31']] as [$i, $d]) {
        DB::table('telemetry_active_daily')->insert(['day' => $d, 'install_id' => $i]);
    }
    foreach ([[$A, 'install', '2026-03-10'], [$B, 'install', '2026-03-12'], [$C, 'install', '2026-03-25'], [$A, 'first_generation', '2026-03-10'], [$B, 'first_generation', '2026-03-13'], [$A, 'autopilot_completed', '2026-03-17']] as [$i, $m, $d]) {
        DB::table('install_milestones')->insert(['install_id' => $i, 'milestone' => $m, 'reached_at' => $d]);
    }

    $agg = fn (array $r) => DB::table('telemetry_daily')->insert($r + ['provider' => '', 'model' => '', 'autonomy' => '', 'version' => '', 'country' => '', 'item' => '', 'success' => true, 'events' => 0, 'duration_ms' => 0, 'shots' => 0, 'flagged' => 0]);
    $agg(['day' => '2026-03-10', 'name' => 'generation', 'provider' => 'openai', 'model' => 'img', 'events' => 8]);
    $agg(['day' => '2026-03-10', 'name' => 'generation', 'provider' => 'openai', 'model' => 'img', 'success' => false, 'item' => 'rate_limited', 'events' => 2]);
    $agg(['day' => '2026-03-11', 'name' => 'generation', 'provider' => 'fal', 'model' => 'vid', 'events' => 5]);
    $agg(['day' => '2026-03-11', 'name' => 'generation', 'provider' => 'fal', 'model' => 'vid', 'success' => false, 'item' => 'policy_rejected', 'events' => 1]);
    $agg(['day' => '2026-03-11', 'name' => 'generation', 'provider' => 'fal', 'model' => 'vid', 'success' => false, 'item' => 'rate_limited', 'events' => 1]);
    $agg(['day' => '2026-02-01', 'name' => 'generation', 'provider' => 'old', 'model' => 'old', 'events' => 99]); // outside the range
    $agg(['day' => '2026-03-12', 'name' => 'autopilot_started', 'autonomy' => 'checkpoints', 'events' => 3]);
    $agg(['day' => '2026-03-12', 'name' => 'autopilot_started', 'autonomy' => 'full_auto', 'events' => 1]);
    $agg(['day' => '2026-03-13', 'name' => 'autopilot_completed', 'autonomy' => 'checkpoints', 'events' => 2, 'shots' => 20, 'flagged' => 3]);
    $agg(['day' => '2026-03-13', 'name' => 'shot_flagged', 'item' => 'policy_rejected', 'events' => 2]);
    $agg(['day' => '2026-03-13', 'name' => 'shot_flagged', 'item' => 'transient', 'events' => 1]);
    $agg(['day' => '2026-03-13', 'name' => 'gate_shown', 'item' => 'characters', 'events' => 4]);
    $agg(['day' => '2026-03-13', 'name' => 'gate_approved', 'item' => 'characters', 'events' => 3]);
    $agg(['day' => '2026-03-13', 'name' => 'gate_shown', 'item' => 'locations', 'events' => 3]);
    $agg(['day' => '2026-03-13', 'name' => 'gate_approved', 'item' => 'locations', 'events' => 3]);
    $agg(['day' => '2026-03-14', 'name' => 'refine_shown', 'events' => 10]);
    $agg(['day' => '2026-03-14', 'name' => 'refine_accepted', 'events' => 7]);
    $agg(['day' => '2026-03-14', 'name' => 'preset_used', 'item' => 'cam_orbit', 'events' => 4]);
    $agg(['day' => '2026-03-14', 'name' => 'preset_used', 'item' => 'cam_pan', 'events' => 1]);
    $agg(['day' => '2026-03-14', 'name' => 'template_used', 'item' => 'walk', 'events' => 6]);
    Template::factory()->create(['title' => 'Walk', 'use_count' => 6]);

    $test->stats = DashboardStats::forRange('2026-03-01', '2026-03-31');
}
