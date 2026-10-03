<?php

use App\Models\Template;
use App\Models\TemplateCategory;
use App\Models\User;

it('lists only published templates, newest and featured ordering, with search and filters', function () {
    $cat = TemplateCategory::create(['slug' => 'noir', 'name' => 'Noir']);
    Template::factory()->create(['slug' => 'a', 'title' => 'Rain alley', 'category_id' => $cat->id, 'featured' => true, 'tags' => ['rain', 'night'], 'difficulty' => 'advanced']);
    Template::factory()->create(['slug' => 'b', 'title' => 'Sunny park', 'published_at' => now()->subDay()]);
    Template::factory()->create(['slug' => 'draft', 'status' => 'draft', 'published_at' => null]);

    $this->getJson('/api/v1/templates')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.slug', 'a');
    $this->getJson('/api/v1/templates?q=rain')->assertJsonPath('meta.total', 1);
    $this->getJson('/api/v1/templates?category=noir')->assertJsonPath('data.0.category', 'noir');
    $this->getJson('/api/v1/templates?tag=night')->assertJsonPath('meta.total', 1);
    $this->getJson('/api/v1/templates?difficulty=advanced')->assertJsonPath('meta.total', 1);
    $this->getJson('/api/v1/templates?sort=new')->assertJsonPath('data.0.slug', 'a');
    $this->getJson('/api/v1/templates?difficulty=extreme')->assertStatus(422);
});

it('treats LIKE wildcards in search as plain text', function () {
    Template::factory()->create(['title' => 'Plain one']);
    $this->getJson('/api/v1/templates?q=%25')->assertJsonPath('meta.total', 0);
});

it('shows a published template with its body and hides drafts', function () {
    Template::factory()->create(['slug' => 'walk', 'body' => ['prompt' => '{character} walks']]);
    Template::factory()->create(['slug' => 'secret', 'status' => 'draft']);
    $this->getJson('/api/v1/templates/walk')->assertOk()->assertJsonPath('body.prompt', '{character} walks');
    $this->getJson('/api/v1/templates/secret')->assertNotFound();
});

it('counts uses without needing an account', function () {
    $t = Template::factory()->create(['slug' => 'walk']);
    $this->postJson('/api/v1/templates/walk/use')->assertOk()->assertJsonPath('use_count', 1);
    $this->postJson('/api/v1/templates/walk/use')->assertJsonPath('use_count', 2);
    expect($t->fresh()->use_count)->toBe(2);
});

it('lets a signed-in user rate once and change their rating', function () {
    Template::factory()->create(['slug' => 'walk']);
    $this->postJson('/api/v1/templates/walk/rate', ['stars' => 5])->assertStatus(401);
    $user = User::factory()->create();
    $this->actingAs($user, 'sanctum')->postJson('/api/v1/templates/walk/rate', ['stars' => 5])->assertJsonPath('rating', 5);
    $this->actingAs($user, 'sanctum')->postJson('/api/v1/templates/walk/rate', ['stars' => 3])->assertJsonPath('rating', 3);
    $other = User::factory()->create();
    $this->actingAs($other, 'sanctum')->postJson('/api/v1/templates/walk/rate', ['stars' => 4])->assertJsonPath('rating', 3.5);
    $this->actingAs($other, 'sanctum')->postJson('/api/v1/templates/walk/rate', ['stars' => 9])->assertStatus(422);
});

it('publishes scheduled templates once their time has come', function () {
    $due = Template::factory()->create(['status' => 'scheduled', 'publish_at' => now()->subMinute(), 'published_at' => null]);
    $later = Template::factory()->create(['status' => 'scheduled', 'publish_at' => now()->addHour(), 'published_at' => null]);
    $this->artisan('templates:publish-scheduled')->assertSuccessful();
    expect($due->fresh()->status)->toBe('published')->and($due->fresh()->published_at)->not->toBeNull()->and($later->fresh()->status)->toBe('scheduled');
});

it('snapshots revisions and restores an earlier one', function () {
    $t = Template::factory()->create(['title' => 'First']);
    $rev = $t->snapshot();
    $t->update(['title' => 'Second']);
    $t->restore($rev);
    expect($t->fresh()->title)->toBe('First')->and($t->revisions()->count())->toBe(1);
});
