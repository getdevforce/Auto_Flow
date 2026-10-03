<?php

namespace App\Filament\Concerns;

use App\Models\AuditLog;
use App\Services\RemoteConfigPublisher;
use Filament\Actions\Action;
use Filament\Notifications\Notification;

/** The "Publish to extensions" header action shared by every content list that feeds remote config. */
trait PublishesRemoteConfig
{
    protected function publishAction(): Action
    {
        return Action::make('publish')->label('Publish to extensions')
            ->visible(fn () => in_array(auth()->user()?->role, ['super_admin', 'editor'], true))
            ->requiresConfirmation()
            ->modalDescription('Creates a new remote-config version from everything currently published. Extensions pick it up on their next fetch.')
            ->action(function () {
                $v = app(RemoteConfigPublisher::class)->publish();
                AuditLog::record('config.published', null, ['version' => $v->version]);
                Notification::make()->title("Published config v{$v->version}")->success()->send();
            });
    }
}
