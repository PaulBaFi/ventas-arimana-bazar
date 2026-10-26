import type { EtlConnectionInput } from "./etlService";
import { etlService } from "./etlService";
import type { EtlSourceName, User } from "@/domain/models";

export interface ApiRequest { method: string; path: string; body?: unknown }
export interface ApiResponse { status: number; body: unknown }
const ok = (body: unknown, status = 200): ApiResponse => ({ status, body });
const fail = (status: number, message: string): ApiResponse => ({ status, body: { error: { code: status, message } } });
const parseId = (path: string) => path.split("/").filter(Boolean).at(-1) ?? "";
const asConnection = (body: unknown): EtlConnectionInput => {
  if (!body || typeof body !== "object") throw new Error("El Request Body debe ser un objeto JSON.");
  const value = body as Record<string, unknown>;
  return { id: typeof value.id === "string" ? value.id : undefined, name: value.name as EtlSourceName, server: String(value.server ?? ""), engine: String(value.engine ?? ""), database: String(value.database ?? ""), username: String(value.username ?? ""), password: typeof value.password === "string" ? value.password : undefined };
};
const sources = (body: unknown): EtlSourceName[] => {
  if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).sourceNames)) throw new Error("sourceNames debe ser un arreglo de fuentes.");
  return (body as { sourceNames: EtlSourceName[] }).sourceNames;
};

/** Adaptador local para los contratos REST documentados en la interfaz ETL. */
export async function executeEtlApi(actor: User, request: ApiRequest): Promise<ApiResponse> {
  try {
    const { method, path, body } = request;
    if (method === "POST" && path === "/api/etl/conexiones/validar") return ok(await etlService.validateConnection(actor.role, asConnection(body)));
    if (method === "POST" && path === "/api/etl/conexiones") return ok(await etlService.saveConnection(actor.role, actor, asConnection(body)), 201);
    if (method === "GET" && path === "/api/etl/conexiones") return ok(await etlService.listConnections(actor.role));
    if (method === "PUT" && path.startsWith("/api/etl/conexiones/")) return ok(await etlService.saveConnection(actor.role, actor, { ...asConnection(body), id: parseId(path) }));
    if (method === "DELETE" && path.startsWith("/api/etl/conexiones/")) { await etlService.removeConnection(actor.role, actor, parseId(path)); return ok({ message: "Conexión eliminada." }); }
    if (method === "POST" && path === "/api/etl/ejecuciones") return ok(await etlService.execute(actor.role, actor, sources(body)), 201);
    if (method === "GET" && path === "/api/etl/ejecuciones") return ok(await etlService.listExecutions(actor.role));
    if (method === "GET" && /^\/api\/etl\/ejecuciones\/[^/]+$/.test(path)) return ok(await etlService.getExecution(actor.role, parseId(path)));
    if (method === "GET" && path.endsWith("/logs")) { const execution = await etlService.getExecution(actor.role, path.split("/").at(-2) ?? ""); return ok({ executionId: execution.id, events: execution.logEvents ?? [], messages: execution.log }); }
    if (method === "POST" && path === "/api/etl/consolidado/limpieza") { if (!body || (body as { confirm?: boolean }).confirm !== true) return fail(400, "La limpieza requiere confirm=true."); return ok({ deletedRows: await etlService.clearConsolidated(actor.role, actor), message: "Consolidado limpiado; fuentes y auditorías preservadas." }); }
    if (method === "GET" && path === "/api/etl/auditoria") return ok(await etlService.auditHistory(actor.role));
    return fail(404, "Endpoint ETL no encontrado.");
  } catch (error) { return fail(400, error instanceof Error ? error.message : "No se pudo procesar la operación ETL."); }
}
