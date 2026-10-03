<?php

namespace App\Filament\Widgets;

use App\Filament\Widgets\Concerns\UsesDashboardStats;
use Filament\Widgets\Widget;

class AnalyticsTables extends Widget
{
    use UsesDashboardStats;

    protected string $view = 'filament.widgets.analytics-tables';

    protected int|string|array $columnSpan = 'full';

    /** @return array<string, mixed> */
    protected function getViewData(): array
    {
        $s = $this->stats();

        return [
            'funnel' => $s->funnel(), 'plans' => $s->plans(), 'versions' => $s->versions(), 'countries' => $s->countries(),
            'byModel' => $s->generationsByModel(), 'errors' => $s->topErrors(), 'autopilot' => $s->autopilot(), 'content' => $s->topContent(),
            'retention' => $s->retention(), 'health' => $s->health(),
        ];
    }
}
