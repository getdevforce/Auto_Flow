<?php

namespace App\Filament\Resources\Support\RelationManagers;

use App\Filament\Resources\Support\SupportResource;
use Filament\Actions\CreateAction;
use Filament\Forms\Components\Textarea;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class NotesRelationManager extends RelationManager
{
    protected static string $relationship = 'notes';

    public function form(Schema $schema): Schema
    {
        return $schema->components([Textarea::make('body')->required()->maxLength(2000)]);
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([TextColumn::make('kind')->badge(), TextColumn::make('body')->wrap(), TextColumn::make('created_at')->dateTime()])
            ->headerActions([CreateAction::make()->label('Add internal note')->visible(fn () => SupportResource::canAct())->mutateDataUsing(fn (array $data) => $data + ['author_id' => auth()->id(), 'kind' => 'note'])]);
    }
}
