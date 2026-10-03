<?php

namespace App\Filament\Concerns;

use App\Enums\StaffRole;
use App\Models\User;

/** Role gate for resources. Override $editRoles per resource; every staff role may view unless narrowed. */
trait ChecksStaffRole
{
    /** @return list<StaffRole> */
    protected static function editRoles(): array
    {
        return [StaffRole::SuperAdmin, StaffRole::Editor];
    }

    protected static function currentRole(): ?StaffRole
    {
        /** @var User|null $user */
        $user = auth()->user();

        return $user?->role ? StaffRole::tryFrom($user->role) : null;
    }

    public static function canCreate(): bool
    {
        return in_array(static::currentRole(), static::editRoles(), true);
    }

    public static function canEdit($record): bool
    {
        return in_array(static::currentRole(), static::editRoles(), true);
    }

    public static function canDelete($record): bool
    {
        return in_array(static::currentRole(), static::editRoles(), true);
    }

    public static function canDeleteAny(): bool
    {
        return in_array(static::currentRole(), static::editRoles(), true);
    }
}
