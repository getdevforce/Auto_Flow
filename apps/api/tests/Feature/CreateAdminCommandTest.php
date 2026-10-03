<?php

use App\Models\User;
use Database\Seeders\DefaultPlansSeeder;

beforeEach(fn () => $this->seed(DefaultPlansSeeder::class));

it('creates a super admin who can open the panel', function () {
    $this->artisan('frameloom:create-admin', ['email' => 'boss@example.com', '--password' => 'long-enough-password-1'])->assertSuccessful();
    $u = User::where('email', 'boss@example.com')->first();
    expect($u->role)->toBe('super_admin')->and($u->email_verified_at)->not->toBeNull();
    $this->actingAs($u)->get('/admin')->assertOk();
});

it('refuses weak passwords and unknown roles, and updates an existing account in place', function () {
    $this->artisan('frameloom:create-admin', ['email' => 'a@example.com', '--password' => 'short'])->assertFailed();
    $this->artisan('frameloom:create-admin', ['email' => 'a@example.com', '--password' => 'long-enough-password-1', '--role' => 'owner'])->assertFailed();
    $this->artisan('frameloom:create-admin', ['email' => 'a@example.com', '--password' => 'long-enough-password-1', '--role' => 'analyst'])->assertSuccessful();
    $this->artisan('frameloom:create-admin', ['email' => 'a@example.com', '--password' => 'another-long-password-2', '--role' => 'editor'])->assertSuccessful();
    expect(User::where('email', 'a@example.com')->count())->toBe(1)->and(User::where('email', 'a@example.com')->value('role'))->toBe('editor');
});
