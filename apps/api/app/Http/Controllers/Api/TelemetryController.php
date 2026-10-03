<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Install;
use App\Services\Telemetry\EventValidator;
use App\Services\Telemetry\TelemetryRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class TelemetryController extends Controller
{
    public function ingest(Request $request, EventValidator $validator, TelemetryRecorder $recorder): JsonResponse
    {
        $body = $request->json()->all();
        if ($extra = array_diff(array_keys($body), ['install_id', 'events'])) {
            throw ValidationException::withMessages(['body' => 'Unexpected field: '.implode(', ', $extra)]);
        }
        $request->validate(['install_id' => ['required', 'uuid'], 'events' => ['required', 'array', 'min:1', 'max:'.config('telemetry.max_batch')]]);
        $events = array_map(fn ($e, $i) => $validator->validate(is_array($e) ? $e : [], $i), $body['events'], array_keys($body['events']));

        // The token is optional: anonymous installs are fine. A bad token is ignored rather than rejected.
        $token = $request->bearerToken() ? PersonalAccessToken::findToken($request->bearerToken()) : null;
        $country = strtoupper((string) $request->header('CF-IPCountry')) ?: null;
        $country = $country && preg_match('/^[A-Z]{2}$/', $country) ? $country : null;
        $version = substr((string) $request->header('X-Extension-Version'), 0, 32) ?: null;

        $stored = $recorder->record($body['install_id'], $token?->tokenable_id, $version, $country, $events);

        return response()->json(['stored' => $stored], 202);
    }

    /** Server-side opt-out: after this, events from the install are dropped and nothing new is stored. */
    public function preference(Request $request): JsonResponse
    {
        $data = $request->validate(['install_id' => ['required', 'uuid'], 'enabled' => ['required', 'boolean']]);
        $install = Install::firstOrNew(['install_id' => $data['install_id']]);
        $install->opt_out = ! $data['enabled'];
        $install->first_seen_at ??= $install->opt_out ? null : now();
        $install->save();

        return response()->json(['enabled' => ! $install->opt_out]);
    }
}
