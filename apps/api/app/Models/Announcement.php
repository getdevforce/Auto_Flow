<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Announcement extends Model
{
    protected $fillable = ['key', 'content', 'plans', 'countries', 'min_version', 'max_version', 'starts_at', 'ends_at', 'dismissible', 'status'];

    protected function casts(): array
    {
        return ['content' => 'array', 'plans' => 'array', 'countries' => 'array', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'dismissible' => 'boolean'];
    }
}
