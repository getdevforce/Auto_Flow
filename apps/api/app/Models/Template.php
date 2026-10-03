<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Template extends Model
{
    use HasFactory;

    public const REVISED = ['slug', 'title', 'kind', 'summary', 'body', 'category_id', 'tags', 'difficulty', 'featured', 'trending', 'sort_order', 'thumbnail_url'];

    protected $fillable = [
        'slug', 'title', 'kind', 'summary', 'body', 'category_id', 'tags', 'difficulty', 'status', 'publish_at', 'published_at',
        'featured', 'trending', 'sort_order', 'thumbnail_url',
    ];

    protected function casts(): array
    {
        return [
            'body' => 'array', 'tags' => 'array', 'featured' => 'boolean', 'trending' => 'boolean',
            'publish_at' => 'datetime', 'published_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<TemplateCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(TemplateCategory::class, 'category_id');
    }

    /** @return HasMany<TemplateRating, $this> */
    public function ratings(): HasMany
    {
        return $this->hasMany(TemplateRating::class);
    }

    /** @return HasMany<TemplateRevision, $this> */
    public function revisions(): HasMany
    {
        return $this->hasMany(TemplateRevision::class)->latest('id');
    }

    /** @param Builder<Template> $q
     * @return Builder<Template> */
    public function scopePublished(Builder $q): Builder
    {
        return $q->where('status', 'published');
    }

    public function averageRating(): ?float
    {
        return $this->rating_count ? round($this->rating_sum / $this->rating_count, 2) : null;
    }

    /** Stores the current editable fields so an editor can restore them later. */
    public function snapshot(?int $userId = null): TemplateRevision
    {
        // fresh() so database defaults (e.g. featured=false) are in the snapshot, not null.
        return $this->revisions()->create(['snapshot' => ($this->fresh() ?? $this)->only(self::REVISED), 'user_id' => $userId]);
    }

    public function restore(TemplateRevision $rev): void
    {
        $this->forceFill($rev->snapshot)->save();
    }
}
