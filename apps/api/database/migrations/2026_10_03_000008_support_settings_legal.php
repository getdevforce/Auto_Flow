<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('feedback_reports', function (Blueprint $table) {
            $table->id();
            $table->string('type', 16); // feedback | error_report
            $table->text('message')->nullable();
            $table->string('email', 190)->nullable();
            $table->uuid('install_id')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('extension_version', 32)->nullable();
            $table->json('context')->nullable(); // allowlisted codes only: error_code, provider, model, kind
            $table->string('status', 16)->default('open')->index();
            $table->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('feedback_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('feedback_report_id')->constrained()->cascadeOnDelete();
            $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->string('kind', 16)->default('note'); // note | reply
            $table->timestamps();
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value')->nullable();
            $table->timestamps();
        });

        Schema::create('legal_pages', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique(); // privacy | terms
            $table->string('title');
            $table->longText('body'); // Markdown; raw HTML is stripped when rendered
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['legal_pages', 'settings', 'feedback_notes', 'feedback_reports'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
