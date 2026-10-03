<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

/** Immutable by design: rows can be created and read, never changed or removed through the application. */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['actor_id', 'actor_label', 'action', 'subject_type', 'subject_id', 'meta', 'ip'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Audit log entries cannot be changed.'));
        static::deleting(fn () => throw new LogicException('Audit log entries cannot be deleted.'));
    }

    /** Records who did what to what. Never put prompts, scripts or keys in $meta. */
    public static function record(string $action, ?Model $subject = null, array $meta = []): self
    {
        $actor = auth()->user();

        return static::create([
            'actor_id' => $actor?->id, 'actor_label' => $actor ? "{$actor->name} <{$actor->email}>" : 'system', 'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null, 'subject_id' => $subject?->getKey(), 'meta' => $meta ?: null, 'ip' => request()->ip(),
        ]);
    }
}
