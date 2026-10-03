<?php

namespace App\Filament\Resources\Presets\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Concerns\PublishesRemoteConfig;
use App\Filament\Resources\Presets\PresetResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListPresets extends ListRecords
{
    use ExportsCsv;
    use PublishesRemoteConfig;

    protected static string $resource = PresetResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction(), $this->publishAction(), CreateAction::make()];
    }
}
