<?php

namespace App\Filament\Resources\Dialects\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Concerns\PublishesRemoteConfig;
use App\Filament\Resources\Dialects\DialectResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListDialects extends ListRecords
{
    use ExportsCsv;
    use PublishesRemoteConfig;

    protected static string $resource = DialectResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction(), $this->publishAction(), CreateAction::make()];
    }
}
