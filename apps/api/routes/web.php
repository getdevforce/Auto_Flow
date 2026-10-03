<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

use App\Models\LegalPage;

// Public legal pages. The privacy policy URL is what the Chrome Web Store listing points to.
Route::get('/{slug}', function (string $slug) {
    $page = LegalPage::where('slug', $slug)->firstOrFail();

    return view('legal', ['page' => $page]);
})->whereIn('slug', ['privacy', 'terms']);

Route::view('/reset-password', 'reset-password');
