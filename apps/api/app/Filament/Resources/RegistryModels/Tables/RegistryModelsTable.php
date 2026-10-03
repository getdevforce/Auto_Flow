<?php

namespace App\Filament\Resources\RegistryModels\Tables;

use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class RegistryModelsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('provider.label')->sortable()->searchable(),
                TextColumn::make('model_id')->label('Model ID')->searchable(),
                TextColumn::make('kind')->badge(),
                TextColumn::make('price_usd')->money('USD')->label('Price'),
                IconColumn::make('enabled')->boolean(),
                IconColumn::make('deprecated')->boolean(),
            ])
            ->filters([SelectFilter::make('kind')->options(['text' => 'Text', 'image' => 'Image', 'video' => 'Video', 'upscale' => 'Upscale', 'voice' => 'Voice'])])
            ->recordActions([EditAction::make(), DeleteAction::make()]);
    }
}
