<?php

use App\Filament\Resources\RegistryModels\Pages\CreateRegistryModel;
use App\Filament\Resources\RegistryModels\Pages\ListRegistryModels;
use App\Filament\Resources\RegistryModels\RegistryModelResource;
use App\Models\ConfigVersion;
use App\Models\RegistryModel;
use App\Models\RegistryProvider;
use App\Models\User;
use App\Services\RemoteConfigPublisher;
use Database\Seeders\DefaultRemoteConfigSeeder;
use Livewire\Livewire;

function staff(string $role): User
{
    $u = User::factory()->create();
    $u->forceFill(['role' => $role])->save();

    return $u;
}

it('lets an editor create a model and publish it to remote config', function () {
    $this->seed(DefaultRemoteConfigSeeder::class);
    $this->actingAs(staff('editor'));
    $provider = RegistryProvider::create(['slug' => 'acme', 'label' => 'Acme', 'kinds' => ['video']]);

    Livewire::test(CreateRegistryModel::class)->fillForm([
        'provider_id' => $provider->id, 'model_id' => 'acme-v1', 'kind' => 'video', 'label' => 'Acme V1',
        'price_usd' => 0.05, 'price_unit' => 'second', 'capabilities' => ['ratios' => ['16:9'], 'durationsSec' => [5, 10]],
    ])->call('create')->assertHasNoFormErrors();

    Livewire::test(ListRegistryModels::class)->callAction('publish');

    $config = ConfigVersion::latestPublished()->payload;
    expect($config['version'])->toBe(2)
        ->and($config['models'][0])->toMatchArray(['id' => 'acme-v1', 'providerId' => 'acme', 'kind' => 'video'])
        ->and($config['models'][0]['price'])->toBe(['usd' => 0.05, 'unit' => 'second']);
    $this->getJson('/api/v1/config')->assertJsonPath('models.0.id', 'acme-v1');
});

it('keeps disabled models and disabled providers out of the published config', function () {
    $this->seed(DefaultRemoteConfigSeeder::class);
    $on = RegistryProvider::create(['slug' => 'on', 'label' => 'On', 'kinds' => ['text']]);
    $off = RegistryProvider::create(['slug' => 'off', 'label' => 'Off', 'kinds' => ['text'], 'enabled' => false]);
    RegistryModel::create(['provider_id' => $on->id, 'model_id' => 'a', 'kind' => 'text', 'label' => 'A', 'capabilities' => []]);
    RegistryModel::create(['provider_id' => $on->id, 'model_id' => 'b', 'kind' => 'text', 'label' => 'B', 'capabilities' => [], 'enabled' => false]);
    RegistryModel::create(['provider_id' => $off->id, 'model_id' => 'c', 'kind' => 'text', 'label' => 'C', 'capabilities' => []]);

    $payload = (new RemoteConfigPublisher)->publish()->payload;
    expect(collect($payload['models'])->pluck('id')->all())->toBe(['a'])
        ->and(collect($payload['providers'])->pluck('id')->all())->toBe(['on']);
});

it('keeps support and analyst roles read-only on the registry', function (string $role) {
    $this->actingAs(staff($role));
    Livewire::test(ListRegistryModels::class)->assertSuccessful()->assertActionHidden('publish');
    expect(RegistryModelResource::canCreate())->toBeFalse();
})->with(['support', 'analyst']);
