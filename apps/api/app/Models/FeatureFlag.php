<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeatureFlag extends Model
{
    protected $fillable = ['key', 'description', 'enabled', 'plans', 'rollout_percent'];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'plans' => 'array'];
    }
}
