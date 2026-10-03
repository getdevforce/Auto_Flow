<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per anonymous install. opt_out is honoured server-side as well as in the extension.
        Schema::create('installs', function (Blueprint $table) {
            $table->uuid('install_id')->primary();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('extension_version', 32)->nullable();
            $table->string('country', 2)->nullable();
            $table->boolean('opt_out')->default(false);
            $table->timestamp('first_seen_at')->nullable()->index();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });

        // Raw events, purged after the retention window. Counts and metadata only; see docs/telemetry.md.
        Schema::create('telemetry_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('install_id')->index();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 48)->index();
            $table->json('props')->nullable();
            $table->string('country', 2)->nullable();
            $table->timestamp('occurred_at')->index();
            $table->timestamps();
        });

        // Aggregates survive the raw purge. The key columns are the only dimensions the dashboard slices by.
        Schema::create('telemetry_daily', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->string('name', 48);
            $table->string('provider', 48)->default('');
            $table->string('model', 96)->default('');
            $table->string('autonomy', 16)->default('');
            $table->string('version', 32)->default('');
            $table->string('country', 2)->default('');
            $table->string('item', 96)->default('');      // preset or template id, or error/flag reason code
            $table->boolean('success')->default(true);
            $table->unsignedBigInteger('events')->default(0);
            $table->unsignedBigInteger('duration_ms')->default(0);
            $table->unsignedBigInteger('shots')->default(0);
            $table->unsignedBigInteger('flagged')->default(0);
            $table->unique(['day', 'name', 'provider', 'model', 'autonomy', 'version', 'country', 'item', 'success'], 'telemetry_daily_key');
        });

        Schema::create('telemetry_active_daily', function (Blueprint $table) {
            $table->date('day');
            $table->uuid('install_id');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->primary(['day', 'install_id']);
        });

        Schema::create('install_milestones', function (Blueprint $table) {
            $table->uuid('install_id');
            $table->string('milestone', 32);
            $table->timestamp('reached_at');
            $table->primary(['install_id', 'milestone']);
        });
    }

    public function down(): void
    {
        foreach (['install_milestones', 'telemetry_active_daily', 'telemetry_daily', 'telemetry_events', 'installs'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
