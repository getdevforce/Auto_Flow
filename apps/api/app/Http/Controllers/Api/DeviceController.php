<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json($request->user()->devices()->orderBy('created_at')->get(['id', 'name', 'extension_version', 'last_seen_at']));
    }

    public function update(Request $request, Device $device): JsonResponse
    {
        abort_unless($device->user_id === $request->user()->id, 404);
        $device->update($request->validate(['name' => ['required', 'string', 'max:80']]));

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, Device $device): JsonResponse
    {
        abort_unless($device->user_id === $request->user()->id, 404);
        $request->user()->tokens()->where('name', $device->install_id)->delete();
        $device->delete();

        return response()->json(['ok' => true]);
    }
}
