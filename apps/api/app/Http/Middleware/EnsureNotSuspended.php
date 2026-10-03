<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureNotSuspended
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->suspended_at) {
            return response()->json(['error' => ['code' => 'suspended', 'message' => 'This account is suspended. Contact support.']], 403);
        }

        return $next($request);
    }
}
