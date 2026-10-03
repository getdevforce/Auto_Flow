<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Install extends Model
{
    protected $primaryKey = 'install_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['install_id', 'user_id', 'extension_version', 'country', 'opt_out', 'first_seen_at', 'last_seen_at'];

    protected function casts(): array
    {
        return ['opt_out' => 'boolean', 'first_seen_at' => 'datetime', 'last_seen_at' => 'datetime'];
    }
}
