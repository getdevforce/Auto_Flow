<?php

namespace App\Services;

use App\Models\ConfigVersion;
use App\Models\RegistryModel;
use App\Models\RegistryProvider;

/** Builds the public remote-config payload from admin-managed rows and publishes it as a new version. */
class RemoteConfigPublisher
{
    /** @return array<string, mixed> */
    public function build(): array
    {
        $base = ConfigVersion::latestPublished()?->payload ?? [];

        $providers = RegistryProvider::where('enabled', true)->orderBy('slug')->get()
            ->map(fn (RegistryProvider $p) => ['id' => $p->slug, 'label' => $p->label, 'kinds' => $p->kinds])->values()->all();

        $models = RegistryModel::with('provider')->where('enabled', true)
            ->whereHas('provider', fn ($q) => $q->where('enabled', true))
            ->orderBy('provider_id')->orderBy('model_id')->get()
            ->map(function (RegistryModel $m) {
                $entry = [
                    'id' => $m->model_id,
                    'providerId' => $m->provider->slug,
                    'kind' => $m->kind,
                    'label' => $m->label,
                    'capabilities' => $m->capabilities ?: new \stdClass,
                    'deprecated' => $m->deprecated,
                ];
                if ($m->price_usd !== null) {
                    $entry['price'] = ['usd' => (float) $m->price_usd, 'unit' => $m->price_unit ?? 'request'];
                }
                if ($m->dialect_version) {
                    $entry['dialectVersion'] = $m->dialect_version;
                }

                return $entry;
            })->values()->all();

        return array_merge($base, ['providers' => $providers, 'models' => $models]);
    }

    public function publish(): ConfigVersion
    {
        return ConfigVersion::publish($this->build());
    }
}
