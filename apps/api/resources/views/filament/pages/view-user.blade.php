<x-filament-panels::page>
    @php($u = $this->record)
    @php($usage = $this->usage())
    <x-filament::section heading="Account">
        <dl class="grid grid-cols-2 gap-2 text-sm">
            <dt>Name</dt><dd>{{ $u->name }}</dd>
            <dt>Email</dt><dd>{{ $u->email }}{{ $u->email_verified_at ? '' : ' (not verified)' }}</dd>
            <dt>Plan</dt><dd>{{ $usage['plan'] }}</dd>
            <dt>Status</dt><dd>{{ $u->suspended_at ? 'Suspended: '.$u->suspend_reason : 'Active' }}</dd>
            <dt>Bonus runs</dt><dd>{{ $u->bonus_runs }}</dd>
        </dl>
    </x-filament::section>
    <x-filament::section heading="Usage as the user sees it (read only)" description="Plan limits and this month's counts. No credentials are shown.">
        <dl class="grid grid-cols-2 gap-2 text-sm" data-section="usage">
            <dt>Runs this month</dt><dd>{{ $usage['runs_this_month'] }} of {{ $usage['limits']['runs_per_month'] ?? 'unlimited' }}</dd>
            <dt>Generations this month</dt><dd>{{ $usage['generations_this_month'] }}</dd>
            <dt>Devices</dt><dd>{{ $usage['devices'] }} of {{ $usage['limits']['devices'] ?? 'unlimited' }}</dd>
            <dt>Shots per run limit</dt><dd>{{ $usage['limits']['shots_per_run'] ?? 'unlimited' }}</dd>
        </dl>
    </x-filament::section>
    <x-filament::section heading="Timeline">
        <ul class="space-y-1 text-sm" data-section="timeline">
            @foreach ($this->timeline() as $e)
                <li><span class="font-mono text-gray-500">{{ $e['at'] }}</span> {{ $e['what'] }}</li>
            @endforeach
        </ul>
    </x-filament::section>
</x-filament-panels::page>
