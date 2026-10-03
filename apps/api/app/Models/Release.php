<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Release extends Model
{
    protected $fillable = ['version', 'is_current', 'is_minimum_supported', 'changelog', 'force_update_message', 'released_at'];

    protected function casts(): array
    {
        return ['is_current' => 'boolean', 'is_minimum_supported' => 'boolean', 'released_at' => 'datetime'];
    }
}
