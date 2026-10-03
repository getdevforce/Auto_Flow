<?php

// Single source of the product name: the repo-root brand.config.json shared with the extension.
$path = base_path('../../brand.config.json');
$brand = is_file($path) ? json_decode((string) file_get_contents($path), true) : [];

return [
    'name' => $brand['productName'] ?? 'Frameloom',
    'tagline' => $brand['tagline'] ?? '',
    'accent' => $brand['accent'] ?? ['light' => '#0F6B66', 'dark' => '#3DB7AE'],
];
