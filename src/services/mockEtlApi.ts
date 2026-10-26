import type { ConsolidatedRow, EtlLoadValidation, EtlLogEvent, EtlSourceMetric, EtlStageError, EtlSourceName } from "@/domain/models";

export interface MockConnectionRequest { source: EtlSourceName; server: string; engine: string; database: string; username: string; password?: string }
export interface MockConnectionResponse { valid: boolean; message: string; checkedAt: string }
export interface MockEtlResponse { metrics: EtlSourceMetric[]; rows: ConsolidatedRow[]; logs: string[]; events: EtlLogEvent[]; errors: EtlStageError[]; validation: EtlLoadValidation }
export type MockProgressHandler = (event: EtlLogEvent) => void | Promise<void>;

const sourceIndex = (source: EtlSourceName) => ["siga_1646", "SamarImportadora", "DW_SamarImportadora", "CASTILLONV2", "BD_CASTILLON_VETERINARIA", "ARIMANA_OLTP"].indexOf(source);
const base = (id: string, now: string) => ({ id, createdAt: now, updatedAt: now, status: "active" as const, demo: true as const });

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
      const extracted = 4 + (sourceIndex(source) % 3);
      const transformed = extracted;
      const isDwDuplicate = source === "DW_SamarImportadora" && selected.includes("SamarImportadora");
      const loaded = isDwDuplicate ? 0 : extracted;
      for (let index = 1; index <= extracted; index += 1) {
        const duplicate = (source === "DW_SamarImportadora" && selected.includes("SamarImportadora"));
        if (duplicate) continue;
        const isB2g = source === "siga_1646" && index === 1;
        rows.push({ ...base(`etl-${now}-${source}-${index}`, now), source, sourceKey: `${source}-${index}`, transactionKey: `${source}-transaction-${index}`, dimension: isB2g ? "Orden SIGA B2G" : "Venta consolidada", amount: (position + 1) * index * 10, date: now.slice(0, 10), businessType: isB2g ? "b2g-order" : "sale", origin: source, productName: `Producto ${((index - 1) % 3) + 1}`, categoryName: index % 2 ? "Accesorios" : "Hogar", companyName: index % 2 ? "Comercial Andina SAC" : "Empresa Central SAC", sellerName: index % 2 ? "María Fernanda Torres" : "Carlos Ramírez", branchName: index % 2 ? "Sucursal Central" : "Sucursal Norte", departmentName: "Lima", provinceName: "Lima", districtName: index % 2 ? "Miraflores" : "San Isidro" });
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
