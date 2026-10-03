<?php

namespace App\Filament\Resources\Templates\Pages;

use App\Filament\Resources\Templates\TemplateResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditTemplate extends EditRecord
{
    protected static string $resource = TemplateResource::class;

    protected function getHeaderActions(): array
    {
        return [DeleteAction::make()];
    }

    protected function beforeSave(): void
    {
        // Snapshot what is about to be replaced so an editor can restore it.
        $this->record->snapshot(auth()->id());
    }

    protected function mutateFormDataBeforeSave(array $data): array
    {
        if (($data['status'] ?? null) === 'published' && ! $this->record->published_at) {
            $data['published_at'] = now();
        }

        return $data;
    }
}
