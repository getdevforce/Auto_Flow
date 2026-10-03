<?php

namespace App\Filament\Resources\Plans\Pages;

use App\Filament\Resources\Plans\PlanResource;
use App\Models\AuditLog;
use App\Models\Plan;
use Filament\Resources\Pages\EditRecord;

class EditPlan extends EditRecord
{
    protected static string $resource = PlanResource::class;

    protected function afterSave(): void
    {
        // Exactly one default plan: making this one default demotes the others.
        if ($this->record->is_default) {
            Plan::where('id', '!=', $this->record->id)->update(['is_default' => false]);
        }
        AuditLog::record('plan.updated', $this->record, ['limits' => $this->record->limits]);
    }
}
