<?php

use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConfigController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\TelemetryController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Middleware\EnsureNotSuspended;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('config', [ConfigController::class, 'show'])->middleware('throttle:60,1');

    Route::middleware('throttle:30,1')->group(function () {
        Route::post('telemetry', [TelemetryController::class, 'ingest']);
        Route::put('telemetry/preference', [TelemetryController::class, 'preference']);
    });

    Route::middleware('throttle:60,1')->group(function () {
        Route::get('announcements', [AnnouncementController::class, 'index']);
        Route::get('templates', [TemplateController::class, 'index']);
        Route::get('templates/{slug}', [TemplateController::class, 'show']);
        Route::post('templates/{slug}/use', [TemplateController::class, 'use']);
    });

    Route::middleware('throttle:10,1')->group(function () {
        Route::post('auth/register', [AuthController::class, 'register']);
        Route::post('auth/login', [AuthController::class, 'login']);
        Route::post('auth/google', [AuthController::class, 'google']);
        Route::post('auth/forgot-password', [AuthController::class, 'forgotPassword']);
        Route::post('auth/reset-password', [AuthController::class, 'resetPassword']);
    });

    Route::middleware(['auth:sanctum', EnsureNotSuspended::class, 'throttle:120,1'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/email/resend', [AuthController::class, 'resendVerification'])->middleware('throttle:3,1');
        Route::get('me', [MeController::class, 'show']);
        Route::get('entitlements', [MeController::class, 'entitlements']);
        Route::post('templates/{slug}/rate', [TemplateController::class, 'rate']);
        Route::get('devices', [DeviceController::class, 'index']);
        Route::patch('devices/{device}', [DeviceController::class, 'update']);
        Route::delete('devices/{device}', [DeviceController::class, 'destroy']);
    });
});
