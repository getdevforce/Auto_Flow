<?php

use App\Filament\Resources\Announcements\Pages\CreateAnnouncement;
use App\Filament\Resources\Dialects\Pages\CreateDialect;
use App\Filament\Resources\Dialects\Pages\ListDialects;
use App\Filament\Resources\FeatureFlags\Pages\CreateFeatureFlag;
use App\Filament\Resources\Presets\Pages\CreatePreset;
use App\Filament\Resources\Presets\Pages\ListPresets;
use App\Filament\Resources\Presets\PresetResource;
use App\Filament\Resources\Releases\Pages\CreateRelease;
use App\Filament\Resources\Releases\ReleaseResource;
use App\Models\Announcement;
use App\Models\AuditLog;
use App\Models\ConfigVersion;
use App\Models\FeatureFlag;
use App\Models\Plan;
use App\Models\Preset;
use App\Models\Release;
use App\Models\User;
use Database\Seeders\DefaultPlansSeeder;
use Database\Seeders\DefaultRemoteConfigSeeder;
use Livewire\Livewire;

beforeEach(function () {
    $this->seed([DefaultPlansSeeder::class, DefaultRemoteConfigSeeder::class]);
});
function cmsStaff(string $role): User
{
    $u = User::factory()->create();
    $u->forceFill(['role' => $role])->save();

    return $u;
}

it('publishes presets, dialects, flags and release info into remote config; drafts stay out', function () {
    $this->actingAs(cmsStaff('editor'));
    Livewire::test(CreatePreset::class)->fillForm(['name' => 'Orbit', 'slug' => 'cam_orbit', 'kind' => 'camera', 'prompt' => 'camera orbits the subject', 'status' => 'published', 'requires' => ['video'], 'version' => 1])->call('create')->assertHasNoFormErrors();
    Preset::create(['slug' => 'cam_draft', 'kind' => 'camera', 'name' => 'Draft', 'prompt' => 'x', 'status' => 'draft']);
    Livewire::test(CreatePreset::class)->fillForm(['name' => 'Noir', 'slug' => 'sty_noir', 'kind' => 'style', 'prompt' => 'grainy 16mm', 'status' => 'published', 'requires' => ['image'], 'version' => 1])->call('create');
    Livewire::test(CreateDialect::class)->fillForm(['slug' => 'fal-kling', 'version' => '2', 'provider_id' => 'fal', 'model_pattern' => 'kling', 'kind' => 'video', 'max_chars' => 900, 'supports_negative' => false, 'guidance' => 'One paragraph.', 'status' => 'published'])->call('create')->assertHasNoFormErrors();
    Livewire::test(CreateFeatureFlag::class)->fillForm(['key' => 'audio', 'enabled' => true, 'rollout_percent' => 25, 'plans' => ['pro']])->call('create')->assertHasNoFormErrors();
    $this->actingAs(cmsStaff('super_admin'));
    Livewire::test(CreateRelease::class)->fillForm(['version' => '0.5.0', 'is_current' => true, 'changelog' => 'Faster runs'])->call('create');
    Release::create(['version' => '0.2.0', 'is_minimum_supported' => true, 'force_update_message' => 'Please update to keep generating.']);

    $this->actingAs(cmsStaff('editor'));
    Livewire::test(ListPresets::class)->callAction('publish')->assertHasNoActionErrors();
    $c = ConfigVersion::latestPublished()->payload;
    expect($c['version'])->toBe(2)
        ->and(collect($c['presets']['camera'])->pluck('id')->all())->toBe(['cam_orbit'])
        ->and(collect($c['presets']['styles'])->pluck('id')->all())->toBe(['sty_noir'])
        ->and($c['presets']['camera'][0])->toMatchArray(['name' => 'Orbit', 'requires' => ['video']])
        ->and($c['dialects'][0])->toMatchArray(['id' => 'fal-kling', 'providerId' => 'fal', 'modelPattern' => 'kling', 'maxChars' => 900, 'supportsNegative' => false])
        ->and($c['featureFlags']['audio'])->toBe(['enabled' => true, 'plans' => ['pro'], 'percent' => 25])
        ->and($c['release'])->toBe(['current' => '0.5.0', 'minSupported' => '0.2.0', 'message' => 'Please update to keep generating.', 'changelog' => 'Faster runs'])
        ->and($c['minSupportedVersion'])->toBe('0.2.0');
    expect(AuditLog::where('action', 'config.published')->count())->toBe(1);
    $this->getJson('/api/v1/config')->assertJsonPath('presets.camera.0.id', 'cam_orbit');
});

