import type { ConsolidatedRow, EtlLoadValidation, EtlLogEvent, EtlSourceMetric, EtlStageError, EtlSourceName } from "@/domain/models";

export interface MockConnectionRequest { source: EtlSourceName; server: string; engine: string; database: string; username: string; password?: string }
export interface MockConnectionResponse { valid: boolean; message: string; checkedAt: string }
export interface MockEtlResponse { metrics: EtlSourceMetric[]; rows: ConsolidatedRow[]; logs: string[]; events: EtlLogEvent[]; errors: EtlStageError[]; validation: EtlLoadValidation }
export type MockProgressHandler = (event: EtlLogEvent) => void | Promise<void>;

const base = (id: string, now: string) => ({ id, createdAt: now, updatedAt: now, status: "active" as const, demo: true as const });
const products = ["Polera urbana", "Zapatilla deportiva", "Sandalia clásica", "Mochila acolchada", "Peluche artesanal", "Cartera esencial", "Gorra deportiva", "Organizador compacto"];
const categories = ["Ropa", "Calzado", "Sandalias", "Mochilas", "Peluches", "Carteras", "Gorras", "Hogar"];
const sellers = ["María Fernanda Torres", "Carlos Ramírez Huamán", "Jimena Valdivia Soto", "Luis Alberto Cárdenas", "Ana Lucía Paredes", "Jorge Salinas Flores"];
const branches = ["Arimana Centro", "Arimana Miraflores", "Arimana Arequipa", "Arimana Trujillo"];
const locations = [["Lima", "Lima", "Miraflores"], ["Lima", "Lima", "San Isidro"], ["Arequipa", "Arequipa", "Cayma"], ["La Libertad", "Trujillo", "Trujillo"]];

/** REST/OpenAPI-compatible boundary. It never opens a socket and never returns credentials. */
export const mockEtlApi = {
  async validateConnection(input: MockConnectionRequest): Promise<MockConnectionResponse> {
    const checkedAt = new Date().toISOString();
    const valid = Boolean(input.source && input.server.trim() && input.engine.trim() && input.database.trim() && input.username.trim());
    return { valid, checkedAt, message: valid ? `Conexión a ${input.source} validada.` : "Completa servidor, motor, base de datos y usuario." };
  },
  async execute(sourceNames: EtlSourceName[], onProgress?: MockProgressHandler): Promise<MockEtlResponse> {
    const now = new Date().toISOString();
    const selected = [...new Set(sourceNames)];
    const rows: ConsolidatedRow[] = [];
    const logs = [`[extract] Inicio de extracción para ${selected.length} fuente(s).`];
    const events: EtlLogEvent[] = [];
    const errors: EtlStageError[] = [];
    const emit = async (event: Omit<EtlLogEvent, "id">) => {
      const complete = { ...event, id: crypto.randomUUID() };
      events.push(complete);
      await onProgress?.(complete);
    };
    await emit({ timestamp: now, level: "info", message: `Inicio de extracción para ${selected.length} fuente(s).` });
    const metrics: EtlSourceMetric[] = [];
    for (const [position, source] of selected.entries()) {
    const extracted = source === "siga_1646" ? 36 : 42;
      const transformed = extracted;
      const isDwDuplicate = source === "DW_SamarImportadora" && selected.includes("SamarImportadora");
      const loaded = isDwDuplicate ? 0 : extracted;
      for (let index = 1; index <= extracted; index += 1) {
        const duplicate = (source === "DW_SamarImportadora" && selected.includes("SamarImportadora"));
        if (duplicate) continue;
      const isB2g = source === "siga_1646" && index <= 3;
      const period = new Date(Date.UTC(2026, 9 - ((index + position) % 12), 1 + ((index * 3) % 25)));
      const location = locations[(index + position) % locations.length];
      rows.push({ ...base(`etl-${now}-${source}-${index}`, now), source, sourceKey: `${source}-${index}`, transactionKey: source === "SamarImportadora" || source === "DW_SamarImportadora" ? `venta-integrada-${index}` : `${source}-transaction-${index}`, dimension: isB2g ? "Orden SIGA B2G" : "Venta consolidada", amount: 18 + ((index * 17 + position * 23) % 280), date: period.toISOString().slice(0, 10), businessType: isB2g ? "b2g-order" : "sale", origin: source, productName: products[(index + position) % products.length], categoryName: categories[(index + position) % categories.length], companyName: index % 3 ? "Comercial Andina SAC" : "Corporación La Alameda EIRL", sellerName: sellers[(index + position) % sellers.length], branchName: branches[(index + position) % branches.length], departmentName: location[0], provinceName: location[1], districtName: location[2] });
      }
      logs.push(`[extract] ${source}: ${extracted} registros extraídos.`);
      logs.push(`[transform] ${source}: ${transformed} registros transformados.`);
      if (isDwDuplicate) logs.push(`[transform] ${source}: operaciones duplicadas respecto a SamarImportadora, no se cargan.`);
      logs.push(`[load] ${source}: ${loaded} registros cargados.`);
      await emit({ timestamp: new Date().toISOString(), level: "info", source, stage: "extract", message: `${extracted} registros extraídos.` });
      await emit({ timestamp: new Date().toISOString(), level: isDwDuplicate ? "warning" : "info", source, stage: "transform", message: isDwDuplicate ? "Operaciones duplicadas respecto a SamarImportadora; no se cargarán." : `${transformed} registros transformados.` });
      await emit({ timestamp: new Date().toISOString(), level: "info", source, stage: "load", message: `${loaded} registros cargados.` });
      metrics.push({ source, extracted, transformed, loaded, rejected: 0, durationSeconds: 0.1 + position / 10, integrityPassed: true });
    }
    const totalRows = rows.length;
    const uniqueSourceKeys = new Set(rows.map(row => row.sourceKey)).size;
    const validation: EtlLoadValidation = { totalRows, uniqueSourceKeys, orphanRows: 0, passed: totalRows === uniqueSourceKeys && !errors.length, checkedAt: now };
    logs.push(`[validate] ${totalRows} filas cargadas; integridad ${validation.passed ? "aprobada" : "observada"}.`);
    await emit({ timestamp: new Date().toISOString(), level: validation.passed ? "info" : "error", stage: "validate", message: `${totalRows} filas cargadas; integridad ${validation.passed ? "aprobada" : "observada"}.` });
    return { metrics, rows, logs, events, errors, validation };
  },
};
