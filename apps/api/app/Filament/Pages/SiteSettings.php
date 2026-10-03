<?php

namespace App\Filament\Pages;

use App\Models\AuditLog;
use App\Models\Setting;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;

class SiteSettings extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCog6Tooth;

    protected static ?string $navigationLabel = 'Site settings';

    protected string $view = 'filament.pages.site-settings';

    /** @var array<string, mixed> */
    public array $data = [];

    public static function canAccess(): bool
    {
        return auth()->user()?->role === 'super_admin';
    }

    public function mount(): void
    {
        $this->form->fill([
            'maintenance_mode' => (bool) Setting::get('maintenance_mode', false),
            'maintenance_message' => Setting::get('maintenance_message', 'We are doing maintenance. Please try again shortly.'),
            'signups_enabled' => (bool) Setting::get('signups_enabled', true),
            'verify_subject' => Setting::get('mail.verify.subject', 'Verify your email for {app}'),
            'verify_body' => Setting::get('mail.verify.body', 'Hi {name}, confirm your email address to finish setting up {app}.'),
            'reset_subject' => Setting::get('mail.reset.subject', 'Reset your {app} password'),
            'reset_body' => Setting::get('mail.reset.body', 'Hi {name}, use the button to choose a new password. If you did not ask for this, ignore this email.'),
        ]);
    }

    public function form(Schema $schema): Schema
    {
        return $schema->statePath('data')->components([
            Section::make('Availability')->columns(2)->schema([
                Toggle::make('maintenance_mode')->helperText('The API answers 503 with the message below. Remote config stays up.'),
                Toggle::make('signups_enabled')->label('Allow new sign-ups'),
                TextInput::make('maintenance_message')->columnSpanFull()->maxLength(200),
            ]),
            Section::make('Email wording')->description('Use {name} and {app}. The button and link are added automatically.')->schema([
                TextInput::make('verify_subject')->label('Verification subject')->required(),
                Textarea::make('verify_body')->label('Verification text')->rows(2)->required(),
                TextInput::make('reset_subject')->label('Password reset subject')->required(),
                Textarea::make('reset_body')->label('Password reset text')->rows(2)->required(),
            ]),
        ]);
    }

    protected function getFormActions(): array
    {
        return [Action::make('save')->label('Save settings')->submit('save')];
    }

    public function save(): void
    {
        $d = $this->form->getState();
        Setting::put('maintenance_mode', (bool) $d['maintenance_mode']);
        Setting::put('maintenance_message', $d['maintenance_message']);
        Setting::put('signups_enabled', (bool) $d['signups_enabled']);
        foreach (['verify', 'reset'] as $k) {
            Setting::put("mail.{$k}.subject", $d["{$k}_subject"]);
            Setting::put("mail.{$k}.body", $d["{$k}_body"]);
        }
        AuditLog::record('settings.updated', null, ['maintenance_mode' => (bool) $d['maintenance_mode'], 'signups_enabled' => (bool) $d['signups_enabled']]);
        Notification::make()->title('Settings saved')->success()->send();
    }
}