it('keeps editor-only content away from support and analyst roles', function (string $role, bool $can) {
    $this->actingAs(cmsStaff($role));
    Livewire::test(ListDialects::class)->assertSuccessful();
    $can ? Livewire::test(ListPresets::class)->assertActionVisible('publish') : Livewire::test(ListPresets::class)->assertActionHidden('publish');
    expect(PresetResource::canCreate())->toBe($can)->and(ReleaseResource::canCreate())->toBe($role === 'super_admin');
})->with([['super_admin', true], ['editor', true], ['support', false], ['analyst', false]]);

it('targets announcements by plan, version, country, time and localises them', function () {
    $pro = Plan::where('slug', 'pro')->first();
    $mk = fn (string $key, array $over = []) => Announcement::create(['key' => $key, 'status' => 'published', 'content' => ['en' => ['title' => "T-{$key}", 'body' => 'b'], 'ur' => ['title' => "U-{$key}", 'body' => 'ب']], ...$over]);
    $mk('all');
    $mk('pro-only', ['plans' => ['pro']]);
    $mk('old-versions', ['max_version' => '0.1.9']);
    $mk('new-versions', ['min_version' => '0.3.0']);
    $mk('pk-only', ['countries' => ['PK']]);
    $mk('future', ['starts_at' => now()->addDay()]);
    $mk('expired', ['ends_at' => now()->subDay()]);
    $mk('draft', ['status' => 'draft']);
    $keys = fn ($r) => collect($r->json('data'))->pluck('key')->sort()->values()->all();

    expect($keys($this->getJson('/api/v1/announcements?version=0.1.5')))->toBe(['all', 'old-versions']);
    expect($keys($this->getJson('/api/v1/announcements?version=0.2.0')))->toBe(['all']);
    expect($keys($this->getJson('/api/v1/announcements?version=0.3.1', ['CF-IPCountry' => 'pk'])))->toBe(['all', 'new-versions', 'pk-only']);
    $user = User::factory()->create();
    $user->forceFill(['plan_id' => $pro->id])->save();
    $token = $user->createToken('x')->plainTextToken;
    expect($keys($this->getJson('/api/v1/announcements?version=0.1.5', ['Authorization' => "Bearer {$token}"])))->toBe(['all', 'old-versions', 'pro-only']);
    $ur = $this->getJson('/api/v1/announcements?locale=ur')->json('data.0');
    expect($ur['title'])->toStartWith('U-')->and($this->getJson('/api/v1/announcements?locale=fr')->json('data.0.title'))->toStartWith('T-');
});

it('lets an editor create a localised announcement', function () {
    $this->actingAs(cmsStaff('editor'));
    Livewire::test(CreateAnnouncement::class)->fillForm(['key' => 'welcome', 'status' => 'published', 'content' => ['en' => ['title' => 'Welcome', 'body' => 'Hello'], 'ur' => ['title' => 'خوش آمدید']], 'dismissible' => true])->call('create')->assertHasNoFormErrors();
    expect(Announcement::first()->content['ur']['title'])->toBe('خوش آمدید');
    $this->getJson('/api/v1/announcements?locale=ur')->assertJsonPath('data.0.title', 'خوش آمدید');
});

it('rejects a duplicate flag key and keeps rollout between 0 and 100', function () {
    FeatureFlag::create(['key' => 'audio', 'enabled' => true]);
    $this->actingAs(cmsStaff('editor'));
    Livewire::test(CreateFeatureFlag::class)->fillForm(['key' => 'audio', 'rollout_percent' => 150])->call('create')->assertHasFormErrors(['key', 'rollout_percent']);
});
