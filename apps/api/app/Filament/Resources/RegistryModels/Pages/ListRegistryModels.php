<?php

namespace App\Filament\Resources\RegistryModels\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Resources\RegistryModels\RegistryModelResource;
use App\Services\RemoteConfigPublisher;
use Filament\Actions\Action;
use Filament\Actions\CreateAction;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ListRecords;

class ListRegistryModels extends ListRecords
{
    use ExportsCsv;

    protected static string $resource = RegistryModelResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction(),
            Action::make('publish')
                ->label('Publish to extensions')
                ->visible(fn () => RegistryModelResource::canCreate())
                ->requiresConfirmation()
                ->modalDescription('Creates a new remote-config version with the enabled providers and models. Extensions pick it up on their next fetch.')
                ->action(function () {
                    $v = app(RemoteConfigPublisher::class)->publish();
                    Notification::make()->title("Published config v{$v->version}")->success()->send();
                }),
            CreateAction::make(),
        ];
    }
}
