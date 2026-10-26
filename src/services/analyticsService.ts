import type { ConsolidatedRow, EtlSourceName, UserRole } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { localRepository } from "@/persistence/database";

export interface AnalyticsFilters { from?: string; to?: string; source?: EtlSourceName | "all"; company?: string; category?: string; location?: string }
export interface AnalyticsMetric { totalAmount: number; transactions: number; averageTicket: number }
export interface AnalyticsBucket { label: string; amount: number; transactions: number; share: number }
export interface AnalyticsDashboard { metrics: AnalyticsMetric; evolution: AnalyticsBucket[]; products: AnalyticsBucket[]; categories: AnalyticsBucket[]; companies: AnalyticsBucket[]; sources: AnalyticsBucket[]; locations: AnalyticsBucket[]; sellers: AnalyticsBucket[]; branches: AnalyticsBucket[] }
export type ReportId = "sales" | "customers" | "products" | "performance";
export interface ReportDefinition { id: ReportId; name: string; description: string }
export interface ReportRow { [key: string]: string | number }
export interface PaginatedReport { definition: ReportDefinition; rows: ReportRow[]; totalRows: number; page: number; pageSize: number; totalPages: number; totalAmount: number }
export const REPORT_CATALOG: readonly ReportDefinition[] = [
  { id: "sales", name: "Reporte de ventas", description: "Transacciones comerciales consolidadas, excluyendo órdenes B2G." },
  { id: "customers", name: "Reporte de clientes y empresas", description: "Participación comercial por empresa o cliente identificado." },
  { id: "products", name: "Reporte de productos y categorías", description: "Productos, categorías, importes y participación." },
  { id: "performance", name: "Rendimiento comercial", description: "Comparación por vendedores y sucursales." },
];
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const text = (value: string | undefined) => value?.trim() || "Sin información";
const matches = (row: ConsolidatedRow, filters: AnalyticsFilters) => {
  const location = `${row.departmentName ?? ""} ${row.provinceName ?? ""} ${row.districtName ?? ""}`.toLocaleLowerCase("es");
  return (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to) && (!filters.source || filters.source === "all" || row.source === filters.source) && (!filters.company || text(row.companyName) === filters.company) && (!filters.category || text(row.categoryName) === filters.category) && (!filters.location || location.includes(filters.location.toLocaleLowerCase("es")));
};
const countable = (row: ConsolidatedRow) => row.businessType === "sale";
const deduplicate = (rows: ConsolidatedRow[]) => {
  const keys = new Set<string>();
  const priority = (source: EtlSourceName) => source === "SamarImportadora" ? 0 : source === "DW_SamarImportadora" ? 2 : 1;
  const ordered = [...rows].sort((a, b) => priority(a.source) - priority(b.source));
  return ordered.filter(row => {
    if (!countable(row)) return false;
    const key = row.transactionKey ?? `${row.source}:${row.sourceKey}`;
    if (keys.has(key)) return false;
    keys.add(key); return true;
  });
};
const bucket = (rows: ConsolidatedRow[], getLabel: (row: ConsolidatedRow) => string): AnalyticsBucket[] => {
  const grouped = new Map<string, { amount: number; transactions: number }>();
  for (const row of rows) { const key = getLabel(row); const current = grouped.get(key) ?? { amount: 0, transactions: 0 }; current.amount += row.amount; current.transactions += 1; grouped.set(key, current); }
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return [...grouped.entries()].map(([label, value]) => ({ label, amount: money(value.amount), transactions: value.transactions, share: total ? money((value.amount / total) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
};
const periodLabel = (date: string) => date.slice(0, 7);

export class AnalyticsService {
  private guard(role: UserRole) { assertPermission(role, "analytics:read"); }
  async rows(role: UserRole, filters: AnalyticsFilters = {}): Promise<ConsolidatedRow[]> { this.guard(role); return deduplicate((await localRepository.list("consolidatedRows")).filter(row => matches(row, filters))); }
  async dashboard(role: UserRole, filters: AnalyticsFilters = {}): Promise<AnalyticsDashboard> {
    const rows = await this.rows(role, filters);
    const totalAmount = money(rows.reduce((sum, row) => sum + row.amount, 0));
    return { metrics: { totalAmount, transactions: rows.length, averageTicket: rows.length ? money(totalAmount / rows.length) : 0 }, evolution: bucket(rows, row => periodLabel(row.date)), products: bucket(rows, row => text(row.productName)), categories: bucket(rows, row => text(row.categoryName)), companies: bucket(rows, row => text(row.companyName)), sources: bucket(rows, row => row.source), locations: bucket(rows, row => text(row.districtName)), sellers: bucket(rows, row => text(row.sellerName)), branches: bucket(rows, row => text(row.branchName)) };
  }
  async report(role: UserRole, reportId: ReportId, filters: AnalyticsFilters = {}, page = 1, pageSize = 10): Promise<PaginatedReport> {
    this.guard(role); const definition = REPORT_CATALOG.find(item => item.id === reportId); if (!definition) throw new Error("No se encontró el reporte.");
    const rows = await this.rows(role, filters); let reportRows: ReportRow[];
    if (reportId === "sales") reportRows = rows.map(row => ({ Fecha: row.date, Fuente: row.source, Transacción: text(row.transactionKey ?? row.sourceKey), Empresa: text(row.companyName), Categoría: text(row.categoryName), Producto: text(row.productName), Vendedor: text(row.sellerName), Sucursal: text(row.branchName), Ubicación: text(row.districtName), Importe: money(row.amount) }));
    else if (reportId === "customers") reportRows = bucket(rows, row => text(row.companyName)).map(item => ({ Empresa: item.label, Transacciones: item.transactions, Importe: item.amount, Participación: `${item.share}%` }));
    else if (reportId === "products") reportRows = bucket(rows, row => `${text(row.productName)} · ${text(row.categoryName)}`).map(item => ({ Producto: item.label, Transacciones: item.transactions, Importe: item.amount, Participación: `${item.share}%` }));
    else reportRows = bucket(rows, row => `${text(row.sellerName)} · ${text(row.branchName)}`).map(item => ({ VendedorSucursal: item.label, Transacciones: item.transactions, Importe: item.amount, TicketPromedio: item.transactions ? money(item.amount / item.transactions) : 0 }));
    const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize))); const totalRows = reportRows.length; const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize)); const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);
    return { definition, rows: reportRows.slice((safePage - 1) * safePageSize, safePage * safePageSize), totalRows, page: safePage, pageSize: safePageSize, totalPages, totalAmount: money(rows.reduce((sum, row) => sum + row.amount, 0)) };
  }
  async filterOptions(role: UserRole): Promise<{ companies: string[]; categories: string[]; locations: string[]; sources: EtlSourceName[] }> {
    const rows = await this.rows(role); return { companies: [...new Set(rows.map(row => text(row.companyName)))].sort(), categories: [...new Set(rows.map(row => text(row.categoryName)))].sort(), locations: [...new Set(rows.map(row => text(row.districtName)))].sort(), sources: [...new Set(rows.map(row => row.source))].sort() as EtlSourceName[] };
  }
}
export const analyticsService = new AnalyticsService();

export function toCsv(rows: ReportRow[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]); const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.map(escape).join(","), ...rows.map(row => headers.map(header => escape(row[header])).join(","))].join("\r\n");
}
export function buildPdfDocument(title: string, rows: ReportRow[]): string {
  const lines = [title, ...rows.map(row => Object.values(row).join(" | "))].map(line => line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[()\\]/g, "\\$&").slice(0, 115));
  const content = `BT /F1 9 Tf 40 770 Td ${lines.map((line, index) => `(${line}) Tj ${index < lines.length - 1 ? "0 -14 Td" : ""}`).join(" ")} ET`;
  const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets: number[] = [0]; objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
