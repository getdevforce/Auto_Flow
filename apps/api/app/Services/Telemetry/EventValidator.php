<?php

namespace App\Services\Telemetry;

use Illuminate\Validation\ValidationException;

/** Strict allowlist validation. Unknown events or properties are errors, not silently dropped. */
class EventValidator
{
    /**
     * @param  array<string, mixed>  $event
     * @return array{name: string, ts: int, props: array<string, mixed>}
     */
    public function validate(array $event, int $index): array
    {
        $err = fn (string $m) => ValidationException::withMessages(["events.{$index}" => $m]);
        $allowedTop = ['name', 'ts', 'props'];
        if ($extra = array_diff(array_keys($event), $allowedTop)) {
            throw $err('Unexpected field: '.implode(', ', $extra));
        }
        $name = $event['name'] ?? null;
        if (! is_string($name) || ! in_array($name, config('telemetry.events'), true)) {
            throw $err('Unknown event name.');
        }
        $ts = $event['ts'] ?? null;
        if (! is_int($ts) || $ts < 1_600_000_000 || $ts > time() + 300) {
            throw $err('ts must be a unix timestamp in seconds, not in the future.');
        }
        $props = $event['props'] ?? [];
        if (! is_array($props)) {
            throw $err('props must be an object.');
        }
        $rules = config('telemetry.props');
        $clean = [];
        foreach ($props as $k => $v) {
            if (! isset($rules[$k])) {
                throw $err("Property \"{$k}\" is not part of the telemetry catalogue.");
            }
            [$type, $limit] = $rules[$k] + [1 => null];
            $ok = match ($type) {
                'string' => is_string($v) && mb_strlen($v) <= $limit && preg_match('/^[A-Za-z0-9._:@\/+\- ]*$/', $v) === 1,
                'int' => is_int($v) && $v >= 0 && $v <= $limit,
                'bool' => is_bool($v),
                'enum' => is_string($v) && in_array($v, $limit, true),
                default => false,
            };
            if (! $ok) {
                throw $err("Property \"{$k}\" has an invalid value.");
            }
            $clean[$k] = $v;
        }

        return ['name' => $name, 'ts' => $ts, 'props' => $clean];
    }
}
