<?php

namespace App\Filament\Resources\Dialects;

use App\Filament\Resources\Dialects\Pages\CreateDialect;
use App\Filament\Resources\Dialects\Pages\EditDialect;
use App\Filament\Resources\Dialects\Pages\ListDialects;
use App\Models\Dialect;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class DialectResource extends Resource
{
    protected static ?string $model = Dialect::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedLanguage;

    protected static ?string $navigationLabel = 'Prompt dialects';

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
            Section::make('Dialect')->columns(2)->schema([
                TextInput::make('slug')->required()->alphaDash()->unique(ignoreRecord: true),
                TextInput::make('version')->required()->default('1')->helperText('Bump when the wording changes so cached refinements are invalidated.'),
                TextInput::make('provider_id')->default('*')->required()->helperText('Provider id, or * for any.'),
                TextInput::make('model_pattern')->default('.')->required()->helperText('Regular expression matched against the model id.'),
                Select::make('kind')->options(['image' => 'Image', 'video' => 'Video'])->required()->default('video'),
                TextInput::make('max_chars')->numeric()->minValue(50)->required()->default(1200),
                Toggle::make('supports_negative')->default(true),
                Select::make('status')->options(['draft' => 'Draft', 'published' => 'Published'])->default('draft')->required(),
                Textarea::make('guidance')->required()->rows(5)->columnSpanFull(),
                TagsInput::make('fields')->label('Fields a good prompt covers')->columnSpanFull(),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([TextColumn::make('slug')->searchable(), TextColumn::make('provider_id'), TextColumn::make('model_pattern'), TextColumn::make('kind')->badge(), TextColumn::make('status')->badge()->color(fn (string $state) => $state === 'published' ? 'success' : 'gray')])
            ->filters([SelectFilter::make('status')->options(['draft' => 'Draft', 'published' => 'Published'])])
            ->recordActions([EditAction::make(), DeleteAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListDialects::route('/'),
            'create' => CreateDialect::route('/create'),
            'edit' => EditDialect::route('/{record}/edit'),
        ];
    }
}
