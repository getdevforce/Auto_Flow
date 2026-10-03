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

use App\Models\User as AppUser;
use Illuminate\Support\Facades\URL;

// Email verification link sent at registration. Signed, so it cannot be forged or edited.
Route::get('/email/verify/{id}/{hash}', function (string $id, string $hash) {
    $user = AppUser::findOrFail($id);
    abort_unless(hash_equals(sha1($user->getEmailForVerification()), $hash), 403);
    if (! $user->hasVerifiedEmail()) {
        $user->markEmailAsVerified();
    }

    return view('email-verified');
})->middleware(['signed', 'throttle:6,1'])->name('verification.verify');
