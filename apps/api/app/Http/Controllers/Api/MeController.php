<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
        ]);
    }
}
