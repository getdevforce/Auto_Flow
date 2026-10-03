<?php

namespace App\Filament\Resources\Releases\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Concerns\PublishesRemoteConfig;
use App\Filament\Resources\Releases\ReleaseResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListReleases extends ListRecords
{
    use ExportsCsv;
    use PublishesRemoteConfig;

    protected static string $resource = ReleaseResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction(), $this->publishAction(), CreateAction::make()];
    }
}
