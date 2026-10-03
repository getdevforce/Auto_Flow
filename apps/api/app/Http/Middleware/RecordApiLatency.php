<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

/** Keeps the last 200 API response times in cache for the admin health panel. */
class RecordApiLatency
{
    public function handle(Request $request, Closure $next): Response
    {
        $start = microtime(true);
        $response = $next($request);
        $ms = round((microtime(true) - $start) * 1000, 1);
        $samples = Cache::get('api.latency_ms', []);
        $samples[] = $ms;
        Cache::put('api.latency_ms', array_slice($samples, -200), now()->addDay());

        return $response;
    }
}
