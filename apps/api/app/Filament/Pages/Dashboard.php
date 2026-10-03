<?php

namespace App\Filament\Pages;

use Filament\Forms\Components\DatePicker;
use Filament\Pages\Dashboard as BaseDashboard;
use Filament\Pages\Dashboard\Concerns\HasFiltersForm;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class Dashboard extends BaseDashboard
{
    use HasFiltersForm;

    public function filtersForm(Schema $schema): Schema
    {
        return $schema->components([
            Section::make()->columns(2)->schema([
                DatePicker::make('from')->label('From')->default(now()->subDays(29)->toDateString())->maxDate(now()),
                DatePicker::make('to')->label('To')->default(now()->toDateString())->maxDate(now()),
            ]),
        ]);
    }
}
