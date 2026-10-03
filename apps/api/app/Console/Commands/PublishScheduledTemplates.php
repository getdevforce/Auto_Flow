<?php

namespace App\Console\Commands;

use App\Models\Template;
use Illuminate\Console\Command;

class PublishScheduledTemplates extends Command
{
    protected $signature = 'templates:publish-scheduled';

    protected $description = 'Publish templates whose scheduled time has passed';

    public function handle(): int
    {
        $n = Template::where('status', 'scheduled')->where('publish_at', '<=', now())
            ->update(['status' => 'published', 'published_at' => now()]);
        $this->info("Published {$n} template(s).");

        return self::SUCCESS;
    }
}
