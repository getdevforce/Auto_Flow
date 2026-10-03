<?php

namespace App\Filament\Widgets\Concerns;

use App\Services\Analytics\DashboardStats;
use Filament\Widgets\Concerns\InteractsWithPageFilters;

trait UsesDashboardStats
{
    use InteractsWithPageFilters;

    protected function stats(): DashboardStats
    {
        return DashboardStats::forRange($this->pageFilters['from'] ?? null, $this->pageFilters['to'] ?? null);
    }
}
