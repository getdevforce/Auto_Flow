<?php

namespace Database\Seeders;

use App\Models\Plan;
use Illuminate\Database\Seeder;

class DefaultPlansSeeder extends Seeder
{
    public function run(): void
    {
        Plan::updateOrCreate(['slug' => 'free'], [
            'name' => 'Free', 'is_default' => true,
            'limits' => ['runs_per_month' => 3, 'shots_per_run' => 12, 'projects' => 3, 'characters' => 6, 'devices' => 1, 'features' => []],
        ]);
        Plan::updateOrCreate(['slug' => 'pro'], [
            'name' => 'Pro', 'is_default' => false,
            'limits' => ['runs_per_month' => 100, 'shots_per_run' => 200, 'projects' => 100, 'characters' => 100, 'devices' => 3, 'features' => ['full_auto', 'audio', 'stitch']],
        ]);
    }
}
