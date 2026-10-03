<?php

namespace App\Filament\Resources\Presets\Pages;

use App\Filament\Resources\Presets\PresetResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditPreset extends EditRecord
{
    protected static string $resource = PresetResource::class;

    protected function getHeaderActions(): array
    {
        return [DeleteAction::make()];
    }
}
