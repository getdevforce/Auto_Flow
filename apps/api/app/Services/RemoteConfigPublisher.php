<?php

namespace App\Services;

use App\Models\ConfigVersion;
use App\Models\Dialect;
use App\Models\FeatureFlag;
use App\Models\Preset;
use App\Models\RegistryModel;
use App\Models\RegistryProvider;
use App\Models\Release;

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

        $presets = ['camera' => [], 'effects' => [], 'styles' => []];
        foreach (Preset::where('status', 'published')->orderBy('slug')->get() as $p) {
            $group = ['camera' => 'camera', 'effect' => 'effects', 'style' => 'styles'][$p->kind] ?? null;
            if ($group) {
                $presets[$group][] = ['id' => $p->slug, 'kind' => $p->kind, 'name' => $p->name, 'prompt' => $p->prompt, 'params' => $p->params ?: new \stdClass, 'requires' => $p->requires ?: []];
            }
        }

        $dialects = Dialect::where('status', 'published')->orderBy('slug')->get()->map(fn (Dialect $d) => [
            'id' => $d->slug, 'version' => $d->version, 'providerId' => $d->provider_id, 'modelPattern' => $d->model_pattern, 'kind' => $d->kind,
            'maxChars' => $d->max_chars, 'supportsNegative' => $d->supports_negative, 'guidance' => $d->guidance,
            ...($d->fields ? ['fields' => $d->fields] : []),
        ])->values()->all();

        $flags = [];
        foreach (FeatureFlag::orderBy('key')->get() as $f) {
            $flags[$f->key] = ['enabled' => $f->enabled, 'plans' => $f->plans ?: null, 'percent' => $f->rollout_percent];
        }

        $current = Release::where('is_current', true)->first();
        $minimum = Release::where('is_minimum_supported', true)->first();
        $release = array_filter([
            'current' => $current?->version, 'minSupported' => $minimum?->version, 'message' => $minimum?->force_update_message, 'changelog' => $current?->changelog,
        ], fn ($v) => $v !== null);

        return array_merge($base, [
            'providers' => $providers, 'models' => $models, 'presets' => $presets, 'dialects' => $dialects, 'featureFlags' => $flags ?: new \stdClass,
            'release' => $release ?: new \stdClass,
            'minSupportedVersion' => $minimum?->version ?? ($base['minSupportedVersion'] ?? '0.0.1'),
        ]);
    }

    public function publish(): ConfigVersion
    {
        return ConfigVersion::publish($this->build());
    }
}
