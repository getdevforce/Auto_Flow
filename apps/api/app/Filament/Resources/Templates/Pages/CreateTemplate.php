<?php

namespace App\Filament\Resources\Templates\Pages;

use App\Filament\Resources\Templates\TemplateResource;
use Filament\Resources\Pages\CreateRecord;

class CreateTemplate extends CreateRecord
{
    protected static string $resource = TemplateResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        if (($data['status'] ?? null) === 'published') {
            $data['published_at'] = now();
        }

        return $data;
    }
}
