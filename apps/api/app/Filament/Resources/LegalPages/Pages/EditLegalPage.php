<?php

namespace App\Filament\Resources\LegalPages\Pages;

use App\Filament\Resources\LegalPages\LegalPageResource;
use App\Models\AuditLog;
use Filament\Resources\Pages\EditRecord;

class EditLegalPage extends EditRecord
{
    protected static string $resource = LegalPageResource::class;

    protected function afterSave(): void
    {
        AuditLog::record('legal_page.updated', $this->record, ['slug' => $this->record->slug]);
    }
}
