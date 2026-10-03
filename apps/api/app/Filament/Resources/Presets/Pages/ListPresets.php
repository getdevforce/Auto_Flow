<?php

namespace App\Filament\Resources\Presets\Pages;

use App\Filament\Concerns\PublishesRemoteConfig;
use App\Filament\Resources\Presets\PresetResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListPresets extends ListRecords
{
    use PublishesRemoteConfig;

    protected static string $resource = PresetResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->publishAction(), CreateAction::make()];
    }
}
