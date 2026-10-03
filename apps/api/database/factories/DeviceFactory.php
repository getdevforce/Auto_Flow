<?php

namespace Database\Factories;

use App\Models\Device;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Device> */
class DeviceFactory extends Factory
{
    public function definition(): array
    {
        return ['user_id' => User::factory(), 'install_id' => fake()->uuid(), 'name' => 'Device '.fake()->word(), 'last_seen_at' => now()];
    }
}
