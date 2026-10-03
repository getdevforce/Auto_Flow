<?php

namespace App\Filament\Resources\LegalPages\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Resources\LegalPages\LegalPageResource;
use Filament\Resources\Pages\ListRecords;

class ListLegalPages extends ListRecords
{
    use ExportsCsv;

    protected static string $resource = LegalPageResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction()];
    }
}
