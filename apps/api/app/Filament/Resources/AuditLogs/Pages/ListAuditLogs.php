<?php

namespace App\Filament\Resources\AuditLogs\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Resources\AuditLogs\AuditLogResource;
use Filament\Resources\Pages\ListRecords;

class ListAuditLogs extends ListRecords
{
    use ExportsCsv;

    protected static string $resource = AuditLogResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction()];
    }
}
