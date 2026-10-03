<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PurgeTelemetry extends Command
{
    protected $signature = 'telemetry:purge';

    protected $description = 'Delete raw telemetry events older than the retention window (aggregates are kept)';

    public function handle(): int
    {
        $cutoff = now()->subDays((int) config('telemetry.retention_days'));
        $n = DB::table('telemetry_events')->where('occurred_at', '<', $cutoff)->delete();
        $this->info("Deleted {$n} raw event(s) older than {$cutoff->toDateString()}.");

        return self::SUCCESS;
    }
}
