import { useMemo, useState, type ReactNode } from "react";
export interface DataColumn<T> { key: string; header: string; value: (row: T) => ReactNode; searchable?: (row: T) => string }
export function DataTable<T,>({ rows, columns, searchPlaceholder = "Buscar…", emptyMessage = "No hay registros para mostrar.", rowKey }: {
  rows: T[]; columns: DataColumn<T>[]; rowKey: (row: T) => string; searchPlaceholder?: string; emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    return term ? rows.filter(row => columns.some(column => (column.searchable?.(row) ?? "").toLocaleLowerCase("es").includes(term))) : rows;
  }, [rows, columns, query]);
  return <div className="overflow-hidden rounded-xl border border-border-default bg-surface-card shadow-sm">
    <div className="border-b border-border-default p-4"><label className="sr-only" htmlFor="table-search">Buscar registros</label><input id="table-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-lg border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-border-primary sm:max-w-sm" /></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-page text-xs uppercase tracking-wide text-text-secondary"><tr>{columns.map(column => <th key={column.key} className="px-4 py-3 font-semibold">{column.header}</th>)}</tr></thead>
      <tbody className="divide-y divide-border-subtle">{filtered.map(row => <tr key={rowKey(row)} className="hover:bg-surface-hover">{columns.map(column => <td key={column.key} className="px-4 py-3">{column.value(row)}</td>)}</tr>)}
        {!filtered.length && <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-text-secondary">{emptyMessage}</td></tr>}</tbody>
    </table></div><div className="border-t border-border-default px-4 py-3 text-xs text-text-secondary">{filtered.length} de {rows.length} registros</div>
  </div>;
}
