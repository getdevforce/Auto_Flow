<?php

return [
    'provider' => env('BILLING_PROVIDER', 'paddle'),
    'paddle' => [
        'webhook_secret' => env('PADDLE_WEBHOOK_SECRET', ''),
        'api_key' => env('PADDLE_API_KEY', ''),
        'api_base' => env('PADDLE_API_BASE', 'https://api.paddle.com'),
    ],
];
