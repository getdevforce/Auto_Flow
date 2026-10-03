<?php

namespace App\Filament\Resources\Releases;

use App\Filament\Resources\Releases\Pages\CreateRelease;
use App\Filament\Resources\Releases\Pages\EditRelease;
use App\Filament\Resources\Releases\Pages\ListReleases;
use App\Models\Release;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class ReleaseResource extends Resource
{
    protected static ?string $model = Release::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRocketLaunch;

    protected static ?string $navigationLabel = 'Releases';

    /** @return list<string> */
    public static function editRoles(): array
    {
        return ['super_admin'];
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
            Section::make('Release')->columns(2)->schema([
                TextInput::make('version')->required()->unique(ignoreRecord: true)->placeholder('1.2.0'),
                DateTimePicker::make('released_at'),
                Toggle::make('is_current')->label('Current version'),
                Toggle::make('is_minimum_supported')->label('Minimum supported version')->helperText('Older extensions are told to update.'),
                TextInput::make('force_update_message')->maxLength(300)->columnSpanFull(),
                Textarea::make('changelog')->rows(6)->columnSpanFull(),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([TextColumn::make('version')->searchable(), IconColumn::make('is_current')->boolean()->label('Current'), IconColumn::make('is_minimum_supported')->boolean()->label('Minimum'), TextColumn::make('released_at')->dateTime()])
            ->filters([])
            ->recordActions([EditAction::make(), DeleteAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListReleases::route('/'),
            'create' => CreateRelease::route('/create'),
            'edit' => EditRelease::route('/{record}/edit'),
        ];
    }
}
