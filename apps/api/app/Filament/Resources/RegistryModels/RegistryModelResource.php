<?php

namespace App\Filament\Resources\RegistryModels;

use App\Filament\Concerns\ChecksStaffRole;
use App\Filament\Resources\RegistryModels\Pages\CreateRegistryModel;
use App\Filament\Resources\RegistryModels\Pages\EditRegistryModel;
use App\Filament\Resources\RegistryModels\Pages\ListRegistryModels;
use App\Filament\Resources\RegistryModels\Schemas\RegistryModelForm;
use App\Filament\Resources\RegistryModels\Tables\RegistryModelsTable;
use App\Models\RegistryModel;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class RegistryModelResource extends Resource
{
    use ChecksStaffRole;

    protected static ?string $navigationLabel = 'Model registry';

    protected static ?string $model = RegistryModel::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    public static function form(Schema $schema): Schema
    {
        return RegistryModelForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return RegistryModelsTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListRegistryModels::route('/'),
            'create' => CreateRegistryModel::route('/create'),
            'edit' => EditRegistryModel::route('/{record}/edit'),
        ];
    }
}
