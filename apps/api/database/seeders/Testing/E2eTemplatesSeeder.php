<?php

namespace Database\Seeders\Testing;

use App\Models\Template;
use App\Models\TemplateCategory;
use Illuminate\Database\Seeder;

/** Only used by the extension e2e suite. Never run in production. */
class E2eTemplatesSeeder extends Seeder
{
    public function run(): void
    {
        $cat = TemplateCategory::create(['slug' => 'walks', 'name' => 'Walks']);
        Template::create([
            'slug' => 'walk-through', 'title' => 'Walk through a place', 'summary' => 'A character walks through a location.', 'kind' => 'prompt',
            'body' => ['prompt' => '{character} walks through {location}, {mood} mood', 'defaults' => ['mood' => 'quiet']],
            'category_id' => $cat->id, 'tags' => ['walk'], 'difficulty' => 'beginner', 'status' => 'published', 'published_at' => now(), 'featured' => true,
        ]);
        Template::create([
            'slug' => 'chase', 'title' => 'Rooftop chase', 'summary' => 'Fast pursuit across rooftops.', 'kind' => 'prompt',
            'body' => ['prompt' => '{character} chases a thief across rooftops at {time}'], 'category_id' => $cat->id, 'tags' => ['action'],
            'difficulty' => 'advanced', 'status' => 'published', 'published_at' => now()->subDay(),
        ]);
        Template::create(['slug' => 'hidden-draft', 'title' => 'Not public', 'body' => ['prompt' => 'x'], 'status' => 'draft']);
    }
}
