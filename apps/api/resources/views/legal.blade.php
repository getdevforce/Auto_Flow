<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $page->title }} - {{ config('brand.name') }}</title>
    <style>
        :root { --bg: #f7f7f5; --ink: #1c1d1c; --muted: #62665f; --line: #dcdcd6; --accent: #0f6b66; }
        @media (prefers-color-scheme: dark) { :root { --bg: #141514; --ink: #ecece8; --muted: #9a9e96; --line: #343734; --accent: #3db7ae; } }
        body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 system-ui, sans-serif; }
        main { max-width: 42rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
        a { color: var(--accent); } h1, h2 { line-height: 1.25; } hr { border: 0; border-top: 1px solid var(--line); }
    </style>
</head>
<body>
<main>
    <p><a href="/">{{ config('brand.name') }}</a></p>
    <h1>{{ $page->title }}</h1>
    {!! $page->html() !!}
    <hr>
    <p style="color: var(--muted)">Last updated {{ $page->updated_at->toFormattedDateString() }}.</p>
</main>
</body>
</html>
