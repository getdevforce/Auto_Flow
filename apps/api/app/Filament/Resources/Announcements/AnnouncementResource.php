<?php

namespace App\Filament\Resources\Announcements;

use App\Filament\Resources\Announcements\Pages\CreateAnnouncement;
use App\Filament\Resources\Announcements\Pages\EditAnnouncement;
use App\Filament\Resources\Announcements\Pages\ListAnnouncements;
use App\Models\Announcement;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
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

class AnnouncementResource extends Resource
{
    protected static ?string $model = Announcement::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMegaphone;

    protected static ?string $navigationLabel = 'Announcements';

    /** @return list<string> */
    public static function editRoles(): array
    {
        return ['super_admin', 'editor', 'support'];
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
            Section::make('Announcement')->columns(2)->schema([
                TextInput::make('key')->required()->alphaDash()->unique(ignoreRecord: true)->helperText('Stable id; dismissals are remembered per key.'),
                Select::make('status')->options(['draft' => 'Draft', 'published' => 'Published'])->default('draft')->required(),
                TextInput::make('content.en.title')->label('Title (English)')->required()->columnSpanFull(),
                Textarea::make('content.en.body')->label('Body (English)')->rows(3)->columnSpanFull(),
                TextInput::make('content.ur.title')->label('Title (Urdu, optional)')->columnSpanFull(),
                Textarea::make('content.ur.body')->label('Body (Urdu, optional)')->rows(3)->columnSpanFull(),
                TagsInput::make('plans')->helperText('Plan slugs. Empty means every plan.'),
                TagsInput::make('countries')->helperText('ISO country codes. Empty means everywhere.'),
                TextInput::make('min_version'), TextInput::make('max_version'),
                DateTimePicker::make('starts_at'), DateTimePicker::make('ends_at'),
                Toggle::make('dismissible')->default(true),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([TextColumn::make('key')->searchable(), TextColumn::make('status')->badge()->color(fn (string $state) => $state === 'published' ? 'success' : 'gray'), TextColumn::make('starts_at')->dateTime(), TextColumn::make('ends_at')->dateTime()])
            ->filters([SelectFilter::make('status')->options(['draft' => 'Draft', 'published' => 'Published'])])
            ->recordActions([EditAction::make(), DeleteAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListAnnouncements::route('/'),
            'create' => CreateAnnouncement::route('/create'),
            'edit' => EditAnnouncement::route('/{record}/edit'),
        ];
    }
}
