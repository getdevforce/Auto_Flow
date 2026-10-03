<?php

use App\Filament\Resources\Templates\Pages\CreateTemplate;
use App\Filament\Resources\Templates\Pages\EditTemplate;
use App\Filament\Resources\Templates\Pages\ListTemplates;
use App\Filament\Resources\Templates\RelationManagers\RevisionsRelationManager;
use App\Filament\Resources\Templates\TemplateResource;
use App\Models\Template;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Livewire\Livewire;

function staffUser(string $role): User
{
    $u = User::factory()->create();
    $u->forceFill(['role' => $role])->save();

    return $u;
}

it('lets an editor create a published template that appears in the public API', function () {
    $this->actingAs(staffUser('editor'));
    Livewire::test(CreateTemplate::class)->fillForm([
        'title' => 'Rain walk', 'slug' => 'rain-walk', 'kind' => 'prompt', 'difficulty' => 'beginner', 'status' => 'published',
        'body' => ['prompt' => '{character} walks in rain'],
    ])->call('create')->assertHasNoFormErrors();
    $this->getJson('/api/v1/templates/rain-walk')->assertOk()->assertJsonPath('body.prompt', '{character} walks in rain');
});

it('requires a publish time for scheduled templates', function () {
    $this->actingAs(staffUser('editor'));
    Livewire::test(CreateTemplate::class)->fillForm(['title' => 'x', 'slug' => 'x', 'kind' => 'prompt', 'difficulty' => 'beginner', 'status' => 'scheduled', 'body' => ['prompt' => 'p']])
        ->call('create')->assertHasFormErrors(['publish_at']);
});

it('snapshots on save and restores an earlier revision from the relation manager', function () {
    $this->actingAs(staffUser('editor'));
    $t = Template::factory()->create(['title' => 'Original']);
    Livewire::test(EditTemplate::class, ['record' => $t->getKey()])->fillForm(['title' => 'Edited'])->call('save')->assertHasNoFormErrors();
    expect($t->fresh()->title)->toBe('Edited')->and($t->revisions()->count())->toBe(1);

    $rev = $t->revisions()->first();
    Livewire::test(RevisionsRelationManager::class, ['ownerRecord' => $t->fresh(), 'pageClass' => EditTemplate::class])->callTableAction('restore', $rev);
    expect($t->fresh()->title)->toBe('Original');
});

it('imports templates as drafts and exports them', function () {
    $this->actingAs(staffUser('editor'));
    $file = UploadedFile::fake()->createWithContent('t.json', json_encode([['slug' => 'imp', 'title' => 'Imported', 'body' => ['prompt' => 'p'], 'category' => 'noir', 'status' => 'published'], ['bad' => true]]));
    Livewire::test(ListTemplates::class)->callAction('import', ['file' => $file])->assertHasNoActionErrors();
    expect(Template::where('slug', 'imp')->first())->status->toBe('draft')->category->slug->toBe('noir');
    Livewire::test(ListTemplates::class)->callAction('export')->assertFileDownloaded('templates.json');
});

it('keeps support and analyst read-only', function (string $role) {
    $this->actingAs(staffUser($role));
    Livewire::test(ListTemplates::class)->assertSuccessful()->assertActionHidden('import');
    expect(TemplateResource::canCreate())->toBeFalse();
})->with(['support', 'analyst']);
