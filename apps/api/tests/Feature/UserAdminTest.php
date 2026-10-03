<?php

use App\Filament\Resources\AuditLogs\AuditLogResource;
use App\Filament\Resources\Plans\Pages\EditPlan;
use App\Filament\Resources\Plans\PlanResource;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Users\Pages\ViewUser;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\Plan;
use App\Models\User;
use App\Services\UserAdmin;
use Database\Seeders\DefaultPlansSeeder;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

beforeEach(fn () => $this->seed(DefaultPlansSeeder::class));

function staffAs(string $role): User
{
    $u = User::factory()->create();
    $u->forceFill(['role' => $role])->save();

    return $u;
}
function customer(array $over = []): User
{
    $u = User::factory()->create($over);
    $u->forceFill(['plan_id' => Plan::default()->id])->save();

    return $u;
}

it('searches and filters customers, hiding staff accounts', function () {
    $a = customer(['name' => 'Ada Voss', 'email' => 'ada@example.com']);
    $b = customer(['name' => 'Ben Okoro', 'email' => 'ben@example.com']);
    $b->forceFill(['suspended_at' => now()])->save();
    $staff = staffAs('support');
    $this->actingAs($staff);
    $table = Livewire::test(ListUsers::class);
    $table->assertCanSeeTableRecords([$a, $b])->assertCanNotSeeTableRecords([$staff]);
    Livewire::test(ListUsers::class)->searchTable('ada@example')->assertCanSeeTableRecords([$a])->assertCanNotSeeTableRecords([$b]);
    Livewire::test(ListUsers::class)->filterTable('suspended_at', true)->assertCanSeeTableRecords([$b])->assertCanNotSeeTableRecords([$a]);
});

it('lets support change plan, grant bonus runs, and audits both', function () {
    $user = customer();
    $pro = Plan::where('slug', 'pro')->first();
    $this->actingAs(staffAs('support'));
    Livewire::test(ViewUser::class, ['record' => $user->getKey()])
        ->callAction('changePlan', ['plan_id' => $pro->id])->assertHasNoActionErrors()
        ->callAction('grantBonus', ['runs' => 5])->assertHasNoActionErrors();
    expect($user->fresh())->plan_id->toBe($pro->id)->bonus_runs->toBe(5);
    expect(AuditLog::orderBy('id')->pluck('action')->all())->toBe(['user.plan_changed', 'user.bonus_granted']);
    $first = AuditLog::orderBy('id')->first();
    expect($first->meta)->toBe(['from' => 'free', 'to' => 'pro'])->and($first->actor_label)->toContain('@');
});

it('suspends with a reason, signs the user out, and blocks the API token and login', function () {
    $user = customer(['password' => 'correct-horse-1']);
    $token = $user->createToken('x')->plainTextToken;
    $this->actingAs(staffAs('super_admin'));
    Livewire::test(ViewUser::class, ['record' => $user->getKey()])->callAction('suspend', ['reason' => 'Chargeback abuse']);
    expect($user->fresh())->suspend_reason->toBe('Chargeback abuse')->suspended_at->not->toBeNull()->and($user->tokens()->count())->toBe(0);
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/v1/me')->assertStatus(401);
    $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'correct-horse-1', 'install_id' => fake()->uuid(), 'device_name' => 'x'])->assertStatus(403)->assertJsonPath('error.code', 'suspended');
    // A token minted before suspension but still stored is also refused by the middleware.
    $u2 = customer();
    $t2 = $u2->createToken('y')->plainTextToken;
    $u2->forceFill(['suspended_at' => now()])->save();
    $this->withToken($t2)->getJson('/api/v1/me')->assertStatus(403)->assertJsonPath('error.code', 'suspended');
});

