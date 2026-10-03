<?php

namespace App\Filament\Resources\Dialects\Pages;

use App\Filament\Concerns\PublishesRemoteConfig;
use App\Filament\Resources\Dialects\DialectResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListDialects extends ListRecords
{
    use PublishesRemoteConfig;

    protected static string $resource = DialectResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->publishAction(), CreateAction::make()];
    }
}
