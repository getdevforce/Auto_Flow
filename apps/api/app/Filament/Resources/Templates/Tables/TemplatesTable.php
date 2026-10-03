<?php

namespace App\Filament\Resources\Templates\Tables;

use App\Models\Template;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class TemplatesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('title')->searchable()->sortable(),
                TextColumn::make('category.name')->label('Category')->sortable(),
                TextColumn::make('status')->badge()->color(fn (string $state) => match ($state) {
                    'published' => 'success', 'scheduled' => 'warning', default => 'gray'
                }),
                TextColumn::make('difficulty'),
                IconColumn::make('featured')->boolean(),
                IconColumn::make('trending')->boolean(),
                TextColumn::make('use_count')->label('Uses')->sortable(),
                TextColumn::make('rating_count')->label('Ratings'),
            ])
            ->filters([
                SelectFilter::make('status')->options(['draft' => 'Draft', 'scheduled' => 'Scheduled', 'published' => 'Published']),
                SelectFilter::make('category')->relationship('category', 'name'),
            ])
            ->recordActions([
                Action::make('preview')->modalHeading(fn (Template $r) => $r->title)->modalSubmitAction(false)
                    ->modalContent(fn (Template $r) => view('filament.template-preview', ['template' => $r])),
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }
}
