<?php

namespace App\Filament\Resources\Support;

use App\Filament\Resources\Support\Pages\EditReport;
use App\Filament\Resources\Support\Pages\ListReports;
use App\Filament\Resources\Support\RelationManagers\NotesRelationManager;
use App\Models\FeedbackReport;
use App\Models\User;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class SupportResource extends Resource
{
    protected static ?string $model = FeedbackReport::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedInboxArrowDown;

    protected static ?string $navigationLabel = 'Support inbox';

    protected static ?string $modelLabel = 'report';

    public static function canAct(): bool
    {
        return in_array(auth()->user()?->role, ['super_admin', 'support'], true);
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canEdit($record): bool
    {
        return static::canAct();
    }

    public static function canDelete($record): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make('Report')->columns(2)->schema([
                Select::make('status')->options(['open' => 'Open', 'pending' => 'Waiting on user', 'closed' => 'Closed'])->required(),
                Select::make('assignee_id')->label('Assignee')->options(fn () => User::whereIn('role', ['super_admin', 'support'])->pluck('name', 'id')->all())->searchable(),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('created_at')->dateTime()->sortable()->label('Received'),
                TextColumn::make('type')->badge(),
                TextColumn::make('message')->limit(60)->placeholder('Error report'),
                TextColumn::make('context.error_code')->label('Error'),
                TextColumn::make('email')->placeholder('No email'),
                TextColumn::make('status')->badge()->color(fn (string $state) => match ($state) {
                    'open' => 'danger', 'pending' => 'warning', default => 'gray'
                }),
                TextColumn::make('assignee.name')->placeholder('Unassigned'),
            ])
            ->defaultSort('id', 'desc')
            ->filters([
                SelectFilter::make('status')->options(['open' => 'Open', 'pending' => 'Waiting on user', 'closed' => 'Closed']),
                SelectFilter::make('type')->options(['feedback' => 'Feedback', 'error_report' => 'Error report']),
                SelectFilter::make('assignee_id')->label('Assignee')->options(fn () => User::whereIn('role', ['super_admin', 'support'])->pluck('name', 'id')->all()),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getRelations(): array
    {
        return [NotesRelationManager::class];
    }

    public static function getPages(): array
    {
        return ['index' => ListReports::route('/'), 'edit' => EditReport::route('/{record}/edit')];
    }
}
