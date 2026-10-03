<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TemplateRating extends Model
{
    protected $fillable = ['template_id', 'user_id', 'stars'];
}
