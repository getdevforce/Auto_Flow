<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('registry_providers', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('label');
            $table->json('kinds');
            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });

        Schema::create('registry_models', function (Blueprint $table) {
            $table->id();
            $table->string('model_id');
            $table->foreignId('provider_id')->constrained('registry_providers')->cascadeOnDelete();
            $table->string('kind', 16);
            $table->string('label');
            $table->json('capabilities');
            $table->decimal('price_usd', 10, 4)->nullable();
            $table->string('price_unit', 32)->nullable();
            $table->boolean('deprecated')->default(false);
            $table->string('dialect_version', 32)->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->unique(['provider_id', 'model_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registry_models');
        Schema::dropIfExists('registry_providers');
    }
};
