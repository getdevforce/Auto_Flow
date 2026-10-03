<?php

namespace App\Filament\Resources\FeatureFlags;

use App\Filament\Resources\FeatureFlags\Pages\CreateFeatureFlag;
use App\Filament\Resources\FeatureFlags\Pages\EditFeatureFlag;
use App\Filament\Resources\FeatureFlags\Pages\ListFeatureFlags;
use App\Models\FeatureFlag;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class FeatureFlagResource extends Resource
{
    protected static ?string $model = FeatureFlag::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedFlag;

    protected static ?string $navigationLabel = 'Feature flags';

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
            Section::make('Flag')->columns(2)->schema([
                TextInput::make('key')->required()->alphaDash()->unique(ignoreRecord: true),
                TextInput::make('description'),
                Toggle::make('enabled'),
                TextInput::make('rollout_percent')->numeric()->minValue(0)->maxValue(100)->default(100)->suffix('%')->helperText('Stable per install: raising it only adds installs.'),
                TagsInput::make('plans')->helperText('Plan slugs. Empty means every plan.')->columnSpanFull(),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([TextColumn::make('key')->searchable(), IconColumn::make('enabled')->boolean(), TextColumn::make('rollout_percent')->suffix('%'), TextColumn::make('plans')->badge()])
            ->filters([])
            ->recordActions([EditAction::make(), DeleteAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListFeatureFlags::route('/'),
            'create' => CreateFeatureFlag::route('/create'),
            'edit' => EditFeatureFlag::route('/{record}/edit'),
        ];
    }
}
