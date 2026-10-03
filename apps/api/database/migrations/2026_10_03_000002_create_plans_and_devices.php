<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            // Editable from the admin: runs_per_month, shots_per_run, projects, characters, devices, features[].
            $table->json('limits');
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('plan_id')->nullable()->constrained('plans')->nullOnDelete();
            $table->string('google_id')->nullable()->unique();
            $table->unsignedInteger('bonus_runs')->default(0);
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->uuid('install_id');
            $table->string('name', 80);
            $table->string('extension_version', 32)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'install_id']);
        });

        Schema::create('config_versions', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('version');
            $table->json('payload');
            $table->string('etag', 64);
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->index('published_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('config_versions');
        Schema::dropIfExists('devices');
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('plan_id');
            $table->dropColumn(['google_id', 'bonus_runs']);
        });
        Schema::dropIfExists('plans');
    }
};
