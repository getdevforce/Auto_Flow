<?php

namespace App\Filament\Resources\Support\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Resources\Support\SupportResource;
use Filament\Resources\Pages\ListRecords;

class ListReports extends ListRecords
{
    use ExportsCsv;

    protected static string $resource = SupportResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction()];
    }
}
