<div class="space-y-2 p-2 text-sm">
    <p class="font-semibold">{{ $template->kind }} · {{ $template->difficulty }}</p>
    <p>{{ $template->summary }}</p>
    <pre class="whitespace-pre-wrap rounded bg-gray-100 p-3 dark:bg-gray-800">{{ $template->body['prompt'] ?? json_encode($template->body, JSON_PRETTY_PRINT) }}</pre>
</div>
