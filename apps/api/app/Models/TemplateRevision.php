<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TemplateRevision extends Model
{
    protected $fillable = ['template_id', 'snapshot', 'user_id'];

    protected function casts(): array
    {
        return ['snapshot' => 'array'];
    }
}
