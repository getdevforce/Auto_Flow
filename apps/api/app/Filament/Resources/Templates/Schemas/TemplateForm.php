<?php

namespace App\Filament\Resources\Templates\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\KeyValue;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

class TemplateForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->components([
            Section::make('Template')->columns(2)->schema([
                TextInput::make('title')->required()->maxLength(160),
                TextInput::make('slug')->required()->alphaDash()->unique(ignoreRecord: true)->maxLength(120),
                Select::make('kind')->options(['prompt' => 'Prompt', 'workflow' => 'Workflow'])->required()->default('prompt'),
                Select::make('category_id')->relationship('category', 'name')->createOptionForm([
                    TextInput::make('name')->required(), TextInput::make('slug')->required()->alphaDash()->unique('template_categories', 'slug'),
                ]),
                Textarea::make('summary')->rows(2)->columnSpanFull()->maxLength(400),
                TagsInput::make('tags'),
                Select::make('difficulty')->options(['beginner' => 'Beginner', 'intermediate' => 'Intermediate', 'advanced' => 'Advanced'])->default('beginner')->required(),
                TextInput::make('thumbnail_url')->url()->maxLength(500),
                TextInput::make('sort_order')->numeric()->default(0),
                Toggle::make('featured'),
                Toggle::make('trending'),
            ]),
            Section::make('Content')->description('Use {variables} such as {character}, {location}, {mood}. This is data; the extension fills the variables.')->schema([
                Textarea::make('body.prompt')->label('Prompt text')->rows(5),
                KeyValue::make('body.defaults')->label('Variable defaults')->keyLabel('Variable')->valueLabel('Default'),
            ]),
            Section::make('Publishing')->columns(2)->schema([
                Select::make('status')->options(['draft' => 'Draft', 'scheduled' => 'Scheduled', 'published' => 'Published'])->default('draft')->required()->live(),
                DateTimePicker::make('publish_at')->visible(fn ($get) => $get('status') === 'scheduled')->required(fn ($get) => $get('status') === 'scheduled'),
            ]),
        ]);
    }
}
