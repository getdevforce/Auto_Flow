<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Dialect extends Model
{
    protected $fillable = ['slug', 'version', 'provider_id', 'model_pattern', 'kind', 'max_chars', 'supports_negative', 'guidance', 'fields', 'status'];

    protected function casts(): array
    {
        return ['fields' => 'array', 'supports_negative' => 'boolean'];
    }
}
