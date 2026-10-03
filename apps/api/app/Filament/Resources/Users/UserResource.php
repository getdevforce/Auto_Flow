<?php

namespace App\Filament\Resources\Users;

use App\Enums\StaffRole;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Users\Pages\ViewUser;
use App\Filament\Resources\Users\RelationManagers\DevicesRelationManager;
use App\Filament\Resources\Users\RelationManagers\NotesRelationManager;
use App\Models\Plan;
use App\Models\User;
use BackedEnum;
use Filament\Actions\ViewAction;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUsers;

    protected static ?string $navigationLabel = 'Customers';

    /** Staff accounts are managed separately; this list is customers only. */
    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()->whereNull('role')->with('plan');
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canEdit($record): bool
    {
        return false;
    }

    public static function canDelete($record): bool
    {
        return false;
    }

    public static function canViewAny(): bool
    {
        return true;
    }

    public static function canExport(): bool
    {
        return static::canAct();
    }

    /** Roles that may act on accounts. Editors and analysts can look but not touch. */
    public static function canAct(): bool
    {
        $role = auth()->user()?->role;

        return in_array($role, [StaffRole::SuperAdmin->value, StaffRole::Support->value], true);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')->searchable()->sortable(),
                TextColumn::make('email')->searchable()->sortable()->copyable(),
                TextColumn::make('plan.name')->label('Plan')->placeholder('Default'),
                IconColumn::make('email_verified_at')->label('Verified')->boolean()->getStateUsing(fn (User $r) => $r->email_verified_at !== null),
                IconColumn::make('suspended_at')->label('Suspended')->boolean()->getStateUsing(fn (User $r) => $r->suspended_at !== null)->trueColor('danger')->falseColor('gray'),
                TextColumn::make('created_at')->dateTime()->sortable()->label('Signed up'),
            ])
            ->defaultSort('created_at', 'desc')
            ->filters([
                SelectFilter::make('plan_id')->label('Plan')->options(fn () => Plan::pluck('name', 'id')->all()),
                TernaryFilter::make('suspended_at')->label('Suspended')->nullable(),
                TernaryFilter::make('email_verified_at')->label('Email verified')->nullable(),
            ])
            ->recordActions([ViewAction::make()]);
    }

    public static function getRelations(): array
    {
        return [DevicesRelationManager::class, NotesRelationManager::class];
    }

    public static function getPages(): array
    {
        return ['index' => ListUsers::route('/'), 'view' => ViewUser::route('/{record}')];
    }
}
