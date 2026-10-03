<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TemplateCategory extends Model
{
    protected $fillable = ['slug', 'name', 'sort_order'];
}
