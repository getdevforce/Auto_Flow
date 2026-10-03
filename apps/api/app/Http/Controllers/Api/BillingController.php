<?php

namespace App\Http\Controllers\Api;

use App\Billing\BillingProvider;
use App\Billing\InvalidWebhook;
use App\Billing\WebhookHandler;
use App\Http\Controllers\Controller;
use App\Models\Plan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class BillingController extends Controller
{
    public function webhook(Request $request, BillingProvider $provider, WebhookHandler $handler): JsonResponse
    {
        try {
            $provider->verifyWebhook($request);
        } catch (InvalidWebhook $e) {
            // Nothing is stored for an unverified request.
            return response()->json(['error' => ['code' => 'invalid_signature', 'message' => $e->getMessage()]], 400);
        }

        return response()->json(['result' => $handler->handle($provider, $request->json()->all())]);
    }

    public function checkout(Request $request, BillingProvider $provider): JsonResponse
    {
        $slug = $request->validate(['plan' => ['required', 'string', 'max:50']])['plan'];
        $plan = Plan::where('slug', $slug)->whereNotNull('paddle_price_id')->first();
        abort_unless($plan, 404, 'That plan is not for sale.');
        try {
            return response()->json(['url' => $provider->checkoutUrl($request->user(), $plan)]);
        } catch (RuntimeException $e) {
            return response()->json(['error' => ['code' => 'checkout_failed', 'message' => $e->getMessage()]], 502);
        }
    }
}
