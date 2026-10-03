<?php

use App\Models\User;

it('shows the admin login page with the product name', function () {
    $this->get('/admin/login')->assertOk()->assertSee(config('brand.name'));
});

it('redirects guests away from the panel', function () {
    $this->get('/admin')->assertRedirect('/admin/login');
});

it('lets staff into the panel', function (string $role) {
    $user = User::factory()->create(['role' => null]);
    $user->forceFill(['role' => $role])->save();
    $this->actingAs($user)->get('/admin')->assertOk();
})->with(['super_admin', 'editor', 'support', 'analyst']);

it('keeps customers and suspended staff out', function () {
    $customer = User::factory()->create();
    $this->actingAs($customer)->get('/admin')->assertForbidden();

    $suspended = User::factory()->create();
    $suspended->forceFill(['role' => 'support', 'suspended_at' => now()])->save();
    $this->actingAs($suspended)->get('/admin')->assertForbidden();
});

it('does not allow role escalation through mass assignment', function () {
    $user = User::create(['name' => 'x', 'email' => 'x@example.com', 'password' => 'secret-pass', 'role' => 'super_admin']);
    expect($user->fresh()->role)->toBeNull();
});
