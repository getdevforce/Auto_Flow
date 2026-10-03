<?php

namespace App\Filament\Widgets;

use App\Filament\Widgets\Concerns\UsesDashboardStats;
use Filament\Widgets\ChartWidget;

class GenerationsChart extends ChartWidget
{
    use UsesDashboardStats;

    protected ?string $heading = 'Generations per day';

    protected int|string|array $columnSpan = 'full';

    protected function getType(): string
    {
        return 'bar';
    }

    protected function getData(): array
    {
        $d = collect($this->stats()->generationsPerDay());

        return [
            'labels' => $d->pluck('day')->all(),
            'datasets' => [['label' => 'Succeeded', 'data' => $d->pluck('success')->all()], ['label' => 'Failed', 'data' => $d->pluck('failure')->all()]],
        ];
    }
}
