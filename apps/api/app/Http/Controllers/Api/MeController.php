<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(AuthController::userPayload($request->user()));
    }

    public function entitlements(Request $request): JsonResponse
    {
        $user = $request->user();
        $plan = $user->effectivePlan();

        return response()->json([
            'plan' => $plan->slug,
            'limits' => $plan->limits,
            'bonus_runs' => $user->bonus_runs,
            'subscription' => ($sub = Subscription::where('user_id', $user->id)->latest('id')->first()) ? ['status' => $sub->status, 'renews_or_ends' => $sub->current_period_end?->toIso8601String()] : null,
        ]);
    }
}
