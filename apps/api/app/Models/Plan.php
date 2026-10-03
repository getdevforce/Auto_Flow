<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Plan extends Model
{
    protected $fillable = ['slug', 'name', 'limits', 'is_default'];

    protected function casts(): array
    {
        return ['limits' => 'array', 'is_default' => 'boolean'];
    }

    public static function default(): self
    {
        return static::where('is_default', true)->firstOrFail();
    }

    public function limit(string $key, int $fallback = 0): int
    {
        return (int) ($this->limits[$key] ?? $fallback);
    }
}
