<?php

namespace App\Filament\Resources\LegalPages;

use App\Filament\Resources\LegalPages\Pages\EditLegalPage;
use App\Filament\Resources\LegalPages\Pages\ListLegalPages;
use App\Models\LegalPage;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class LegalPageResource extends Resource
{
    protected static ?string $model = LegalPage::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedScale;

    protected static ?string $navigationLabel = 'Legal pages';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canEdit($record): bool
    {
        return in_array(auth()->user()?->role, ['super_admin', 'editor'], true);
    }

    public static function canDelete($record): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('title')->required(),
            Textarea::make('body')->required()->rows(18)->helperText('Markdown. Raw HTML is removed. Published at /'.'{slug}.'),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table->columns([TextColumn::make('slug'), TextColumn::make('title'), TextColumn::make('updated_at')->dateTime()])->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return ['index' => ListLegalPages::route('/'), 'edit' => EditLegalPage::route('/{record}/edit')];
    }
}
