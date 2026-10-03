<?php

namespace Database\Seeders;

use App\Models\ConfigVersion;
use Illuminate\Database\Seeder;

class DefaultRemoteConfigSeeder extends Seeder
{
    public function run(): void
    {
        if (ConfigVersion::query()->exists()) {
            return;
        }
        $payload = json_decode((string) file_get_contents(__DIR__.'/data/remote-config.default.json'), true, 512, JSON_THROW_ON_ERROR);
        ConfigVersion::publish($payload);
    }
}
