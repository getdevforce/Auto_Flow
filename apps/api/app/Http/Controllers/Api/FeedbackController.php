<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FeedbackReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class FeedbackController extends Controller
{
    /** Feedback is text the user chose to write. Error reports carry only allowlisted codes, never content. */
    public function store(Request $request): JsonResponse
    {
        $body = $request->json()->all();
        if ($extra = array_diff(array_keys($body), ['type', 'message', 'email', 'install_id', 'context'])) {
            throw ValidationException::withMessages(['body' => 'Unexpected field: '.implode(', ', $extra)]);
        }
        $data = $request->validate([
            'type' => ['required', 'in:feedback,error_report'],
            'message' => ['required_if:type,feedback', 'nullable', 'string', 'max:2000'],
            'email' => ['nullable', 'email', 'max:190'],
            'install_id' => ['nullable', 'uuid'],
            'context' => ['nullable', 'array'],
            'context.error_code' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9._:\-]*$/'],
            'context.provider' => ['nullable', 'string', 'max:48', 'regex:/^[A-Za-z0-9._:\-]*$/'],
            'context.model' => ['nullable', 'string', 'max:96', 'regex:/^[A-Za-z0-9._:\/+\-]*$/'],
            'context.kind' => ['nullable', 'in:image,video,upscale,voice,text'],
        ]);
        if ($data['type'] === 'error_report' && ! empty($data['message'])) {
            throw ValidationException::withMessages(['message' => 'Error reports carry codes only. Use feedback to write a message.']);
        }
        if ($extra = array_diff(array_keys((array) $request->input('context', [])), ['error_code', 'provider', 'model', 'kind'])) {
            throw ValidationException::withMessages(['context' => 'Unexpected context field: '.implode(', ', $extra)]);
        }
        $token = $request->bearerToken() ? PersonalAccessToken::findToken($request->bearerToken()) : null;

        $report = FeedbackReport::create($data + [
            'user_id' => $token?->tokenable_id, 'extension_version' => substr((string) $request->header('X-Extension-Version'), 0, 32) ?: null,
        ]);

        return response()->json(['id' => $report->id], 201);
    }
}
