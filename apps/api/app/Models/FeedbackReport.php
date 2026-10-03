<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FeedbackReport extends Model
{
    protected $fillable = ['type', 'message', 'email', 'install_id', 'user_id', 'extension_version', 'context', 'status', 'assignee_id'];

    protected function casts(): array
    {
        return ['context' => 'array'];
    }

    /** @return HasMany<FeedbackNote, $this> */
    public function notes(): HasMany
    {
        return $this->hasMany(FeedbackNote::class)->latest('id');
    }

    /** @return BelongsTo<User, $this> */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }
}
