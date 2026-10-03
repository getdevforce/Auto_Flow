<?php

namespace App\Filament\Resources\Subscriptions;

use App\Filament\Resources\Subscriptions\Pages\ListSubscriptions;
use App\Models\Subscription;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

/** Read-only: subscription state is driven by the payment provider's webhooks. Use "Change plan" on a customer for manual grants. */
class SubscriptionResource extends Resource
{
    protected static ?string $model = Subscription::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBanknotes;

    protected static ?string $navigationLabel = 'Subscriptions';

    public static function canViewAny(): bool
    {
        return in_array(auth()->user()?->role, ['super_admin', 'support', 'analyst'], true);
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canEdit($record): bool
    {
        return false;
    }

    public static function canDelete($record): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('user.email')->label('Customer')->searchable(),
                TextColumn::make('plan.name')->label('Plan'),
                TextColumn::make('status')->badge()->color(fn (string $state) => match ($state) {
                    'active', 'trialing' => 'success', 'past_due' => 'warning', default => 'gray'
                }),
                TextColumn::make('provider'),
                TextColumn::make('current_period_end')->dateTime()->label('Renews or ends'),
                TextColumn::make('last_event_at')->dateTime()->label('Last event'),
            ])
            ->defaultSort('id', 'desc')
            ->filters([SelectFilter::make('status')->options(['active' => 'Active', 'trialing' => 'Trialing', 'past_due' => 'Past due', 'paused' => 'Paused', 'canceled' => 'Canceled'])]);
    }

    public static function getPages(): array
    {
        return ['index' => ListSubscriptions::route('/')];
    }
}
