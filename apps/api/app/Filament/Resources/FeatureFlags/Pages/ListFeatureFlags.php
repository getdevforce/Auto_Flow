<?php

namespace App\Filament\Resources\FeatureFlags\Pages;

use App\Filament\Concerns\PublishesRemoteConfig;
use App\Filament\Resources\FeatureFlags\FeatureFlagResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListFeatureFlags extends ListRecords
{
    use PublishesRemoteConfig;

    protected static string $resource = FeatureFlagResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->publishAction(), CreateAction::make()];
    }
}
