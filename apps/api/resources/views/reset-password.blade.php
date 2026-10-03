<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Choose a new password - {{ config('brand.name') }}</title>
    <style>
        :root { --bg: #f7f7f5; --ink: #1c1d1c; --line: #dcdcd6; --accent: #0f6b66; --accent-ink: #fff; }
        @media (prefers-color-scheme: dark) { :root { --bg: #141514; --ink: #ecece8; --line: #343734; --accent: #3db7ae; --accent-ink: #0b1f1d; } }
        body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
        main { max-width: 24rem; margin: 3rem auto; padding: 0 1rem; display: grid; gap: .75rem; }
        input { padding: .5rem; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; }
        button { padding: .6rem; border: 0; border-radius: 6px; background: var(--accent); color: var(--accent-ink); }
    </style>
</head>
<body>
<main>
    <h1>Choose a new password</h1>
    <form id="f" style="display:grid;gap:.75rem">
        <label>New password (at least 10 characters)<input id="p" type="password" minlength="10" required autocomplete="new-password"></label>
        <button>Save password</button>
    </form>
    <p id="msg" role="status"></p>
</main>
<script>
    const q = new URLSearchParams(location.search);
    document.getElementById('f').addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await fetch('/api/v1/auth/reset-password', { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ token: q.get('token'), email: q.get('email'), password: document.getElementById('p').value }) });
        document.getElementById('msg').textContent = r.ok ? 'Password changed. You can sign in from the extension.' : ((await r.json()).error?.message ?? 'That link is invalid or expired.');
    });
</script>
</body>
</html>
