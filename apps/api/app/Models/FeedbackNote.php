<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeedbackNote extends Model
{
    protected $fillable = ['feedback_report_id', 'author_id', 'body', 'kind'];
}
