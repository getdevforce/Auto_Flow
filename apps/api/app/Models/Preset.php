<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Preset extends Model
{
    protected $fillable = ['slug', 'kind', 'name', 'prompt', 'params', 'requires', 'status', 'version'];

    protected function casts(): array
    {
        return ['params' => 'array', 'requires' => 'array'];
    }
}
