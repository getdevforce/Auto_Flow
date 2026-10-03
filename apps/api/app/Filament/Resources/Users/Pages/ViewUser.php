<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Models\AuditLog;
use App\Models\Plan;
use App\Models\User;
use App\Services\UserAdmin;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ViewRecord;

class ViewUser extends ViewRecord
{
    protected static string $resource = UserResource::class;

    protected string $view = 'filament.pages.view-user';

    /** @return array<string, mixed> */
    public function usage(): array
    {
        return app(UserAdmin::class)->usageAsUser($this->record);
    }

    /** @return list<array{at: string, what: string}> */
    public function timeline(): array
    {
        /** @var User $u */
        $u = $this->record;
        $entries = [['at' => $u->created_at->toDateTimeString(), 'what' => 'Signed up']];
        foreach (AuditLog::where('subject_type', 'User')->where('subject_id', $u->id)->latest('id')->limit(30)->get() as $a) {
            $entries[] = ['at' => $a->created_at->toDateTimeString(), 'what' => $a->action.($a->meta ? ' '.json_encode($a->meta) : '')];
        }
        foreach ($u->devices as $d) {
            $entries[] = ['at' => $d->created_at->toDateTimeString(), 'what' => "Device enrolled: {$d->name}"];
        }
        usort($entries, fn ($a, $b) => strcmp($b['at'], $a['at']));

        return $entries;
    }

    protected function getHeaderActions(): array
    {
        $can = fn () => UserResource::canAct();
        $svc = fn () => app(UserAdmin::class);

        return [
            Action::make('changePlan')->label('Change plan')->visible($can)
                ->schema([Select::make('plan_id')->label('Plan')->options(fn () => Plan::pluck('name', 'id')->all())->required()])
                ->action(function (array $data) use ($svc) {
                    $svc()->changePlan($this->record, Plan::findOrFail($data['plan_id']));
                    Notification::make()->title('Plan changed')->success()->send();
                }),
            Action::make('grantBonus')->label('Grant bonus runs')->visible($can)
                ->schema([TextInput::make('runs')->numeric()->minValue(1)->maxValue(1000)->required()])
                ->action(function (array $data) use ($svc) {
                    $svc()->grantBonus($this->record, (int) $data['runs']);
                    Notification::make()->title('Bonus runs granted')->success()->send();
                }),
            Action::make('suspend')->label('Suspend')->color('danger')->visible(fn () => $can() && ! $this->record->suspended_at)
                ->schema([Textarea::make('reason')->required()->maxLength(300)])
                ->action(function (array $data) use ($svc) {
                    $svc()->suspend($this->record, $data['reason']);
                    Notification::make()->title('Account suspended and signed out')->success()->send();
                }),
            Action::make('unsuspend')->label('Lift suspension')->visible(fn () => $can() && $this->record->suspended_at)
                ->requiresConfirmation()->action(fn () => $svc()->unsuspend($this->record)),
            Action::make('forceLogout')->label('Sign out everywhere')->visible($can)->requiresConfirmation()
                ->action(function () use ($svc) {
                    $n = $svc()->forceLogout($this->record);
                    Notification::make()->title("Ended {$n} session(s)")->success()->send();
                }),
            Action::make('export')->label('Export data')->visible($can)
                ->action(fn () => response()->streamDownload(fn () => print (json_encode($svc()->export($this->record), JSON_PRETTY_PRINT)), "user-{$this->record->id}.json", ['Content-Type' => 'application/json'])),
            Action::make('delete')->label('Delete account and data')->color('danger')
                ->visible(fn () => auth()->user()?->role === 'super_admin')->requiresConfirmation()
                ->modalDescription('Removes the account, its devices, notes and event history. This cannot be undone.')
                ->action(function () use ($svc) {
                    $svc()->delete($this->record);

                    return redirect(UserResource::getUrl('index'));
                }),
        ];
    }
}
