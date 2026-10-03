<?php

require_once __DIR__.'/../Support/KnownDataset.php';

use App\Filament\Pages\Dashboard;
use App\Filament\Widgets\ActiveUsersChart;
use App\Filament\Widgets\AnalyticsTables;
use App\Filament\Widgets\GenerationsChart;
use App\Filament\Widgets\OverviewStats;
use App\Models\User;
use Illuminate\Support\Carbon;
use Livewire\Livewire;

beforeEach(function () {
    seedKnownDataset($this);
    $this->filters = ['from' => '2026-03-01', 'to' => '2026-03-31'];
});
afterEach(fn () => Carbon::setTestNow());

function chartData($component): array
{
    return (fn () => $this->getData())->call($component->instance());
}

it('shows real numbers in the overview stats', function () {
    Livewire::test(OverviewStats::class, ['pageFilters' => $this->filters])
        ->assertSee('Total users')->assertSee('New signups')->assertSee('Active installs, 30 days')
        ->assertSeeInOrder(['Total users', '3', 'New signups', '2', 'Active installs, 24 hours', '1', 'Active installs, 7 days', '1', 'Active installs, 30 days', '3']);
});

it('feeds the active-user chart from the trend', function () {
    $data = chartData(Livewire::test(ActiveUsersChart::class, ['pageFilters' => $this->filters]));
    expect($data['labels'])->toHaveCount(31)->and($data['datasets'][0]['label'])->toBe('DAU')
        ->and($data['datasets'][2]['data'][30])->toBe(3); // MAU on Mar 31
});

it('feeds the generations chart with success and failure per day', function () {
    $data = chartData(Livewire::test(GenerationsChart::class, ['pageFilters' => $this->filters]));
    expect($data['labels'])->toBe(['2026-03-10', '2026-03-11'])->and($data['datasets'][0]['data'])->toBe([8, 5])->and($data['datasets'][1]['data'])->toBe([2, 2]);
});

it('renders the analytics tables with funnel, errors, autopilot and retention', function () {
    Livewire::test(AnalyticsTables::class, ['pageFilters' => $this->filters])
        ->assertSee('First completed autopilot run')->assertSee('rate_limited')->assertSee('policy_rejected')
        ->assertSee('Completion rate')->assertSee('50.0%')->assertSee('Flagged shot rate')->assertSee('15.0%')
        ->assertSee('Gate characters: shown / approved / drop-off')->assertSee('4 / 3 / 25.0%')
        ->assertSee('cam_orbit')->assertSee('2026-03-09')->assertSee('0.1.0')->assertSee('PK');
});

it('shows an empty state instead of errors when the range has no data', function () {
    Livewire::test(AnalyticsTables::class, ['pageFilters' => ['from' => '2025-01-01', 'to' => '2025-01-02']])->assertSee('No generations in this range.')->assertSee('n/a');
});

it('lets every staff role open the dashboard with the date range picker', function (string $role) {
    $u = User::factory()->create();
    $u->forceFill(['role' => $role])->save();
    $this->actingAs($u)->get('/admin')->assertOk()->assertSee('From')->assertSee('To');
})->with(['super_admin', 'editor', 'support', 'analyst']);

it('re-queries when the date range changes', function () {
    $u = User::factory()->create();
    $u->forceFill(['role' => 'analyst'])->save();
    $this->actingAs($u);
    Livewire::test(Dashboard::class)->fillForm(['from' => '2026-03-01', 'to' => '2026-03-31'])->assertSuccessful();
});
