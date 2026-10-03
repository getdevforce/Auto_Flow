<?php

namespace App\Filament\Resources\Templates\RelationManagers;

use App\Filament\Resources\Templates\TemplateResource;
use App\Models\TemplateRevision;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class RevisionsRelationManager extends RelationManager
{
    protected static string $relationship = 'revisions';

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('created_at')->dateTime()->label('Saved'),
                TextColumn::make('snapshot.title')->label('Title then'),
            ])
            ->recordActions([
                Action::make('restore')->requiresConfirmation()
                    ->visible(fn () => TemplateResource::canEdit($this->getOwnerRecord()))
                    ->action(function (TemplateRevision $record) {
                        $owner = $this->getOwnerRecord();
                        $owner->snapshot(auth()->id()); // keep what we are replacing
                        $owner->restore($record);
                        Notification::make()->title('Revision restored')->success()->send();
                    }),
            ]);
    }
}
