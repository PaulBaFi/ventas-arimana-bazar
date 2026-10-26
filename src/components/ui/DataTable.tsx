import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Pagination } from "./Pagination";
export interface DataColumn<T> { key: string; header: string; value: (row: T) => ReactNode; searchable?: (row: T) => string }
export function DataTable<T,>({ rows, columns, searchPlaceholder = "Buscar…", emptyMessage = "No hay registros para mostrar.", rowKey }: {
  rows: T[]; columns: DataColumn<T>[]; rowKey: (row: T) => string; searchPlaceholder?: string; emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const searchId = useId();
  useEffect(() => { setPage(1); }, [rows]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    return term ? rows.filter(row => columns.some(column => (column.searchable?.(row) ?? "").toLocaleLowerCase("es").includes(term))) : rows;
  }, [rows, columns, query]);
  const visibleRows = filtered.slice((Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))) - 1) * pageSize, Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))) * pageSize);
  const changeQuery = (value: string) => { setQuery(value); setPage(1); };
  const changePageSize = (value: number) => { setPageSize(value); setPage(1); };
  return <div className="overflow-hidden rounded-xl border border-border-default bg-surface-card shadow-sm">
     <div className="border-b border-border-default p-4"><label className="sr-only" htmlFor={searchId}>Buscar registros</label><div className="flex w-full items-center gap-2 rounded-lg border border-border-default bg-white px-3 sm:max-w-sm"><Search size={16} className="text-text-secondary" aria-hidden="true" /><input id={searchId} type="search" value={query} onChange={event => changeQuery(event.target.value)} placeholder={searchPlaceholder} className="min-w-0 flex-1 py-2 text-sm outline-none" /></div></div>
     <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-page text-xs uppercase tracking-wide text-text-secondary"><tr>{columns.map(column => <th key={column.key} className="px-4 py-3 font-semibold">{column.header}</th>)}</tr></thead>
       <tbody className="divide-y divide-border-subtle">{visibleRows.map(row => <tr key={rowKey(row)} className="hover:bg-surface-hover">{columns.map(column => <td key={column.key} className="px-4 py-3">{column.value(row)}</td>)}</tr>)}
         {!filtered.length && <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-text-secondary">{emptyMessage}</td></tr>}</tbody>
     </table></div><Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={changePageSize} />
  </div>;
}
