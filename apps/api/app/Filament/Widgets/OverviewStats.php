<?php

namespace App\Filament\Widgets;

use App\Filament\Widgets\Concerns\UsesDashboardStats;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

class OverviewStats extends StatsOverviewWidget
{
    use UsesDashboardStats;

    protected ?string $pollingInterval = null;

    protected function getStats(): array
    {
        $u = $this->stats()->users();

        return [
            Stat::make('Total users', number_format($u['total_users'])),
            Stat::make('New signups', number_format($u['new_signups']))->description('In the selected range'),
            Stat::make('Active installs, 24 hours', number_format($u['active_24h'])),
            Stat::make('Active installs, 7 days', number_format($u['active_7d'])),
            Stat::make('Active installs, 30 days', number_format($u['active_30d'])),
            Stat::make('Installs', number_format($u['installs']))->description(number_format($u['new_installs']).' new in range'),
            Stat::make('Active devices, 30 days', number_format($u['active_devices'])),
        ];
    }
}
