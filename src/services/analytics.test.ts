import { beforeEach, describe, expect, it } from "vitest";
import type { ConsolidatedRow } from "@/domain/models";
import { localRepository } from "@/persistence/database";
import { analyticsService, buildPdfDocument, toCsv } from "./analyticsService";
import { etlService } from "./etlService";

async function resetDb() {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase("arimana-bazar-demo"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  await localRepository.seedDemoData();
}
const row = (id: string, amount: number, extra: Partial<ConsolidatedRow> = {}): ConsolidatedRow => { const now = new Date().toISOString(); return { id, source: "ARIMANA_OLTP", sourceKey: id, transactionKey: id, dimension: "Venta consolidada", amount, date: "2026-03-15", businessType: "sale", origin: "ARIMANA_OLTP", productName: "Bolso urbano", categoryName: "Accesorios", companyName: "Comercial Andina SAC", sellerName: "María Fernanda Torres", branchName: "Sucursal Central", departmentName: "Lima", provinceName: "Lima", districtName: "Miraflores", createdAt: now, updatedAt: now, status: "active", demo: true, ...extra }; };

describe("RF-06.01 a RF-06.05: análisis y reportes", () => {
  beforeEach(async () => { await resetDb(); });

  it("calcula importe, transacciones y ticket excluyendo B2G y deduplicando transacciones", async () => {
    await localRepository.put("consolidatedRows", row("sale-1", 100));
    await localRepository.put("consolidatedRows", row("sale-2", 50, { source: "SamarImportadora", productName: "Taza", categoryName: "Hogar" }));
    await localRepository.put("consolidatedRows", row("duplicate", 50, { source: "DW_SamarImportadora", sourceKey: "dw-duplicate", transactionKey: "sale-2" }));
    await localRepository.put("consolidatedRows", row("b2g-1", 999, { source: "siga_1646", sourceKey: "b2g-1", transactionKey: "b2g-1", businessType: "b2g-order" }));
    const dashboard = await analyticsService.dashboard("Administrador");
    expect(dashboard.metrics).toEqual({ totalAmount: 150, transactions: 2, averageTicket: 75 });
    expect(dashboard.sources.map(item => item.label)).toEqual(["ARIMANA_OLTP", "SamarImportadora"]);
  });

  it("aplica filtros por fecha, fuente, empresa, categoría y ubicación", async () => {
    await localRepository.put("consolidatedRows", row("keep", 80, { source: "CASTILLONV2", date: "2026-04-01", companyName: "Empresa Norte SAC", categoryName: "Hogar", districtName: "San Isidro" }));
    await localRepository.put("consolidatedRows", row("omit", 40, { source: "ARIMANA_OLTP", date: "2026-03-01" }));
    const result = await analyticsService.dashboard("Analista", { from: "2026-04-01", to: "2026-04-30", source: "CASTILLONV2", company: "Empresa Norte SAC", category: "Hogar", location: "San Isidro" });
    expect(result.metrics.transactions).toBe(1); expect(result.metrics.totalAmount).toBe(80);
    expect((await analyticsService.filterOptions("Gerencia")).companies).toContain("Empresa Norte SAC");
  });

  it("expone indicadores tácticos y estratégicos por evolución, producto, vendedor y sucursal", async () => {
    await localRepository.put("consolidatedRows", row("one", 120, { date: "2026-01-10", productName: "Bolso urbano", sellerName: "Vendedor A", branchName: "Sucursal 1" }));
    await localRepository.put("consolidatedRows", row("two", 80, { date: "2026-02-10", productName: "Taza", sellerName: "Vendedor B", branchName: "Sucursal 2" }));
    const dashboard = await analyticsService.dashboard("Gerencia");
    expect(dashboard.evolution).toHaveLength(2); expect(dashboard.products[0].label).toBe("Bolso urbano"); expect(dashboard.sellers).toHaveLength(2); expect(dashboard.branches).toHaveLength(2);
  });

  it("genera reportes paginados con totales consistentes", async () => {
    for (let index = 1; index <= 25; index += 1) await localRepository.put("consolidatedRows", row(`row-${index}`, index, { transactionKey: `tx-${index}` }));
    const first = await analyticsService.report("Analista", "sales", {}, 1, 10);
    const third = await analyticsService.report("Analista", "sales", {}, 3, 10);
    expect(first.rows).toHaveLength(10); expect(first.totalRows).toBe(25); expect(first.totalPages).toBe(3); expect(third.rows).toHaveLength(5); expect(first.totalAmount).toBe(325);
    const products = await analyticsService.report("Analista", "products", {}, 1, 10);
    expect(products.rows[0]).toHaveProperty("Participación");
  });

  it("exporta CSV y PDF funcionales con los datos filtrados", () => {
    const rows = [{ Nombre: "Cliente, SAC", Importe: 100 }];
    expect(toCsv(rows)).toContain('"Cliente, SAC"');
    expect(toCsv(rows)).toContain('"Importe"');
    expect(buildPdfDocument("Reporte de ventas", rows)).toMatch(/^%PDF-1\.4/);
  });

  it("refleja la limpieza y la nueva carga ETL sin crear otra fuente de datos", async () => {
    const admin = (await localRepository.get("users", "user-admin"))!;
    const execution = await etlService.execute("Administrador", admin, ["ARIMANA_OLTP"]);
    expect((await analyticsService.dashboard("Administrador")).metrics.transactions).toBeGreaterThan(0);
    const before = (await localRepository.list("auditLogs")).length;
    await etlService.clearConsolidated("Administrador", admin);
    expect((await analyticsService.dashboard("Administrador")).metrics.transactions).toBe(0);
    expect((await localRepository.list("auditLogs")).length).toBeGreaterThan(before);
    await etlService.rerun("Administrador", admin, execution.id);
    expect((await analyticsService.dashboard("Administrador")).metrics.transactions).toBeGreaterThan(0);
  });

  it("aplica permisos de análisis y reportes por rol", async () => {
    await expect(analyticsService.dashboard("Vendedor")).rejects.toThrow(/permiso/);
    await expect(analyticsService.report("Cajero", "sales")).rejects.toThrow(/permiso/);
    await expect(analyticsService.dashboard("Gerencia")).resolves.toBeDefined();
    await expect(analyticsService.report("Analista", "performance")).resolves.toBeDefined();
  });
});
