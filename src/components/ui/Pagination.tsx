import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(value => value === 1 || value === totalPages || Math.abs(value - currentPage) <= 1);
  const visiblePages = pages.filter((value, index) => index === 0 || value - pages[index - 1] <= 1 ? true : false);
  return <div className="flex flex-col gap-3 border-t border-border-default px-4 py-3 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between">
    <span>Mostrando {start}–{end} de {total} registros</span>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">Filas
        <select value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} className="rounded-lg border border-border-default bg-white px-2 py-1.5 text-xs text-text-primary">
          {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="rounded-lg border border-border-default p-1.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /></button>
      {visiblePages.map((value, index) => <span key={value} className="contents">{index > 0 && value - visiblePages[index - 1] > 1 && <span aria-hidden="true">…</span>}<button type="button" aria-label={`Página ${value}`} aria-current={value === currentPage ? "page" : undefined} onClick={() => onPageChange(value)} className={`min-w-8 rounded-lg border px-2 py-1.5 font-semibold ${value === currentPage ? "border-primary bg-primary-subtle text-primary-active" : "border-border-default hover:bg-surface-hover"}`}>{value}</button></span>)}
      <button type="button" aria-label="Página siguiente" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="rounded-lg border border-border-default p-1.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={15} /></button>
    </div>
  </div>;
}
