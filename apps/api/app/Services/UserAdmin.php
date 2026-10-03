<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Sensitive account actions. Each one writes to the audit log. */
class UserAdmin
{
    public function changePlan(User $user, Plan $plan): void
    {
        $from = $user->effectivePlan()->slug;
        $user->forceFill(['plan_id' => $plan->id])->save();
        AuditLog::record('user.plan_changed', $user, ['from' => $from, 'to' => $plan->slug]);
    }

    public function grantBonus(User $user, int $runs): void
    {
        $user->increment('bonus_runs', $runs);
        AuditLog::record('user.bonus_granted', $user, ['runs' => $runs]);
    }

    public function suspend(User $user, string $reason): void
    {
        $user->forceFill(['suspended_at' => now(), 'suspend_reason' => $reason])->save();
        $user->tokens()->delete();
        AuditLog::record('user.suspended', $user, ['reason' => $reason]);
    }

    public function unsuspend(User $user): void
    {
        $user->forceFill(['suspended_at' => null, 'suspend_reason' => null])->save();
        AuditLog::record('user.unsuspended', $user);
    }

    public function forceLogout(User $user): int
    {
        $n = $user->tokens()->delete();
        AuditLog::record('user.force_logout', $user, ['sessions' => $n]);

        return $n;
    }

    /** @return array<string, mixed> */
    public function export(User $user): array
    {
        AuditLog::record('user.exported', $user);

        return [
            'profile' => $user->only(['id', 'name', 'email', 'email_verified_at', 'created_at', 'bonus_runs']) + ['plan' => $user->effectivePlan()->slug],
            'devices' => $user->devices()->get(['name', 'extension_version', 'last_seen_at', 'created_at'])->toArray(),
            'notes' => $user->notes()->get(['body', 'created_at'])->toArray(),
            'telemetry_events' => DB::table('telemetry_events')->where('user_id', $user->id)->get(['name', 'props', 'occurred_at'])->toArray(),
            'template_ratings' => DB::table('template_ratings')->where('user_id', $user->id)->get(['template_id', 'stars'])->toArray(),
        ];
    }

    /** Removes the account and the data linked to it. Aggregates are anonymous and stay. */
    public function delete(User $user): void
    {
        $meta = ['email_hash' => hash('sha256', strtolower($user->email))];
        DB::transaction(function () use ($user) {
            DB::table('telemetry_events')->where('user_id', $user->id)->delete();
            DB::table('telemetry_active_daily')->where('user_id', $user->id)->update(['user_id' => null]);
            $user->tokens()->delete();
            $user->delete();
        });
        AuditLog::record('user.deleted', null, $meta + ['user_id' => $user->id]);
    }

    /**
     * Read-only view of what the user sees: plan limits and this month's usage. No credentials, no impersonation.
     *
     * @return array<string, mixed>
     */
    public function usageAsUser(User $user): array
    {
        $plan = $user->effectivePlan();
        $month = now()->startOfMonth();
        $count = fn (string $name) => (int) DB::table('telemetry_events')->where('user_id', $user->id)->where('name', $name)->where('occurred_at', '>=', $month)->count();

        return [
            'plan' => $plan->name, 'limits' => $plan->limits, 'bonus_runs' => $user->bonus_runs,
            'runs_this_month' => $count('autopilot_started'), 'generations_this_month' => $count('generation'), 'devices' => $user->devices()->count(),
        ];
    }
}