it('forces logout, exports data and deletes an account with its data', function () {
    $user = customer();
    $user->createToken('a');
    Device::factory()->create(['user_id' => $user->id, 'name' => 'Laptop']);
    $user->notes()->create(['body' => 'Asked about refunds']);
    DB::table('telemetry_events')->insert(['install_id' => fake()->uuid(), 'user_id' => $user->id, 'name' => 'app_opened', 'props' => '{}', 'occurred_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    $this->actingAs(staffAs('super_admin'));

    Livewire::test(ViewUser::class, ['record' => $user->getKey()])->callAction('forceLogout')->assertHasNoActionErrors();
    expect($user->tokens()->count())->toBe(0);

    Livewire::test(ViewUser::class, ['record' => $user->getKey()])->callAction('export')->assertFileDownloaded("user-{$user->id}.json");
    $export = app(UserAdmin::class)->export($user);
    expect($export['devices'][0]['name'])->toBe('Laptop')->and($export['notes'][0]['body'])->toBe('Asked about refunds')->and($export['telemetry_events'])->toHaveCount(1)->and($export['profile'])->not->toHaveKey('password');

    Livewire::test(ViewUser::class, ['record' => $user->getKey()])->callAction('delete');
    expect(User::find($user->id))->toBeNull()->and(Device::where('user_id', $user->id)->count())->toBe(0)->and(DB::table('telemetry_events')->count())->toBe(0);
    $del = AuditLog::where('action', 'user.deleted')->first();
    expect($del->meta['email_hash'])->toBe(hash('sha256', strtolower($user->email)))->and(json_encode($del->meta))->not->toContain($user->email);
});

it('keeps editors and analysts from acting on accounts, and only super admins may delete', function (string $role, bool $canAct) {
    $user = customer();
    $this->actingAs(staffAs($role));
    $page = Livewire::test(ViewUser::class, ['record' => $user->getKey()])->assertSuccessful();
    foreach (['changePlan', 'grantBonus', 'suspend', 'forceLogout', 'export'] as $a) {
        $canAct ? $page->assertActionVisible($a) : $page->assertActionHidden($a);
    }
    $role === 'super_admin' ? $page->assertActionVisible('delete') : $page->assertActionHidden('delete');
})->with([['super_admin', true], ['support', true], ['editor', false], ['analyst', false]]);

it('shows usage as the user sees it without any credential', function () {
    $user = customer();
    DB::table('telemetry_events')->insert(['install_id' => fake()->uuid(), 'user_id' => $user->id, 'name' => 'autopilot_started', 'props' => '{}', 'occurred_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    $usage = app(UserAdmin::class)->usageAsUser($user);
    expect($usage)->toMatchArray(['plan' => 'Free', 'runs_this_month' => 1, 'devices' => 0])->and($usage['limits']['runs_per_month'])->toBe(3);
    $this->actingAs(staffAs('analyst'));
    Livewire::test(ViewUser::class, ['record' => $user->getKey()])->assertSee('Usage as the user sees it')->assertSee('1 of 3')->assertDontSee($user->password);
});

it('makes the audit log append-only', function () {
    $log = AuditLog::record('test.action');
    expect(fn () => $log->update(['action' => 'changed']))->toThrow(LogicException::class)
        ->and(fn () => $log->delete())->toThrow(LogicException::class);
    expect(AuditLog::find($log->id)->action)->toBe('test.action');
});

it('limits who can see the audit log', function () {
    foreach ([['super_admin', true], ['analyst', true], ['support', false], ['editor', false]] as [$role, $ok]) {
        $this->actingAs(staffAs($role));
        expect(AuditLogResource::canViewAny())->toBe($ok);
    }
});

it('lets only a super admin edit plan limits, takes effect through the API, and keeps one default', function () {
    $free = Plan::where('slug', 'free')->first();
    $user = customer();
    $this->actingAs(staffAs('support'));
    expect(PlanResource::canEdit($free))->toBeFalse();

    $admin = staffAs('super_admin');
    $this->actingAs($admin);
    Livewire::test(EditPlan::class, ['record' => $free->getKey()])->fillForm(['limits.runs_per_month' => 9, 'limits.devices' => 2])->call('save')->assertHasNoFormErrors();
    $this->actingAs($user, 'sanctum')->getJson('/api/v1/entitlements')->assertJsonPath('limits.runs_per_month', 9)->assertJsonPath('limits.devices', 2);

    $pro = Plan::where('slug', 'pro')->first();
    $this->actingAs($admin);
    Livewire::test(EditPlan::class, ['record' => $pro->getKey()])->fillForm(['is_default' => true])->call('save');
    expect(Plan::where('is_default', true)->count())->toBe(1)->and($pro->fresh()->is_default)->toBeTrue();
    expect(AuditLog::where('action', 'plan.updated')->count())->toBe(2);
});
