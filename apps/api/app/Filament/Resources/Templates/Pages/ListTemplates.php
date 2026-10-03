<?php

namespace App\Filament\Resources\Templates\Pages;

use App\Filament\Concerns\ExportsCsv;
use App\Filament\Resources\Templates\TemplateResource;
use App\Models\Template;
use App\Models\TemplateCategory;
use Filament\Actions\Action;
use Filament\Actions\CreateAction;
use Filament\Forms\Components\FileUpload;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ListRecords;
use Illuminate\Support\Facades\Storage;

class ListTemplates extends ListRecords
{
    use ExportsCsv;

    protected static string $resource = TemplateResource::class;

    protected function getHeaderActions(): array
    {
        return [$this->exportCsvAction(),
            Action::make('export')->label('Export JSON')->action(function () {
                $rows = Template::with('category')->get()->map(fn (Template $t) => [
                    ...$t->only(Template::REVISED), 'category' => $t->category?->slug, 'status' => $t->status,
                ])->all();

                return response()->streamDownload(fn () => print (json_encode($rows, JSON_PRETTY_PRINT)), 'templates.json', ['Content-Type' => 'application/json']);
            }),
            Action::make('import')->label('Import JSON')->visible(fn () => TemplateResource::canCreate())
                ->schema([FileUpload::make('file')->acceptedFileTypes(['application/json'])->disk('local')->directory('imports')->required()])
                ->action(function (array $data) {
                    $rows = json_decode((string) Storage::disk('local')->get($data['file']), true);
                    $n = 0;
                    foreach (is_array($rows) ? $rows : [] as $r) {
                        if (! isset($r['slug'], $r['title'], $r['body'])) {
                            continue;
                        }
                        $cat = isset($r['category']) ? TemplateCategory::firstOrCreate(['slug' => $r['category']], ['name' => ucfirst($r['category'])]) : null;
                        // Imports always land as drafts: publishing is a deliberate editor action.
                        Template::updateOrCreate(['slug' => $r['slug']], [
                            'title' => $r['title'], 'kind' => $r['kind'] ?? 'prompt', 'summary' => $r['summary'] ?? null, 'body' => $r['body'],
                            'category_id' => $cat?->id, 'tags' => $r['tags'] ?? [], 'difficulty' => $r['difficulty'] ?? 'beginner', 'status' => 'draft',
                        ]);
                        $n++;
                    }
                    Storage::disk('local')->delete($data['file']);
                    Notification::make()->title("Imported {$n} template(s) as drafts")->success()->send();
                }),
            CreateAction::make(),
        ];
    }
}
