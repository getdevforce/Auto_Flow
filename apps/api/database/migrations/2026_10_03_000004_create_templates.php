<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('template_categories', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('templates', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            $table->string('kind', 16)->default('prompt'); // prompt | workflow
            $table->text('summary')->nullable();
            // Prompt text with {variables}, or a workflow definition. Data, never code.
            $table->json('body');
            $table->foreignId('category_id')->nullable()->constrained('template_categories')->nullOnDelete();
            $table->json('tags')->nullable();
            $table->string('difficulty', 16)->default('beginner');
            $table->string('status', 16)->default('draft')->index(); // draft | scheduled | published
            $table->timestamp('publish_at')->nullable();
            $table->timestamp('published_at')->nullable()->index();
            $table->boolean('featured')->default(false);
            $table->boolean('trending')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->string('thumbnail_url')->nullable();
            $table->unsignedBigInteger('use_count')->default(0);
            $table->unsignedBigInteger('rating_sum')->default(0);
            $table->unsignedInteger('rating_count')->default(0);
            $table->timestamps();
        });

        Schema::create('template_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained()->cascadeOnDelete();
            $table->json('snapshot');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('template_ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('stars');
            $table->timestamps();
            $table->unique(['template_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('template_ratings');
        Schema::dropIfExists('template_revisions');
        Schema::dropIfExists('templates');
        Schema::dropIfExists('template_categories');
    }
};
