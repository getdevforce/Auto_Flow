<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Resources\Users\UserResource;
use Filament\Resources\Pages\ListRecords;

class ListUsers extends ListRecords
{
    use ExportsCsv;

    protected static string $resource = UserResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction()];
    }
}
