<?php

namespace App\Providers;

use App\Billing\BillingProvider;
use App\Billing\PaddleProvider;
use App\Models\Setting;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(BillingProvider::class, fn () => match (config('billing.provider')) {
            'paddle' => new PaddleProvider((string) config('billing.paddle.webhook_secret'), (string) config('billing.paddle.api_key'), (string) config('billing.paddle.api_base')),
            default => throw new \InvalidArgumentException('Unknown billing provider.'),
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Links in emails must never be built from the request's Host header (reset-link poisoning).
        if ($this->app->environment('production') || $this->app->environment('staging')) {
            URL::forceRootUrl(config('app.url'));
            URL::forceScheme((string) parse_url((string) config('app.url'), PHP_URL_SCHEME) ?: 'https');
        }

        // Admin-editable email wording with {name}, {app} placeholders; sensible defaults when nothing is set.
        $fill = fn (string $t, $user) => strtr($t, ['{name}' => $user->name, '{app}' => config('brand.name')]);
        VerifyEmail::toMailUsing(function ($user, string $url) use ($fill) {
            return (new MailMessage)
                ->subject($fill((string) Setting::get('mail.verify.subject', 'Verify your email for {app}'), $user))
                ->line($fill((string) Setting::get('mail.verify.body', 'Hi {name}, confirm your email address to finish setting up {app}.'), $user))
                ->action('Verify email', $url);
        });
        ResetPassword::createUrlUsing(fn ($user, string $token) => url('/reset-password?token='.$token.'&email='.urlencode($user->email)));
        ResetPassword::toMailUsing(function ($user, string $token) use ($fill) {
            return (new MailMessage)
                ->subject($fill((string) Setting::get('mail.reset.subject', 'Reset your {app} password'), $user))
                ->line($fill((string) Setting::get('mail.reset.body', 'Hi {name}, use the button to choose a new password. If you did not ask for this, ignore this email.'), $user))
                ->action('Choose a new password', url('/reset-password?token='.$token.'&email='.urlencode($user->email)));
        });

        //
    }
}
