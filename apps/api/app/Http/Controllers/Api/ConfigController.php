<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConfigVersion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ConfigController extends Controller
{
    /** Public, ETag-cached remote config. The extension falls back to its bundled default on any failure. */
    public function show(Request $request): JsonResponse|Response
    {
        $config = ConfigVersion::latestPublished();
        if (! $config) {
            return response()->json(['error' => ['code' => 'no_config', 'message' => 'No config has been published yet.']], 404);
        }
        $etag = '"'.$config->etag.'"';
        if ($request->header('If-None-Match') === $etag) {
            return response('', 304)->header('ETag', $etag);
        }

        return response()->json($config->payload)->header('ETag', $etag)->header('Cache-Control', 'public, max-age=300');
    }
}
