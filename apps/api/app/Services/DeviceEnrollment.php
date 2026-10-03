<?php

namespace App\Services;

use App\Models\Device;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class DeviceEnrollment
{
    /** Registers (or refreshes) an install for the user, enforcing the plan's device limit. */
    public function enroll(User $user, string $installId, string $name, ?string $version): Device
    {
        $existing = $user->devices()->where('install_id', $installId)->first();
        if ($existing) {
            $existing->update(['name' => $name, 'extension_version' => $version, 'last_seen_at' => now()]);

            return $existing;
        }

        $limit = $user->effectivePlan()->limit('devices', 1);
        if ($user->devices()->count() >= $limit) {
            throw ValidationException::withMessages([
                'device' => "This plan allows {$limit} device(s). Remove one in your account or upgrade.",
            ])->status(409);
        }

        return $user->devices()->create([
            'install_id' => $installId, 'name' => $name, 'extension_version' => $version, 'last_seen_at' => now(),
        ]);
    }
}
