<?php

namespace App\Filament\Resources\Plans;

use App\Filament\Resources\Plans\Pages\EditPlan;
use App\Filament\Resources\Plans\Pages\ListPlans;
use App\Models\Plan;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class PlanResource extends Resource
{
    protected static ?string $model = Plan::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCreditCard;

    protected static ?string $navigationLabel = 'Plans and entitlements';

    public static function canViewAny(): bool
    {
        return in_array(auth()->user()?->role, ['super_admin', 'analyst', 'support'], true);
    }

    public static function canCreate(): bool
    {
        return auth()->user()?->role === 'super_admin';
    }

    public static function canEdit($record): bool
    {
        return auth()->user()?->role === 'super_admin';
    }

    public static function canDelete($record): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Section::make('Plan')->columns(2)->schema([
                TextInput::make('name')->required(),
                TextInput::make('slug')->required()->alphaDash()->unique(ignoreRecord: true),
                TextInput::make('paddle_price_id')->label('Paddle price ID')->helperText('Subscriptions with this price map to this plan.'),
                Toggle::make('is_default')->label('Default plan for new accounts'),
            ]),
            Section::make('Limits')->description('Changes apply to everyone on the plan immediately, with no release.')->columns(2)->schema([
                TextInput::make('limits.runs_per_month')->numeric()->minValue(0)->required()->label('Autopilot runs per month'),
                TextInput::make('limits.shots_per_run')->numeric()->minValue(1)->required()->label('Shots per run'),
                TextInput::make('limits.projects')->numeric()->minValue(0)->required(),
                TextInput::make('limits.characters')->numeric()->minValue(0)->required(),
                TextInput::make('limits.devices')->numeric()->minValue(1)->required(),
                TagsInput::make('limits.features')->suggestions(['full_auto', 'audio', 'stitch'])->label('Feature access'),
            ]),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')->searchable(), TextColumn::make('slug'),
                IconColumn::make('is_default')->boolean()->label('Default'),
                TextColumn::make('limits.runs_per_month')->label('Runs / month'), TextColumn::make('limits.shots_per_run')->label('Shots / run'),
                TextColumn::make('limits.devices')->label('Devices'),
            ])
            ->recordActions([EditAction::make()]);
    }

    public static function getPages(): array
    {
        return ['index' => ListPlans::route('/'), 'edit' => EditPlan::route('/{record}/edit')];
    }
}
