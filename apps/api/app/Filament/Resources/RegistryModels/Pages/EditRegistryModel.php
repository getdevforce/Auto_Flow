<?php

namespace App\Filament\Resources\RegistryModels\Pages;

use App\Filament\Resources\RegistryModels\RegistryModelResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditRegistryModel extends EditRecord
{
    protected static string $resource = RegistryModelResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
