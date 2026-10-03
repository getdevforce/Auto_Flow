<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ConfigVersion extends Model
{
    protected $fillable = ['version', 'payload', 'etag', 'published_at'];

    protected function casts(): array
    {
        return ['payload' => 'array', 'published_at' => 'datetime'];
    }

    public static function latestPublished(): ?self
    {
        return static::whereNotNull('published_at')->orderByDesc('version')->first();
    }

    /** @param array<string, mixed> $payload */
    public static function publish(array $payload): self
    {
        $version = (int) static::max('version') + 1;
        $payload['version'] = $version;

        return static::create([
            'version' => $version,
            'payload' => $payload,
            'etag' => hash('sha256', (string) json_encode($payload)),
            'published_at' => now(),
        ]);
    }
}
