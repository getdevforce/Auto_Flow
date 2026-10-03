<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RegistryProvider extends Model
{
    protected $fillable = ['slug', 'label', 'kinds', 'enabled'];

    protected function casts(): array
    {
        return ['kinds' => 'array', 'enabled' => 'boolean'];
    }

    /** @return HasMany<RegistryModel, $this> */
    public function models(): HasMany
    {
        return $this->hasMany(RegistryModel::class, 'provider_id');
    }
}
