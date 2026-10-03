<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class LegalPage extends Model
{
    protected $fillable = ['slug', 'title', 'body'];

    public function html(): string
    {
        // html_input=strip: an editor cannot inject scripts through a legal page.
        return Str::markdown($this->body, ['html_input' => 'strip', 'allow_unsafe_links' => false]);
    }
}
