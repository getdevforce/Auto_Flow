<?php

namespace App\Filament\Widgets;

use App\Filament\Widgets\Concerns\UsesDashboardStats;
use Filament\Widgets\ChartWidget;

class ActiveUsersChart extends ChartWidget
{
    use UsesDashboardStats;

    protected ?string $heading = 'Daily, weekly and monthly active installs';

    protected int|string|array $columnSpan = 'full';

    protected function getType(): string
    {
        return 'line';
    }

    protected function getData(): array
    {
        $t = collect($this->stats()->activeTrend());

        return [
            'labels' => $t->pluck('day')->all(),
            'datasets' => [
                ['label' => 'DAU', 'data' => $t->pluck('dau')->all()],
                ['label' => 'WAU', 'data' => $t->pluck('wau')->all()],
                ['label' => 'MAU', 'data' => $t->pluck('mau')->all()],
            ],
        ];
    }
}
