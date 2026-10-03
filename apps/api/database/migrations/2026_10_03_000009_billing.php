<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 24);
            $table->string('provider_subscription_id');
            $table->string('status', 24);
            $table->foreignId('plan_id')->nullable()->constrained('plans')->nullOnDelete();
            $table->timestamp('current_period_end')->nullable();
            $table->timestamp('canceled_at')->nullable();
            // Webhooks can arrive out of order; an older event never overwrites newer state.
            $table->timestamp('last_event_at')->nullable();
            $table->timestamps();
            $table->unique(['provider', 'provider_subscription_id']);
        });

        Schema::create('webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 24);
            $table->string('event_id');
            $table->string('type', 64);
            $table->json('payload');
            $table->string('outcome', 32)->nullable(); // applied | ignored
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->unique(['provider', 'event_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_events');
        Schema::dropIfExists('subscriptions');
    }
};
