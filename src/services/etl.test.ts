import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/domain/models";
import { ETL_SOURCE_NAMES } from "@/domain/models";
import { localRepository } from "@/persistence/database";
import { etlService } from "./etlService";

async function resetDb() {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase("arimana-bazar-demo"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  await localRepository.seedDemoData();
}
const input = (name: typeof ETL_SOURCE_NAMES[number], extra: Partial<{ id: string; password: string }> = {}) => ({ name, server: "local.test", engine: "PostgreSQL", database: `db_${name}`, username: "etl_user", ...extra });
let admin: User;

describe("RF-ETL01 a RF-ETL19: administración e integración ETL", () => {
  beforeEach(async () => { await resetDb(); admin = (await localRepository.get("users", "user-admin"))!; });

  it("mantiene exactamente las seis fuentes y permite CRUD, búsqueda y validación de conexiones", async () => {
    expect(ETL_SOURCE_NAMES).toEqual(["siga_1646", "SamarImportadora", "DW_SamarImportadora", "CASTILLONV2", "BD_CASTILLON_VETERINARIA", "ARIMANA_OLTP"]);
    const saved = await etlService.saveConnection("Administrador", admin, input("siga_1646", { password: "secret-not-persisted" }));
    expect(saved).toMatchObject({ name: "siga_1646", credentialConfigured: true });
    expect(saved).not.toHaveProperty("password");
    expect((await etlService.listConnections("Administrador", "local.test"))).toHaveLength(1);
    expect((await etlService.validateConnection("Administrador", input("siga_1646"))).valid).toBe(true);
    const edited = await etlService.saveConnection("Administrador", admin, { ...input("siga_1646"), id: saved.id, server: "new.local" });
    expect(edited.server).toBe("new.local");
    await etlService.removeConnection("Administrador", admin, saved.id);
    expect(await etlService.listConnections("Administrador")).toHaveLength(0);
  });

  it("rechaza conexiones incompletas, fuentes no autorizadas y no expone contraseñas", async () => {
    await expect(etlService.saveConnection("Administrador", admin, { ...input("SamarImportadora"), server: "" })).rejects.toThrow(/servidor/);
    await expect(etlService.saveConnection("Administrador", admin, { ...input("SamarImportadora"), name: "otra" as typeof ETL_SOURCE_NAMES[number] })).rejects.toThrow(/catálogo/);
    const result = await etlService.validateConnection("Administrador", { ...input("SamarImportadora"), password: "ultra-secret" });
    expect(JSON.stringify(result)).not.toContain("ultra-secret");
  });

  it("crea una ejecución pendiente y bloquea ejecuciones incompatibles en curso", async () => {
    const pending = await etlService.createPending("Administrador", admin, ["siga_1646", "ARIMANA_OLTP"]);
    expect(pending.state).toBe("pending");
    const running = { ...pending, state: "running" as const, updatedAt: new Date().toISOString() };
    await localRepository.put("etlExecutions", running);
    await expect(etlService.execute("Administrador", admin, ["ARIMANA_OLTP"])).rejects.toThrow(/curso/);
    expect((await etlService.getExecution("Administrador", pending.id)).state).toBe("running");
  });

  it("ejecuta fuentes múltiples mediante contrato Mock API con estado, métricas, logs y validación", async () => {
    const execution = await etlService.execute("Administrador", admin, ["siga_1646", "CASTILLONV2", "ARIMANA_OLTP"]);
    expect(execution.state).toBe("completed");
    expect(execution.sourceMetrics).toHaveLength(3);
    expect(execution.extracted).toBeGreaterThan(0);
    expect(execution.transformed).toBe(execution.extracted);
    expect(execution.loaded).toBe(execution.extracted);
    expect(execution.log.join("\n")).toContain("[extract]");
    expect(execution.log.join("\n")).toContain("[transform]");
    expect(execution.log.join("\n")).toContain("[load]");
    expect(execution.logEvents?.some(event => event.level === "info" && event.source === "siga_1646" && event.stage === "extract")).toBe(true);
    expect(execution.validation?.passed).toBe(true);
    expect(execution.errors).toHaveLength(0);
  });

  it("deduplica SamarImportadora/DW y diferencia órdenes B2G de SIGA", async () => {
    const execution = await etlService.execute("Administrador", admin, ["SamarImportadora", "DW_SamarImportadora", "siga_1646"]);
    const dw = execution.sourceMetrics.find(item => item.source === "DW_SamarImportadora")!;
    expect(dw.transformed).toBeGreaterThan(0); expect(dw.loaded).toBe(0);
    expect(execution.log.some(line => line.includes("duplicadas"))).toBe(true);
    const rows = await etlService.listConsolidated("Administrador");
    expect(rows.some(row => row.source === "siga_1646" && row.businessType === "b2g-order")).toBe(true);
    expect(new Set(rows.map(row => row.sourceKey)).size).toBe(rows.length);
  });

  it("consulta seguimiento, historial, auditoría y permite reejecutar", async () => {
    const first = await etlService.execute("Administrador", admin, ["ARIMANA_OLTP"]);
    expect((await etlService.listExecutions("Administrador", { state: "completed" })).some(item => item.id === first.id)).toBe(true);
    expect((await etlService.auditHistory("Administrador", first.id)).map(item => item.action)).toEqual(expect.arrayContaining(["ETL_EXECUTION_CREATED", "ETL_EXECUTION_COMPLETED"]));
    const second = await etlService.rerun("Administrador", admin, first.id);
    expect(second.id).not.toBe(first.id); expect(second.state).toBe("completed");
  });

  it("limpia solo el consolidado con auditoría y permite cargarlo nuevamente", async () => {
    const execution = await etlService.execute("Administrador", admin, ["CASTILLONV2"]);
    expect(await etlService.listConsolidated("Administrador")).not.toHaveLength(0);
    const cleared = await etlService.clearConsolidated("Administrador", admin);
    expect(cleared).toBeGreaterThan(0);
    expect(await etlService.listConsolidated("Administrador")).toHaveLength(0);
    expect(await localRepository.get("etlExecutions", execution.id)).toBeDefined();
    expect((await etlService.auditHistory("Administrador")).some(item => item.action === "ETL_CONSOLIDATED_CLEARED")).toBe(true);
    await etlService.rerun("Administrador", admin, execution.id);
    expect(await etlService.listConsolidated("Administrador")).not.toHaveLength(0);
  });

  it("protege todas las operaciones ETL para el Administrador", async () => {
    const roles = ["Vendedor", "Cajero", "Gerencia", "Analista"] as const;
    for (const role of roles) {
      await expect(etlService.listConnections(role)).rejects.toThrow(/permiso/);
      await expect(etlService.listExecutions(role)).rejects.toThrow(/permiso/);
      await expect(etlService.listConsolidated(role)).rejects.toThrow(/permiso/);
    }
  });
});
