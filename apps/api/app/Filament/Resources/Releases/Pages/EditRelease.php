<?php

namespace App\Filament\Resources\Releases\Pages;

use App\Filament\Resources\Releases\ReleaseResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditRelease extends EditRecord
{
    protected static string $resource = ReleaseResource::class;

    protected function getHeaderActions(): array
    {
        return [DeleteAction::make()];
    }
}
