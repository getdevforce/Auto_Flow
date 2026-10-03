<?php

namespace Database\Seeders;

use App\Models\LegalPage;
use Illuminate\Database\Seeder;

/** Starting text only. It describes what the product actually collects; have it reviewed before launch. */
class DefaultLegalPagesSeeder extends Seeder
{
    public function run(): void
    {
        LegalPage::firstOrCreate(['slug' => 'privacy'], [
            'title' => 'Privacy policy',
            'body' => <<<'MD'
## What stays on your computer
Your provider API keys, scripts, prompts, character and location descriptions, reference images and everything you generate stay in your browser. Keys are encrypted there. They are sent only to the provider you chose, never to our servers.

## What we receive
- **Account:** your email, name and a password hash if you create an account, and the devices you sign in from.
- **Usage counts (you can turn this off in Settings):** event names and totals such as which provider and model were used, whether a call succeeded, error codes, run sizes, extension version and country. No script text, prompts, filenames, images or keys.
- **Feedback you send:** the message you write and, if you give it, your email.

## Your choices
You can switch usage counts off at any time. You can ask us to export or delete your data by contacting support.

## Retention
Raw usage events are deleted after 30 days. Aggregated totals that cannot identify you are kept.
MD,
        ]);
        LegalPage::firstOrCreate(['slug' => 'terms'], ['title' => 'Terms of use', 'body' => 'Replace this text with your terms before launch.']);
    }
}
