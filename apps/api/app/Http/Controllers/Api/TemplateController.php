<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Template;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TemplateController extends Controller
{
    /** @return array<string, mixed> */
    private function card(Template $t, bool $withBody = false): array
    {
        $out = [
            'slug' => $t->slug, 'title' => $t->title, 'kind' => $t->kind, 'summary' => $t->summary,
            'category' => $t->category?->slug, 'tags' => $t->tags ?? [], 'difficulty' => $t->difficulty,
            'featured' => $t->featured, 'trending' => $t->trending, 'thumbnail_url' => $t->thumbnail_url,
            'use_count' => $t->use_count, 'rating' => $t->averageRating(), 'published_at' => $t->published_at?->toIso8601String(),
        ];
        if ($withBody) {
            $out['body'] = $t->body;
        }

        return $out;
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'], 'category' => ['nullable', 'string', 'max:100'], 'tag' => ['nullable', 'string', 'max:50'],
            'difficulty' => ['nullable', 'in:beginner,intermediate,advanced'], 'kind' => ['nullable', 'in:prompt,workflow'],
            'sort' => ['nullable', 'in:featured,trending,new,popular'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $q = Template::published()->with('category');
        if (! empty($data['q'])) {
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $data['q']).'%';
            $q->where(fn ($w) => $w->where('title', 'like', $like)->orWhere('summary', 'like', $like)->orWhere('tags', 'like', $like));
        }
        if (! empty($data['category'])) {
            $q->whereHas('category', fn ($c) => $c->where('slug', $data['category']));
        }
        if (! empty($data['tag'])) {
            $q->where('tags', 'like', '%"'.$data['tag'].'"%');
        }
        foreach (['difficulty', 'kind'] as $f) {
            if (! empty($data[$f])) {
                $q->where($f, $data[$f]);
            }
        }
        match ($data['sort'] ?? 'featured') {
            'trending' => $q->where('trending', true)->orderBy('sort_order'),
            'new' => $q->orderByDesc('published_at'),
            'popular' => $q->orderByDesc('use_count'),
            default => $q->orderByDesc('featured')->orderBy('sort_order')->orderByDesc('published_at'),
        };
        $page = $q->paginate($data['per_page'] ?? 20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Template $t) => $this->card($t))->values(),
            'meta' => ['page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function show(string $slug): JsonResponse
    {
        $t = Template::published()->with('category')->where('slug', $slug)->firstOrFail();

        return response()->json($this->card($t, true));
    }

    /** Counts a use. Carries no user data: only the template's own counter changes. */
    public function use(string $slug): JsonResponse
    {
        $t = Template::published()->where('slug', $slug)->firstOrFail();
        $t->increment('use_count');

        return response()->json(['use_count' => $t->use_count]);
    }

    public function rate(Request $request, string $slug): JsonResponse
    {
        $stars = $request->validate(['stars' => ['required', 'integer', 'min:1', 'max:5']])['stars'];
        $t = Template::published()->where('slug', $slug)->firstOrFail();
        $rating = $t->ratings()->where('user_id', $request->user()->id)->first();
        if ($rating) {
            $t->decrement('rating_sum', $rating->stars);
            $rating->update(['stars' => $stars]);
        } else {
            $t->ratings()->create(['user_id' => $request->user()->id, 'stars' => $stars]);
            $t->increment('rating_count');
        }
        $t->increment('rating_sum', $stars);

        return response()->json(['rating' => $t->fresh()->averageRating()]);
    }
}
