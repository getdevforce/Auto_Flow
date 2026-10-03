<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegistryModel extends Model
{
    protected $fillable = ['model_id', 'provider_id', 'kind', 'label', 'capabilities', 'price_usd', 'price_unit', 'deprecated', 'dialect_version', 'enabled'];

    protected function casts(): array
    {
        return ['capabilities' => 'array', 'deprecated' => 'boolean', 'enabled' => 'boolean'];
    }

    /** @return BelongsTo<RegistryProvider, $this> */
    public function provider(): BelongsTo
    {
        return $this->belongsTo(RegistryProvider::class, 'provider_id');
    }
}
