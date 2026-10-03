<?php

use App\Models\Install;
use App\Models\User;
use Illuminate\Support\Facades\DB;

function ev(string $name, array $props = [], ?int $ts = null): array
{
    return ['name' => $name, 'ts' => $ts ?? time() - 5, 'props' => $props];
}

function ingest($t, array $events, ?string $install = null, array $headers = [])
{
    return $t->postJson('/api/v1/telemetry', ['install_id' => $install ?? '11111111-1111-4111-8111-111111111111', 'events' => $events], $headers);
}

it('stores a valid batch, aggregates it, and records activity and milestones', function () {
    ingest($this, [
        ev('app_opened'), ev('generation', ['provider' => 'openai', 'model' => 'img-1', 'success' => true, 'duration_ms' => 1200, 'kind' => 'image']),
        ev('generation', ['provider' => 'openai', 'model' => 'img-1', 'success' => false, 'error_code' => 'rate_limited']),
        ev('autopilot_completed', ['autonomy' => 'full_auto', 'shots' => 6, 'flagged' => 1]),
    ], null, ['CF-IPCountry' => 'pk', 'X-Extension-Version' => '0.1.0'])->assertStatus(202)->assertJsonPath('stored', 4);

    expect(DB::table('telemetry_events')->count())->toBe(4)
        ->and(DB::table('telemetry_active_daily')->count())->toBe(1)
        ->and(DB::table('install_milestones')->pluck('milestone')->sort()->values()->all())->toBe(['autopilot_completed', 'install'])
        ->and(Install::first())->extension_version->toBe('0.1.0')->country->toBe('PK');
    $gen = DB::table('telemetry_daily')->where('name', 'generation')->where('success', 1)->first();
    expect($gen->events)->toBe(1)->and($gen->duration_ms)->toBe(1200);
    expect(DB::table('telemetry_daily')->where('name', 'generation')->where('success', 0)->value('item'))->toBe('rate_limited');
});

it('adds to the same aggregate row instead of duplicating it', function () {
    ingest($this, [ev('generation', ['provider' => 'p', 'duration_ms' => 100]), ev('generation', ['provider' => 'p', 'duration_ms' => 50])]);
    ingest($this, [ev('generation', ['provider' => 'p', 'duration_ms' => 10])]);
    $rows = DB::table('telemetry_daily')->where('name', 'generation')->get();
    expect($rows)->toHaveCount(1)->and($rows[0]->events)->toBe(3)->and($rows[0]->duration_ms)->toBe(160);
});

it('rejects anything outside the catalogue: unknown events, properties, free text, types and extra fields', function (array $event) {
    ingest($this, [$event])->assertStatus(422);
    expect(DB::table('telemetry_events')->count())->toBe(0);
})->with([
    'unknown event' => [['name' => 'script_pasted', 'ts' => time() - 1, 'props' => []]],
    'prompt property' => [['name' => 'generation', 'ts' => time() - 1, 'props' => ['prompt' => 'a red door']]],
    'script property' => [['name' => 'autopilot_started', 'ts' => time() - 1, 'props' => ['script' => 'INT. ROOM']]],
    'free text in a string field' => [['name' => 'generation', 'ts' => time() - 1, 'props' => ['provider' => 'my secret <script> text!']]],
    'wrong type' => [['name' => 'generation', 'ts' => time() - 1, 'props' => ['success' => 'yes']]],
    'enum outside list' => [['name' => 'gate_shown', 'ts' => time() - 1, 'props' => ['gate' => 'whatever']]],
    'extra top-level field' => [['name' => 'app_opened', 'ts' => time() - 1, 'props' => [], 'filename' => 'film.mp4']],
    'future timestamp' => [['name' => 'app_opened', 'ts' => time() + 99999, 'props' => []]],
    'huge number' => [['name' => 'generation', 'ts' => time() - 1, 'props' => ['duration_ms' => 99999999999]]],
]);

it('rejects unexpected top-level fields and oversized batches', function () {
    $this->postJson('/api/v1/telemetry', ['install_id' => '11111111-1111-4111-8111-111111111111', 'events' => [ev('app_opened')], 'api_key' => 'sk-x'])->assertStatus(422);
    ingest($this, array_fill(0, 51, ev('app_opened')))->assertStatus(422);
    $this->postJson('/api/v1/telemetry', ['install_id' => 'nope', 'events' => [ev('app_opened')]])->assertStatus(422);
});

it('honours opt-out server-side and stores nothing for that install', function () {
    $id = '22222222-2222-4222-8222-222222222222';
    $this->putJson('/api/v1/telemetry/preference', ['install_id' => $id, 'enabled' => false])->assertOk()->assertJsonPath('enabled', false);
    ingest($this, [ev('app_opened')], $id)->assertStatus(202)->assertJsonPath('stored', 0);
    expect(DB::table('telemetry_events')->count())->toBe(0)->and(DB::table('telemetry_active_daily')->count())->toBe(0);
    $this->putJson('/api/v1/telemetry/preference', ['install_id' => $id, 'enabled' => true]);
    ingest($this, [ev('app_opened')], $id)->assertJsonPath('stored', 1);
});

it('links events to the user when a valid token is sent and ignores a bad token', function () {
    $user = User::factory()->create();
    $token = $user->createToken('x')->plainTextToken;
    ingest($this, [ev('app_opened')], null, ['Authorization' => "Bearer {$token}"]);
    expect(DB::table('telemetry_events')->value('user_id'))->toBe($user->id);
    ingest($this, [ev('app_opened')], '33333333-3333-4333-8333-333333333333', ['Authorization' => 'Bearer bad'])->assertStatus(202);
    expect(Install::find('33333333-3333-4333-8333-333333333333')->user_id)->toBeNull();
});

it('purges raw events after the retention window but keeps aggregates', function () {
    config(['telemetry.retention_days' => 30]);
    ingest($this, [ev('generation', ['provider' => 'p'], time() - 40 * 86400), ev('generation', ['provider' => 'p'], time() - 86400)]);
    $this->artisan('telemetry:purge')->assertSuccessful();
    expect(DB::table('telemetry_events')->count())->toBe(1)->and(DB::table('telemetry_daily')->sum('events'))->toBe(2);
});

it('rate limits ingestion', function () {
    foreach (range(1, 30) as $_) {
        ingest($this, [ev('app_opened')]);
    }
    ingest($this, [ev('app_opened')])->assertStatus(429);
});
