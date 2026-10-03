<?php

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Pages\SiteSettings;
use App\Filament\Resources\Announcements\Pages\ListAnnouncements;
use App\Filament\Resources\AuditLogs\Pages\ListAuditLogs;
use App\Filament\Resources\Dialects\Pages\ListDialects;
use App\Filament\Resources\FeatureFlags\Pages\ListFeatureFlags;
use App\Filament\Resources\LegalPages\Pages\ListLegalPages;
use App\Filament\Resources\Plans\Pages\ListPlans;
use App\Filament\Resources\Presets\Pages\ListPresets;
use App\Filament\Resources\RegistryModels\Pages\ListRegistryModels;
use App\Filament\Resources\Releases\Pages\ListReleases;
use App\Filament\Resources\Support\Pages\EditReport;
use App\Filament\Resources\Support\Pages\ListReports;
use App\Filament\Resources\Support\RelationManagers\NotesRelationManager;
use App\Filament\Resources\Support\SupportResource;
use App\Filament\Resources\Templates\Pages\ListTemplates;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Mail\SupportReply;
use App\Models\AuditLog;
use App\Models\FeedbackReport;
use App\Models\LegalPage;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\DefaultLegalPagesSeeder;
use Database\Seeders\DefaultPlansSeeder;
use Database\Seeders\DefaultRemoteConfigSeeder;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Livewire\Livewire;

beforeEach(fn () => $this->seed([DefaultPlansSeeder::class, DefaultLegalPagesSeeder::class]));
function who(string $role): User
{
    $u = User::factory()->create();
    $u->forceFill(['role' => $role])->save();

    return $u;
}

it('accepts feedback and codes-only error reports and refuses anything that could carry content', function () {
    $this->withoutMiddleware(Illuminate\Routing\Middleware\ThrottleRequests::class);
    $this->postJson('/api/v1/feedback', ['type' => 'feedback', 'message' => 'The upscale step is slow', 'email' => 'a@example.com'])->assertCreated();
    $this->postJson('/api/v1/feedback', ['type' => 'error_report', 'context' => ['error_code' => 'rate_limited', 'provider' => 'fal', 'model' => 'kling-v2', 'kind' => 'video']])->assertCreated();
    expect(FeedbackReport::count())->toBe(2)->and(FeedbackReport::where('type', 'error_report')->first()->context)->toMatchArray(['error_code' => 'rate_limited']);

    $this->postJson('/api/v1/feedback', ['type' => 'feedback'])->assertStatus(422);
    $this->postJson('/api/v1/feedback', ['type' => 'error_report', 'message' => 'my script says INT. ROOM'])->assertStatus(422);
    $this->postJson('/api/v1/feedback', ['type' => 'error_report', 'context' => ['prompt' => 'a red door']])->assertStatus(422);
    $this->postJson('/api/v1/feedback', ['type' => 'error_report', 'context' => ['error_code' => 'has spaces and <b>html</b>']])->assertStatus(422);
    $this->postJson('/api/v1/feedback', ['type' => 'feedback', 'message' => 'x', 'script' => 'INT.'])->assertStatus(422);
    $this->postJson('/api/v1/feedback', ['type' => 'feedback', 'message' => str_repeat('x', 2001)])->assertStatus(422);
    expect(FeedbackReport::count())->toBe(2);
});

it('rate limits feedback', function () {
    foreach (range(1, 5) as $_) {
        $this->postJson('/api/v1/feedback', ['type' => 'feedback', 'message' => 'hi']);
    }
    $this->postJson('/api/v1/feedback', ['type' => 'feedback', 'message' => 'hi'])->assertStatus(429);
});

it('runs the support inbox: filter, assign, change status, note, reply by email', function () {
    Mail::fake();
    $a = FeedbackReport::create(['type' => 'feedback', 'message' => 'Broken', 'email' => 'u@example.com']);
    $b = FeedbackReport::create(['type' => 'feedback', 'message' => 'Fine', 'status' => 'closed']);
    $agent = who('support');
    $this->actingAs($agent);
    Livewire::test(ListReports::class)->filterTable('status', 'open')->assertCanSeeTableRecords([$a])->assertCanNotSeeTableRecords([$b]);
    Livewire::test(EditReport::class, ['record' => $a->getKey()])->fillForm(['status' => 'pending', 'assignee_id' => $agent->id])->call('save')->assertHasNoFormErrors();
    expect($a->fresh())->status->toBe('pending')->assignee_id->toBe($agent->id);
    Livewire::test(NotesRelationManager::class, ['ownerRecord' => $a, 'pageClass' => EditReport::class])->callTableAction('create', data: ['body' => 'Looks like a rate limit']);
    expect($a->notes()->first())->body->toBe('Looks like a rate limit')->kind->toBe('note');
    Livewire::test(EditReport::class, ['record' => $a->getKey()])->callAction('reply', ['body' => 'Thanks, fixed in 0.2'])->assertHasNoActionErrors();
    Mail::assertSent(SupportReply::class, fn ($m) => $m->hasTo('u@example.com') && $m->body === 'Thanks, fixed in 0.2');
    expect($a->notes()->where('kind', 'reply')->count())->toBe(1)->and(AuditLog::where('action', 'support.replied')->count())->toBe(1);
});

