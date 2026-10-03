<?php

namespace App\Filament\Resources\RegistryModels\Schemas;

use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class RegistryModelForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->components([
            Section::make('Model')->columns(2)->schema([
                Select::make('provider_id')->relationship('provider', 'label')->required()
                    ->createOptionForm([
                        TextInput::make('slug')->required()->unique('registry_providers', 'slug'),
                        TextInput::make('label')->required(),
                        TagsInput::make('kinds')->required()->suggestions(['text', 'image', 'video', 'upscale', 'voice']),
                    ]),
                TextInput::make('model_id')->label('Model ID')->required()->maxLength(120),
                Select::make('kind')->options(['text' => 'Text', 'image' => 'Image', 'video' => 'Video', 'upscale' => 'Upscale', 'voice' => 'Voice'])->required(),
                TextInput::make('label')->required(),
                Toggle::make('enabled')->default(true),
                Toggle::make('deprecated')->helperText('Shown as retired in the extension; still usable until disabled.'),
            ]),
            Section::make('Approximate price')->columns(2)->schema([
                TextInput::make('price_usd')->numeric()->prefix('$')->label('USD per unit'),
                TextInput::make('price_unit')->placeholder('second, image, 1k tokens')->maxLength(32),
                TextInput::make('dialect_version')->maxLength(32),
            ]),
            Section::make('Capabilities')->columns(2)->schema([
                TextInput::make('capabilities.maxReferenceImages')->numeric()->default(0)->label('Max reference images'),
                TagsInput::make('capabilities.ratios')->placeholder('16:9'),
                TagsInput::make('capabilities.durationsSec')->label('Durations (s)'),
                TagsInput::make('capabilities.resolutions')->placeholder('720p'),
                TagsInput::make('capabilities.upscaleFactors')->label('Upscale factors'),
                Toggle::make('capabilities.firstLastFrame')->label('First/last frame'),
                Toggle::make('capabilities.identityTraining')->label('Identity training'),
                Toggle::make('capabilities.lipSync')->label('Lip-sync'),
            ]),
        ]);
    }
}
