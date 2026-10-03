<?php

// The event catalogue is shared with the extension (packages/shared/src/telemetry/catalogue.json) so the two cannot drift.
$catalogue = json_decode((string) file_get_contents(base_path('../../packages/shared/src/telemetry/catalogue.json')), true, 512, JSON_THROW_ON_ERROR);

$props = [];
foreach ($catalogue['props'] as $name => $def) {
    $props[$name] = match ($def['type']) {
        'string' => ['string', $def['max']],
        'int' => ['int', $def['max']],
        'bool' => ['bool'],
        'enum' => ['enum', $def['values']],
    };
}

return [
    // Raw events are deleted after this many days; aggregates are kept.
    'retention_days' => (int) env('TELEMETRY_RETENTION_DAYS', 30),
    'max_batch' => 50,
    'events' => $catalogue['events'],
    'props' => $props,
];
