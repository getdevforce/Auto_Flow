<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/** Admin-editable key/value settings, cached for a minute so the API does not hit the table on every request. */
class Setting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $all = Cache::remember('settings.all', 60, fn () => static::query()->pluck('value', 'key')->all());

        return array_key_exists($key, $all) ? ($all[$key]['v'] ?? $default) : $default;
    }

    public static function put(string $key, mixed $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => ['v' => $value]]);
        Cache::forget('settings.all');
    }
}
