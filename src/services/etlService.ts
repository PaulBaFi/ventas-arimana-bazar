import type { AuditLog, ConsolidatedRow, EtlConnection, EtlExecution, EtlSourceName, User, UserRole } from "@/domain/models";
import { ETL_SOURCE_NAMES } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { localRepository } from "@/persistence/database";
import { mockEtlApi, type MockProgressHandler } from "./mockEtlApi";

export interface EtlConnectionInput { id?: string; name: EtlSourceName; server: string; engine: string; database: string; username: string; password?: string }
export interface EtlExecutionFilter { state?: EtlExecution["state"] | "all"; source?: EtlSourceName | "all" }
const running = new Set<string>();
const stamp = () => new Date().toISOString();
const audit = (actor: User, action: string, target: string, message: string, result: AuditLog["result"] = "success"): AuditLog => ({ id: crypto.randomUUID(), actorId: actor.id, action, target, result, message, createdAt: stamp(), updatedAt: stamp(), status: "active", demo: true });
const blankMetric = (source: EtlSourceName) => ({ source, extracted: 0, transformed: 0, loaded: 0, rejected: 0, durationSeconds: 0, integrityPassed: false });

export class EtlService {
  private guard(role: UserRole) { assertPermission(role, "etl:admin"); }
  async listConnections(role: UserRole, query = ""): Promise<EtlConnection[]> {
    this.guard(role); const term = query.trim().toLocaleLowerCase("es");
    return (await localRepository.list("etlConnections")).filter(item => !term || `${item.name} ${item.server} ${item.engine} ${item.database} ${item.username}`.toLocaleLowerCase("es").includes(term)).sort((a, b) => a.name.localeCompare(b.name));
  }
  async saveConnection(role: UserRole, actor: User, input: EtlConnectionInput): Promise<EtlConnection> {
    this.guard(role);
    if (!ETL_SOURCE_NAMES.includes(input.name)) throw new Error("La fuente ETL no pertenece al catálogo autorizado.");
    for (const [value, label] of [[input.server, "servidor"], [input.engine, "motor"], [input.database, "base de datos"], [input.username, "usuario"]] as const) if (!value.trim()) throw new Error(`El ${label} es obligatorio.`);
    const connections = await localRepository.list("etlConnections");
    const previous = input.id ? connections.find(item => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error("No se encontró la conexión.");
    const duplicate = connections.find(item => item.name === input.name && item.id !== input.id);
    if (duplicate) throw new Error("Ya existe una conexión para esa fuente.");
    const now = stamp();
    const connection: EtlConnection = { id: previous?.id ?? crypto.randomUUID(), name: input.name, server: input.server.trim(), engine: input.engine.trim(), database: input.database.trim(), username: input.username.trim(), credentialConfigured: Boolean(input.password?.trim()) || previous?.credentialConfigured === true, createdAt: previous?.createdAt ?? now, updatedAt: now, status: "active", demo: true };
    await localRepository.saveEtlConnection(connection, audit(actor, previous ? "ETL_CONNECTION_UPDATED" : "ETL_CONNECTION_CREATED", connection.id, `Conexión ${connection.name} guardada. La contraseña no se persiste.`));
    return connection;
  }
  async validateConnection(role: UserRole, input: EtlConnectionInput): Promise<{ valid: boolean; message: string; checkedAt: string }> {
    this.guard(role);
    return mockEtlApi.validateConnection({ source: input.name, server: input.server, engine: input.engine, database: input.database, username: input.username, password: input.password });
  }
  async removeConnection(role: UserRole, actor: User, id: string): Promise<void> {
    this.guard(role); const item = await localRepository.get("etlConnections", id); if (!item) throw new Error("No se encontró la conexión.");
    await localRepository.remove("etlConnections", id);
    await localRepository.put("auditLogs", audit(actor, "ETL_CONNECTION_DELETED", id, `Conexión ${item.name} eliminada.`));
  }
  async listExecutions(role: UserRole, filter: EtlExecutionFilter = {}): Promise<EtlExecution[]> {
    this.guard(role);
    return (await localRepository.list("etlExecutions")).filter(item => (!filter.state || filter.state === "all" || item.state === filter.state) && (!filter.source || filter.source === "all" || item.sourceNames.includes(filter.source))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  async getExecution(role: UserRole, id: string): Promise<EtlExecution> {
    this.guard(role); const execution = await localRepository.get("etlExecutions", id); if (!execution) throw new Error("No se encontró la ejecución ETL."); return execution;
  }
  async createPending(role: UserRole, actor: User, sourceNames: EtlSourceName[]): Promise<EtlExecution> {
    this.guard(role); const selected = [...new Set(sourceNames)];
    if (!selected.length) throw new Error("Selecciona al menos una fuente ETL.");
    if (selected.some(source => !ETL_SOURCE_NAMES.includes(source))) throw new Error("La selección contiene una fuente no autorizada.");
    const existing = await localRepository.list("etlExecutions");
    if (existing.some(item => item.state === "running" && item.sourceNames.some(source => selected.includes(source)))) throw new Error("Ya existe una ejecución en curso para una fuente seleccionada.");
    const now = stamp();
    const execution: EtlExecution = { id: crypto.randomUUID(), sourceNames: selected, state: "pending", startedAt: now, durationSeconds: 0, log: ["Proceso en cola."], extracted: 0, transformed: 0, loaded: 0, rejected: 0, sourceMetrics: selected.map(blankMetric), errors: [], createdAt: now, updatedAt: now, status: "active", demo: true };
    await localRepository.put("etlExecutions", execution);
    await localRepository.put("auditLogs", audit(actor, "ETL_EXECUTION_CREATED", execution.id, `Ejecución creada para ${selected.join(", ")}.`));
    return execution;
  }
  async execute(role: UserRole, actor: User, sourceNames: EtlSourceName[], onProgress?: MockProgressHandler): Promise<EtlExecution> {
    this.guard(role); const pending = await this.createPending(role, actor, sourceNames);
    return this.runPending(role, actor, pending.id, onProgress);
  }
  async rerun(role: UserRole, actor: User, id: string): Promise<EtlExecution> {
    this.guard(role); const previous = await this.getExecution(role, id); return this.execute(role, actor, previous.sourceNames);
  }
  async runPending(role: UserRole, actor: User, id: string, onProgress?: MockProgressHandler): Promise<EtlExecution> {
    this.guard(role); const pending = await this.getExecution(role, id);
    if (pending.state !== "pending") throw new Error("Solo se pueden iniciar ejecuciones pendientes.");
    if (running.size || pending.sourceNames.some(source => running.has(source))) throw new Error("No se puede iniciar una ejecución incompatible mientras otra está en curso.");
    pending.sourceNames.forEach(source => running.add(source));
    const started = Date.now(); const now = stamp();
    const startedExecution: EtlExecution = { ...pending, state: "running", startedAt: now, updatedAt: now, log: [...pending.log, "Proceso en ejecución."] };
    await localRepository.put("etlExecutions", startedExecution);
    try {
      const response = await mockEtlApi.execute(pending.sourceNames, onProgress);
      const completedAt = stamp();
      const execution: EtlExecution = { ...startedExecution, state: response.errors.length ? "error" : "completed", completedAt, durationSeconds: Math.max(0.1, (Date.now() - started) / 1000), log: response.logs, logEvents: response.events, extracted: response.metrics.reduce((sum, item) => sum + item.extracted, 0), transformed: response.metrics.reduce((sum, item) => sum + item.transformed, 0), loaded: response.metrics.reduce((sum, item) => sum + item.loaded, 0), rejected: response.metrics.reduce((sum, item) => sum + item.rejected, 0), sourceMetrics: response.metrics, errors: response.errors, validation: response.validation, updatedAt: completedAt };
      await localRepository.saveEtlExecution(execution, response.rows, audit(actor, execution.state === "completed" ? "ETL_EXECUTION_COMPLETED" : "ETL_EXECUTION_ERROR", execution.id, `Ejecución ${execution.state}. Sin credenciales en logs.`));
      return execution;
    } catch (error) {
      const failed: EtlExecution = { ...startedExecution, state: "error", completedAt: stamp(), durationSeconds: Math.max(0.1, (Date.now() - started) / 1000), log: [...startedExecution.log, "[error] Error durante la ejecución."], errors: [{ source: pending.sourceNames[0], stage: "validate", message: error instanceof Error ? error.message : "Error ETL no identificado." }], updatedAt: stamp() };
      await localRepository.put("etlExecutions", failed); await localRepository.put("auditLogs", audit(actor, "ETL_EXECUTION_ERROR", id, "La ejecución terminó con error. No se registraron credenciales.")); return failed;
    } finally { pending.sourceNames.forEach(source => running.delete(source)); }
  }
  async listConsolidated(role: UserRole, query = ""): Promise<ConsolidatedRow[]> {
    this.guard(role); const term = query.trim().toLocaleLowerCase("es");
    return (await localRepository.list("consolidatedRows")).filter(row => !term || `${row.source} ${row.sourceKey} ${row.dimension} ${row.businessType} ${row.origin}`.toLocaleLowerCase("es").includes(term)).sort((a, b) => b.date.localeCompare(a.date));
  }
  async clearConsolidated(role: UserRole, actor: User): Promise<number> { this.guard(role); return localRepository.clearConsolidated(audit(actor, "ETL_CONSOLIDATED_CLEARED", "consolidatedRows", "Consolidado limpiado; fuentes originales y auditorías preservadas.")); }
  async auditHistory(role: UserRole, target?: string): Promise<AuditLog[]> { this.guard(role); return (await localRepository.list("auditLogs")).filter(item => !target || item.target === target).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
}
export const etlService = new EtlService();
