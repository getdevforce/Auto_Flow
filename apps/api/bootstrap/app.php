<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // One error envelope for every API failure: {error: {code, message, details?}}.
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*') || $request->expectsJson());
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            $status = match (true) {
                $e instanceof ValidationException => $e->status,
                $e instanceof AuthenticationException => 401,
                $e instanceof HttpExceptionInterface => $e->getStatusCode(),
                $e instanceof ModelNotFoundException => 404,
                default => 500,
            };
            $code = $e instanceof ValidationException && $status === 401 ? 'invalid_credentials' : match ($status) {
                401 => 'unauthenticated', 403 => 'forbidden', 404 => 'not_found', 409 => 'conflict',
                422 => 'validation_failed', 429 => 'rate_limited', default => $status >= 500 ? 'server_error' : 'error',
            };
            $message = match (true) {
                $e instanceof ValidationException => collect($e->errors())->flatten()->first() ?? 'Invalid request.',
                $status >= 500 && ! config('app.debug') => 'Something went wrong on our side.',
                $e instanceof ModelNotFoundException => 'Not found.',
                default => $e->getMessage() ?: 'Request failed.',
            };
            $body = ['error' => ['code' => $code, 'message' => $message]];
            if ($e instanceof ValidationException) {
                $body['error']['details'] = $e->errors();
            }

            return response()->json($body, $status);
        });
    })->create();
