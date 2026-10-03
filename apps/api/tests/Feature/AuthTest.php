<?php

use App\Models\Device;
use App\Models\Plan;
use App\Models\User;
use Database\Seeders\DefaultPlansSeeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

beforeEach(fn () => $this->seed(DefaultPlansSeeder::class));

function creds(array $extra = []): array
{
    return ['install_id' => fake()->uuid(), 'device_name' => 'Work PC', 'extension_version' => '0.0.1', ...$extra];
}

it('registers, enrolls the device and assigns the default plan', function () {
    Notification::fake();
    $res = $this->postJson('/api/v1/auth/register', creds(['name' => 'Ada', 'email' => 'ada@example.com', 'password' => 'correct-horse-1']));
    $res->assertCreated()->assertJsonPath('user.plan', 'free');
    expect(Device::count())->toBe(1);
    $this->withToken($res->json('token'))->getJson('/api/v1/me')->assertOk()->assertJsonPath('email', 'ada@example.com');
});

it('uses a consistent error envelope', function () {
    $this->postJson('/api/v1/auth/register', ['email' => 'nope'])->assertStatus(422)
        ->assertJsonStructure(['error' => ['code', 'message', 'details']])->assertJsonPath('error.code', 'validation_failed');
    $this->getJson('/api/v1/me')->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
    $this->getJson('/api/v1/nothing')->assertStatus(404)->assertJsonPath('error.code', 'not_found');
});

it('rejects wrong passwords and suspended users', function () {
    $u = User::factory()->create(['password' => 'correct-horse-1']);
    $this->postJson('/api/v1/auth/login', creds(['email' => $u->email, 'password' => 'wrong']))->assertStatus(401);
    $u->forceFill(['suspended_at' => now()])->save();
    $this->postJson('/api/v1/auth/login', creds(['email' => $u->email, 'password' => 'correct-horse-1']))
        ->assertStatus(403)->assertJsonPath('error.code', 'suspended');
});

it('enforces the plan device limit and allows re-login on the same install', function () {
    $u = User::factory()->create(['password' => 'correct-horse-1']);
    $u->forceFill(['plan_id' => Plan::default()->id])->save();
    $install = fake()->uuid();
    $login = fn (string $id) => $this->postJson('/api/v1/auth/login', creds(['install_id' => $id, 'email' => $u->email, 'password' => 'correct-horse-1']));
    $login($install)->assertOk();
    $login($install)->assertOk();
    $login(fake()->uuid())->assertStatus(409);
    expect($u->devices()->count())->toBe(1);
});

it('lets a user rename and remove only their own devices', function () {
    $a = User::factory()->create(['password' => 'correct-horse-1']);
    $a->forceFill(['plan_id' => Plan::default()->id])->save();
    $token = $this->postJson('/api/v1/auth/login', creds(['email' => $a->email, 'password' => 'correct-horse-1']))->json('token');
    $device = $a->devices()->first();
    $other = Device::factory()->create();

    $this->withToken($token)->patchJson("/api/v1/devices/{$device->id}", ['name' => 'Laptop'])->assertOk();
    expect($device->fresh()->name)->toBe('Laptop');
    $this->withToken($token)->deleteJson("/api/v1/devices/{$other->id}")->assertNotFound();
    $this->withToken($token)->deleteJson("/api/v1/devices/{$device->id}")->assertOk();
    expect($a->devices()->count())->toBe(0);
});

it('returns entitlements from the plan', function () {
    $u = User::factory()->create();
    $u->forceFill(['plan_id' => Plan::default()->id])->save();
    $this->actingAs($u, 'sanctum')->getJson('/api/v1/entitlements')->assertOk()
        ->assertJsonPath('plan', 'free')->assertJsonPath('limits.devices', 1);
});

it('signs in with a verified Google token only', function () {
    config(['services.google.client_id' => 'cid']);
    Http::fake(['oauth2.googleapis.com/*' => Http::sequence()
        ->push(['aud' => 'cid', 'sub' => 'g1', 'email' => 'g@example.com', 'email_verified' => 'true', 'name' => 'G'])
        ->push(['aud' => 'other', 'sub' => 'g2', 'email' => 'h@example.com', 'email_verified' => 'true'])]);
    $this->postJson('/api/v1/auth/google', creds(['id_token' => 'x']))->assertOk()->assertJsonPath('user.email', 'g@example.com');
    expect(User::where('email', 'g@example.com')->first()->email_verified_at)->not->toBeNull();
    $this->postJson('/api/v1/auth/google', creds(['id_token' => 'y']))->assertStatus(401);
});

it('rate limits login attempts', function () {
    foreach (range(1, 10) as $_) {
        $this->postJson('/api/v1/auth/login', creds(['email' => 'a@example.com', 'password' => 'x']));
    }
    $this->postJson('/api/v1/auth/login', creds(['email' => 'a@example.com', 'password' => 'x']))->assertStatus(429);
});

it('closes registration when sign-ups are disabled', function () {
    config(['frameloom.signups_enabled' => false]);
    $this->postJson('/api/v1/auth/register', creds(['name' => 'A', 'email' => 'a@example.com', 'password' => 'correct-horse-1']))->assertStatus(403);
});

it('resets a password and revokes tokens', function () {
    $u = User::factory()->create(['password' => 'correct-horse-1']);
    $u->createToken('x');
    $token = Password::createToken($u);
    $this->postJson('/api/v1/auth/reset-password', ['email' => $u->email, 'token' => $token, 'password' => 'brand-new-pass-2'])->assertOk();
    expect($u->tokens()->count())->toBe(0);
    $this->postJson('/api/v1/auth/reset-password', ['email' => $u->email, 'token' => 'bad', 'password' => 'brand-new-pass-3'])->assertStatus(422);
});
