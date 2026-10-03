<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

class AnnouncementController extends Controller
{
    /** Announcements that apply to this plan, version, country and moment, localised. Public; a token only refines the plan. */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['version' => ['nullable', 'string', 'max:32'], 'locale' => ['nullable', 'string', 'max:8']]);
        $version = $data['version'] ?? null;
        $locale = $data['locale'] ?? 'en';
        $token = $request->bearerToken() ? PersonalAccessToken::findToken($request->bearerToken()) : null;
        $plan = $token?->tokenable?->effectivePlan()->slug;
        $country = strtoupper((string) $request->header('CF-IPCountry')) ?: null;

        $items = Announcement::where('status', 'published')
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->orderByDesc('id')->get()
            ->filter(function (Announcement $a) use ($plan, $country, $version) {
                if ($a->plans && ! in_array($plan ?? 'free', $a->plans, true)) {
                    return false;
                }
                if ($a->countries && ! in_array($country, array_map('strtoupper', $a->countries), true)) {
                    return false;
                }
                if ($version && $a->min_version && version_compare($version, $a->min_version, '<')) {
                    return false;
                }
                if ($version && $a->max_version && version_compare($version, $a->max_version, '>')) {
                    return false;
                }

                return true;
            })
            ->map(function (Announcement $a) use ($locale) {
                $c = $a->content[$locale] ?? $a->content['en'] ?? (array_values($a->content)[0] ?? ['title' => '', 'body' => '']);

                return ['key' => $a->key, 'title' => $c['title'] ?? '', 'body' => $c['body'] ?? '', 'dismissible' => $a->dismissible];
            })->values();

        return response()->json(['data' => $items]);
    }
}
