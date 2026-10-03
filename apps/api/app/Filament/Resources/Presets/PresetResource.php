<?php

namespace App\Filament\Resources\Presets;

use App\Filament\Resources\Presets\Pages\CreatePreset;
use App\Filament\Resources\Presets\Pages\EditPreset;
use App\Filament\Resources\Presets\Pages\ListPresets;
use App\Models\Preset;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\KeyValue;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class PresetResource extends Resource
{
    protected static ?string $model = Preset::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedAdjustmentsHorizontal;

    protected static ?string $navigationLabel = 'Camera, effect and style presets';

    /** @return list<string> */
    public static function editRoles(): array
    {
        return ['super_admin', 'editor'];
    }

    public static function canCreate(): bool
    {
        return in_array(auth()->user()?->role, static::editRoles(), true);
    }

    public static function canEdit($record): bool
    {
        return in_array(auth()->user()?->role, static::editRoles(), true);
    }

    public static function canDelete($record): bool
    {
        return in_array(auth()->user()?->role, static::editRoles(), true);
    }

    public static function canDeleteAny(): bool
    {
        return in_array(auth()->user()?->role, static::editRoles(), true);
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make('Preset')->columns(2)->schema([
                TextInput::make('name')->required(),
                TextInput::make('slug')->required()->alphaDash()->unique(ignoreRecord: true)->helperText('Stable id, e.g. cam_orbit.'),
                Select::make('kind')->options(['camera' => 'Camera movement', 'effect' => 'Effect', 'style' => 'Style'])->required(),
                Select::make('status')->options(['draft' => 'Draft', 'published' => 'Published'])->default('draft')->required(),
                Textarea::make('prompt')->required()->rows(3)->columnSpanFull(),
                TagsInput::make('requires')->suggestions(['video', 'image', 'lipSync', 'firstLastFrame'])->helperText('Hidden for models without these capabilities.'),
                KeyValue::make('params')->label('Structured parameters'),
                TextInput::make('version')->numeric()->default(1),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([TextColumn::make('name')->searchable(), TextColumn::make('kind')->badge(), TextColumn::make('status')->badge()->color(fn (string $state) => $state === 'published' ? 'success' : 'gray'), TextColumn::make('version')])
            ->filters([SelectFilter::make('kind')->options(['camera' => 'Camera', 'effect' => 'Effect', 'style' => 'Style']), SelectFilter::make('status')->options(['draft' => 'Draft', 'published' => 'Published'])])
            ->recordActions([EditAction::make(), DeleteAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListPresets::route('/'),
            'create' => CreatePreset::route('/create'),
            'edit' => EditPreset::route('/{record}/edit'),
        ];
    }
}
