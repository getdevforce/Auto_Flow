<?php

use App\Models\ConfigVersion;
use Database\Seeders\DefaultRemoteConfigSeeder;

it('404s before anything is published', function () {
    $this->getJson('/api/v1/config')->assertNotFound()->assertJsonPath('error.code', 'no_config');
});

it('serves the latest published config with an ETag and honours If-None-Match', function () {
    $this->seed(DefaultRemoteConfigSeeder::class);
    $res = $this->getJson('/api/v1/config')->assertOk()->assertJsonPath('version', 1);
    $etag = $res->headers->get('ETag');
    expect($etag)->not->toBeEmpty();
    $this->getJson('/api/v1/config', ['If-None-Match' => $etag])->assertStatus(304);

    ConfigVersion::publish(['schema' => 1, 'featureFlags' => ['x' => true]]);
    $next = $this->getJson('/api/v1/config')->assertOk()->assertJsonPath('version', 2);
    expect($next->headers->get('ETag'))->not->toBe($etag);
});

it('ignores unpublished drafts', function () {
    $this->seed(DefaultRemoteConfigSeeder::class);
    ConfigVersion::create(['version' => 99, 'payload' => ['version' => 99], 'etag' => 'x', 'published_at' => null]);
    $this->getJson('/api/v1/config')->assertJsonPath('version', 1);
});
