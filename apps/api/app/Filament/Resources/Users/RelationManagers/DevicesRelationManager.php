<?php

namespace App\Filament\Resources\Users\RelationManagers;

use App\Filament\Resources\Users\UserResource;
use App\Models\AuditLog;
use App\Models\Device;
use Filament\Actions\Action;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class DevicesRelationManager extends RelationManager
{
    protected static string $relationship = 'devices';

    public function table(Table $table): Table
    {
        return $table
            ->columns([TextColumn::make('name'), TextColumn::make('extension_version')->label('Version'), TextColumn::make('last_seen_at')->dateTime()->label('Last seen')])
            ->recordActions([
                Action::make('remove')->visible(fn () => UserResource::canAct())->requiresConfirmation()->color('danger')
                    ->action(function (Device $record) {
                        $record->user->tokens()->where('name', $record->install_id)->delete();
                        AuditLog::record('device.removed', $record->user, ['device' => $record->name]);
                        $record->delete();
                    }),
            ]);
    }
}
