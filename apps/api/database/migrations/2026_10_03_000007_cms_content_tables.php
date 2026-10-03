<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('presets', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('kind', 16); // camera | effect | style
            $table->string('name');
            $table->text('prompt');
            $table->json('params')->nullable();
            $table->json('requires')->nullable(); // video | image | lipSync | firstLastFrame
            $table->string('status', 16)->default('draft')->index();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });

        Schema::create('dialects', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('version', 32)->default('1');
            $table->string('provider_id', 48)->default('*');
            $table->string('model_pattern', 120)->default('.');
            $table->string('kind', 16)->default('video');
            $table->unsignedInteger('max_chars')->default(1200);
            $table->boolean('supports_negative')->default(true);
            $table->text('guidance');
            $table->json('fields')->nullable();
            $table->string('status', 16)->default('draft')->index();
            $table->timestamps();
        });

        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->json('content'); // {"en": {"title": "", "body": ""}, "ur": {...}}
            $table->json('plans')->nullable();     // null = every plan
            $table->json('countries')->nullable(); // null = everywhere; ISO codes
            $table->string('min_version', 32)->nullable();
            $table->string('max_version', 32)->nullable();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('dismissible')->default(true);
            $table->string('status', 16)->default('draft')->index();
            $table->timestamps();
        });

        Schema::create('releases', function (Blueprint $table) {
            $table->id();
            $table->string('version', 32)->unique();
            $table->boolean('is_current')->default(false);
            $table->boolean('is_minimum_supported')->default(false);
            $table->text('changelog')->nullable();
            $table->string('force_update_message', 300)->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();
        });

        Schema::create('feature_flags', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('description')->nullable();
            $table->boolean('enabled')->default(false);
            $table->json('plans')->nullable();
            $table->unsignedTinyInteger('rollout_percent')->default(100);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['feature_flags', 'releases', 'announcements', 'dialects', 'presets'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
