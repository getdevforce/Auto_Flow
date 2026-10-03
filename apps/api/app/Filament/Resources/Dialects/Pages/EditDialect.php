<?php

namespace App\Filament\Resources\Dialects\Pages;

use App\Filament\Resources\Dialects\DialectResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditDialect extends EditRecord
{
    protected static string $resource = DialectResource::class;

    protected function getHeaderActions(): array
    {
        return [DeleteAction::make()];
    }
}
