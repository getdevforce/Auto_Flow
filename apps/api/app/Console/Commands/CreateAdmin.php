<?php

namespace App\Console\Commands;

use App\Enums\StaffRole;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class CreateAdmin extends Command
{
    protected $signature = 'frameloom:create-admin {email} {--name=Admin} {--role=super_admin : super_admin, editor, support or analyst} {--password= : Leave empty to be asked}';

    protected $description = 'Create or update a staff account for the admin panel';

    public function handle(): int
    {
        $role = StaffRole::tryFrom((string) $this->option('role'));
        if (! $role) {
            $this->error('Role must be one of: super_admin, editor, support, analyst.');

            return self::FAILURE;
        }
        $password = $this->option('password') ?: $this->secret('Password (at least 12 characters)');
        if (strlen((string) $password) < 12) {
            $this->error('Use a password of at least 12 characters.');

            return self::FAILURE;
        }
        $user = User::firstOrNew(['email' => $this->argument('email')]);
        $user->name = $user->exists ? $user->name : (string) $this->option('name');
        $user->password = Hash::make($password);
        $user->email_verified_at ??= now();
        $user->plan_id ??= Plan::where('is_default', true)->value('id');
        $user->forceFill(['role' => $role->value])->save();
        $this->info("{$role->value} account ready for {$user->email}. Sign in at /admin.");

        return self::SUCCESS;
    }
}
