<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\Setting;
use App\Models\User;
use App\Services\DeviceEnrollment;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private readonly DeviceEnrollment $devices) {}

    private const DEVICE_RULES = [
        'install_id' => ['required', 'uuid'],
        'device_name' => ['required', 'string', 'max:80'],
        'extension_version' => ['nullable', 'string', 'max:32'],
    ];

    public function register(Request $request): JsonResponse
    {
        if (! Setting::get('signups_enabled', config('frameloom.signups_enabled', true))) {
            return response()->json(['error' => ['code' => 'signups_closed', 'message' => 'Sign-ups are closed right now.']], 403);
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'min:10', 'max:200'],
            ...self::DEVICE_RULES,
        ]);

        $user = User::create(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
        $user->forceFill(['plan_id' => Plan::default()->id])->save();
        event(new Registered($user));

        return $this->issue($user, $data, 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string'], ...self::DEVICE_RULES]);
        $user = User::where('email', $data['email'])->first();
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Email or password is wrong.'])->status(401);
        }

        return $this->issue($user, $data);
    }

    /** Exchanges a Google ID token (verified with Google) for a session. */
    public function google(Request $request): JsonResponse
    {
        $data = $request->validate(['id_token' => ['required', 'string'], ...self::DEVICE_RULES]);
        $res = Http::get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $data['id_token']]);
        $claims = $res->json();
        $audience = config('services.google.client_id');
        if (! $res->ok() || ! $audience || ($claims['aud'] ?? null) !== $audience || ($claims['email_verified'] ?? 'false') !== 'true') {
            throw ValidationException::withMessages(['id_token' => 'Google sign-in could not be verified.'])->status(401);
        }

        $user = User::where('google_id', $claims['sub'])->orWhere('email', $claims['email'])->first();
        if (! $user) {
            $user = User::create(['name' => $claims['name'] ?? $claims['email'], 'email' => $claims['email'], 'password' => Str::random(40)]);
            $user->forceFill(['plan_id' => Plan::default()->id])->save();
        }
        $user->forceFill(['google_id' => $claims['sub'], 'email_verified_at' => $user->email_verified_at ?? now()])->save();

        return $this->issue($user, $data);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()->delete();

        return response()->json(['ok' => true]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink($data);

        // Same answer whether or not the account exists, so emails cannot be enumerated.
        return response()->json(['ok' => true]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required'], 'email' => ['required', 'email'], 'password' => ['required', 'min:10']]);
        $status = Password::reset($data, function (User $user, string $password) {
            $user->forceFill(['password' => $password])->save();
            $user->tokens()->delete();
        });
        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => 'This reset link is invalid or expired.']);
        }

        return response()->json(['ok' => true]);
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $request->user()?->sendEmailVerificationNotification();

        return response()->json(['ok' => true]);
    }

    /** @param array<string, mixed> $data */
    private function issue(User $user, array $data, int $status = 200): JsonResponse
    {
        if ($user->suspended_at) {
            return response()->json(['error' => ['code' => 'suspended', 'message' => 'This account is suspended. Contact support.']], 403);
        }
        $device = $this->devices->enroll($user, $data['install_id'], $data['device_name'], $data['extension_version'] ?? null);
        $token = $user->createToken($device->install_id)->plainTextToken;

        return response()->json(['token' => $token, 'user' => $this->userPayload($user), 'device_id' => $device->id], $status);
    }

    /** @return array<string, mixed> */
    public static function userPayload(User $user): array
    {
        return [
            'id' => $user->id, 'name' => $user->name, 'email' => $user->email,
            'email_verified' => $user->email_verified_at !== null,
            'plan' => $user->effectivePlan()->slug,
        ];
    }
}
