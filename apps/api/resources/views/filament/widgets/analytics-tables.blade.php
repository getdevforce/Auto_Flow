@php
    $pct = fn ($v) => $v === null ? 'n/a' : number_format($v * 100, 1).'%';
    $kv = fn (array $a) => $a;
@endphp
<x-filament-widgets::widget>
    <x-filament::section heading="Funnel">
        <table class="w-full text-sm" data-section="funnel">
            @foreach ($funnel as $row)
                <tr><td class="py-1">{{ $row['step'] }}</td><td class="py-1 text-end font-mono">{{ number_format($row['count']) }}</td></tr>
            @endforeach
        </table>
    </x-filament::section>

    <div class="mt-4 grid gap-4 md:grid-cols-3">
        @foreach ([['Plans', $plans, 'plans'], ['Extension versions', $versions, 'versions'], ['Countries (installs)', $countries, 'countries'], ['Top error codes', $errors, 'errors']] as [$title, $data, $key])
            <x-filament::section :heading="$title">
                <table class="w-full text-sm" data-section="{{ $key }}">
                    @forelse ($data as $label => $n)
                        <tr><td class="py-1">{{ $label }}</td><td class="py-1 text-end font-mono">{{ number_format($n) }}</td></tr>
                    @empty
                        <tr><td class="py-1 text-gray-500">No data in this range.</td></tr>
                    @endforelse
                </table>
            </x-filament::section>
        @endforeach
    </div>

    <x-filament::section heading="Generations by provider and model" class="mt-4">
        <table class="w-full text-sm" data-section="by-model">
            <tr class="text-start text-gray-500"><th>Provider</th><th>Model</th><th class="text-end">Total</th><th class="text-end">Failed</th></tr>
            @forelse ($byModel as $r)
                <tr><td>{{ $r['provider'] }}</td><td>{{ $r['model'] }}</td><td class="text-end font-mono">{{ number_format($r['total']) }}</td><td class="text-end font-mono">{{ number_format($r['failures']) }}</td></tr>
            @empty
                <tr><td colspan="4" class="py-1 text-gray-500">No generations in this range.</td></tr>
            @endforelse
        </table>
    </x-filament::section>

    <x-filament::section heading="Autopilot" class="mt-4">
        <table class="w-full text-sm" data-section="autopilot">
            <tr><td>Runs started</td><td class="text-end font-mono">{{ number_format($autopilot['started']) }}</td></tr>
            <tr><td>Runs completed</td><td class="text-end font-mono">{{ number_format($autopilot['completed']) }}</td></tr>
            <tr><td>Completion rate</td><td class="text-end font-mono">{{ $pct($autopilot['completion_rate']) }}</td></tr>
            <tr><td>Average shots per run</td><td class="text-end font-mono">{{ $autopilot['avg_shots_per_run'] ?? 'n/a' }}</td></tr>
            <tr><td>Flagged shot rate</td><td class="text-end font-mono">{{ $pct($autopilot['flagged_shot_rate']) }}</td></tr>
            <tr><td>Prompt refinement acceptance</td><td class="text-end font-mono">{{ $pct($autopilot['refinement_acceptance']) }}</td></tr>
            @foreach ($autopilot['autonomy_split'] as $level => $n)
                <tr><td>Autonomy: {{ $level ?: 'unknown' }}</td><td class="text-end font-mono">{{ number_format($n) }}</td></tr>
            @endforeach
            @foreach ($autopilot['gates'] as $gate => $g)
                <tr><td>Gate {{ str_replace('_', ' ', $gate) }}: shown / approved / drop-off</td><td class="text-end font-mono">{{ $g['shown'] }} / {{ $g['approved'] }} / {{ $pct($g['drop_off']) }}</td></tr>
            @endforeach
            @foreach ($autopilot['flag_reasons'] as $reason => $n)
                <tr><td>Flagged: {{ $reason }}</td><td class="text-end font-mono">{{ number_format($n) }}</td></tr>
            @endforeach
        </table>
    </x-filament::section>

    <div class="mt-4 grid gap-4 md:grid-cols-2">
        <x-filament::section heading="Top presets by use">
            <table class="w-full text-sm" data-section="presets">
                @forelse ($content['presets'] as $k => $n)<tr><td>{{ $k }}</td><td class="text-end font-mono">{{ $n }}</td></tr>@empty<tr><td class="text-gray-500">No data in this range.</td></tr>@endforelse
            </table>
        </x-filament::section>
        <x-filament::section heading="Top templates by use">
            <table class="w-full text-sm" data-section="templates">
                @forelse ($content['templates'] as $k => $n)<tr><td>{{ $k }}</td><td class="text-end font-mono">{{ $n }}</td></tr>@empty<tr><td class="text-gray-500">No data in this range.</td></tr>@endforelse
            </table>
        </x-filament::section>
    </div>

    <x-filament::section heading="Weekly retention cohorts" class="mt-4">
        <table class="w-full text-sm" data-section="retention">
            <tr class="text-start text-gray-500"><th>Cohort week</th><th class="text-end">Installs</th><th class="text-end">Wk 0</th><th class="text-end">Wk 1</th><th class="text-end">Wk 2</th><th class="text-end">Wk 3</th><th class="text-end">Wk 4</th></tr>
            @forelse ($retention as $r)
                <tr><td>{{ $r['cohort'] }}</td><td class="text-end font-mono">{{ $r['size'] }}</td>@foreach ($r['weeks'] as $w)<td class="text-end font-mono">{{ $pct($w) }}</td>@endforeach</tr>
            @empty
                <tr><td colspan="7" class="text-gray-500">No installs in this range.</td></tr>
            @endforelse
        </table>
    </x-filament::section>

    <x-filament::section heading="System health" class="mt-4">
        <table class="w-full text-sm" data-section="health">
            <tr><td>Queue depth</td><td class="text-end font-mono">{{ $health['queue_depth'] }}</td></tr>
            <tr><td>Failed jobs</td><td class="text-end font-mono">{{ $health['failed_jobs'] }}</td></tr>
            <tr><td>API latency, average / p95 (last {{ $health['latency_samples'] }} requests)</td><td class="text-end font-mono">{{ $health['latency_avg_ms'] ?? 'n/a' }} / {{ $health['latency_p95_ms'] ?? 'n/a' }} ms</td></tr>
        </table>
    </x-filament::section>
</x-filament-widgets::widget>