it('lets only support and super admin act on reports', function (string $role, bool $can) {
    $r = FeedbackReport::create(['type' => 'feedback', 'message' => 'x', 'email' => 'u@example.com']);
    $this->actingAs(who($role));
    expect(SupportResource::canEdit($r))->toBe($can);
})->with([['super_admin', true], ['support', true], ['editor', false], ['analyst', false]]);

it('puts the API into maintenance mode but keeps remote config up', function () {
    $this->seed(DefaultRemoteConfigSeeder::class);
    $this->actingAs(who('super_admin'));
    Livewire::test(SiteSettings::class)->fillForm(['maintenance_mode' => true, 'maintenance_message' => 'Back at noon'])->call('save')->assertHasNoFormErrors();
    $this->getJson('/api/v1/me')->assertStatus(503)->assertJsonPath('error.code', 'maintenance')->assertJsonPath('error.message', 'Back at noon')->assertHeader('Retry-After', '300');
    $this->postJson('/api/v1/auth/login', [])->assertStatus(503);
    $this->getJson('/api/v1/config')->assertOk();
    expect(AuditLog::where('action', 'settings.updated')->count())->toBe(1);
});

it('closes sign-ups from the admin setting', function () {
    Setting::put('signups_enabled', false);
    $this->postJson('/api/v1/auth/register', ['name' => 'A', 'email' => 'a@example.com', 'password' => 'correct-horse-1', 'install_id' => fake()->uuid(), 'device_name' => 'x'])->assertStatus(403)->assertJsonPath('error.code', 'signups_closed');
});

it('uses admin-edited email wording for the password reset mail', function () {
    Notification::fake();
    Setting::put('mail.reset.subject', 'Hello {name}, reset for {app}');
    $u = User::factory()->create(['name' => 'Ada']);
    $this->postJson('/api/v1/auth/forgot-password', ['email' => $u->email])->assertOk();
    Notification::assertSentTo($u, ResetPassword::class, function ($n) use ($u) {
        $mail = $n->toMail($u);

        return $mail->subject === 'Hello Ada, reset for '.config('brand.name') && str_contains($mail->actionUrl, '/reset-password?token=');
    });
});

it('restricts site settings to super admins', function () {
    foreach (['editor', 'support', 'analyst'] as $role) {
        $this->actingAs(who($role));
        expect(SiteSettings::canAccess())->toBeFalse();
    }
});

it('serves the privacy policy and terms publicly and strips raw HTML from edits', function () {
    $this->get('/privacy')->assertOk()->assertSee('Privacy policy')->assertSee('never to our servers')->assertSee(config('brand.name'));
    LegalPage::where('slug', 'terms')->update(['body' => "Hello <script>alert(1)</script>\n\n[x](javascript:alert(1))"]);
    $html = $this->get('/terms')->assertOk()->getContent();
    expect($html)->not->toContain('<script>alert')->and($html)->not->toContain('href="javascript:');
    $this->get('/nonsense')->assertNotFound();
});

it('shows the reset password page', function () {
    $this->get('/reset-password?token=t&email=a@example.com')->assertOk()->assertSee('Choose a new password');
});

it('exports the filtered table as CSV from every list page and audits it', function (string $page, string $model) {
    $this->actingAs(who('analyst'));
    Livewire::test($page)->callAction('exportCsv')->assertFileDownloaded();
    expect(AuditLog::where('action', 'export.csv')->count())->toBe(1);
})->with([
    [ListUsers::class, 'users'],
    [ListAuditLogs::class, 'audit'],
    [ListPlans::class, 'plans'],
    [ListTemplates::class, 'templates'],
    [ListRegistryModels::class, 'registry'],
    [ListPresets::class, 'presets'],
    [ListDialects::class, 'dialects'],
    [ListAnnouncements::class, 'announcements'],
    [ListReleases::class, 'releases'],
    [ListFeatureFlags::class, 'flags'],
    [ListLegalPages::class, 'legal'],
    [ListReports::class, 'support'],
]);

it('neutralises spreadsheet formulas and flattens cells', function () {
    $cell = fn ($v) => (new class
    {
        use ExportsCsv;
    })::csvCell($v);
    expect($cell('=HYPERLINK("http://x")'))->toBe("'=HYPERLINK(\"http://x\")")
        ->and($cell('+1'))->toBe("'+1")->and($cell('-2'))->toBe("'-2")->and($cell('@SUM(A1)'))->toBe("'@SUM(A1)")
        ->and($cell('normal'))->toBe('normal')->and($cell(null))->toBe('')->and($cell(true))->toBe('yes')->and($cell(['a' => 1]))->toBe('{"a":1}');
});
