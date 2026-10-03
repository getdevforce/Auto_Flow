<?php

namespace App\Http\Middleware;

use App\Models\Setting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckMaintenance
{
    public function handle(Request $request, Closure $next): Response
    {
        // Remote config stays up so extensions can read the maintenance notice and their fallbacks.
        if (Setting::get('maintenance_mode', false) && ! $request->is('api/v1/config')) {
            return response()->json(['error' => ['code' => 'maintenance', 'message' => (string) Setting::get('maintenance_message', 'We are doing maintenance. Please try again shortly.')]], 503)->header('Retry-After', '300');
        }

        return $next($request);
    }
}
