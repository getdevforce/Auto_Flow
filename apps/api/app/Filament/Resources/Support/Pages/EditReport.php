<?php

namespace App\Filament\Resources\Support\Pages;

use App\Filament\Resources\Support\SupportResource;
use App\Mail\SupportReply;
use App\Models\AuditLog;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\Mail;

class EditReport extends EditRecord
{
    protected static string $resource = SupportResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('reply')->label('Reply by email')
                ->visible(fn () => SupportResource::canAct() && filled($this->record->email))
                ->schema([Textarea::make('body')->required()->rows(6)->maxLength(4000)])
                ->action(function (array $data) {
                    Mail::to($this->record->email)->send(new SupportReply($data['body']));
                    $this->record->notes()->create(['author_id' => auth()->id(), 'body' => $data['body'], 'kind' => 'reply']);
                    $this->record->update(['status' => 'pending']);
                    AuditLog::record('support.replied', $this->record);
                    Notification::make()->title('Reply sent')->success()->send();
                }),
        ];
    }
}
