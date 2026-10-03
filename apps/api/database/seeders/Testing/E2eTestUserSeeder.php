<?php

namespace Database\Seeders\Testing;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Seeder;

/** Only used by the extension e2e suite. Never run in production. */
class E2eTestUserSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::create(['name' => 'E2E User', 'email' => 'e2e@example.com', 'password' => 'e2e-password-1']);
        $user->forceFill(['plan_id' => Plan::default()->id, 'email_verified_at' => now()])->save();
    }
}
