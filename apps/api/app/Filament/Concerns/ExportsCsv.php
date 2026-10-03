<?php

namespace App\Filament\Concerns;

use App\Models\AuditLog;
use Filament\Actions\Action;
use Illuminate\Database\Eloquent\Model;

/** CSV export of whatever the table currently shows (search, filters and sort applied). Available on every list page. */
trait ExportsCsv
{
    protected function exportCsvAction(): Action
    {
        return Action::make('exportCsv')->label('Export CSV')->action(function () {
            $table = $this->getTable();
            $columns = collect($table->getColumns())->filter(fn ($c) => ! $c->isHidden())->values();
            $query = $this->getFilteredSortedTableQuery();
            $name = str(class_basename(static::getResource()))->replace('Resource', '')->snake()->toString();
            $count = 0;

            $response = response()->streamDownload(function () use ($columns, $query, &$count) {
                $out = fopen('php://output', 'w');
                fputcsv($out, $columns->map(fn ($c) => (string) $c->getLabel())->all());
                foreach ($query->limit(50_000)->cursor() as $record) {
                    /** @var Model $record */
                    $row = $columns->map(fn ($c) => self::csvCell($c->record($record)->getState()))->all();
                    fputcsv($out, $row);
                    $count++;
                }
                fclose($out);
            }, $name.'-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);

            AuditLog::record('export.csv', null, ['table' => $name]);

            return $response;
        });
    }

    /** Flattens a cell and neutralises spreadsheet formula injection (cells starting with = + - @ or a tab/CR). */
    public static function csvCell(mixed $v): string
    {
        $s = match (true) {
            $v === null => '',
            is_bool($v) => $v ? 'yes' : 'no',
            $v instanceof \DateTimeInterface => $v->format('Y-m-d H:i:s'),
            is_array($v) => json_encode($v, JSON_UNESCAPED_UNICODE),
            default => (string) $v,
        };

        return preg_match('/^[=+\-@\t\r]/', $s) ? "'".$s : $s;
    }
}
