<?php

namespace Database\Factories;

use App\Models\Template;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Template> */
class TemplateFactory extends Factory
{
    protected $model = Template::class;

    public function definition(): array
    {
        $title = fake()->unique()->words(3, true);

        return [
            'slug' => Str::slug($title).'-'.fake()->unique()->numberBetween(1, 99999), 'title' => ucfirst($title), 'kind' => 'prompt',
            'summary' => fake()->sentence(), 'body' => ['prompt' => '{character} walks through {location}, {mood} mood'],
            'tags' => ['walk'], 'difficulty' => 'beginner', 'status' => 'published', 'published_at' => now(),
        ];
    }
}
