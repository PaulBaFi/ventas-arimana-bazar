import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SubmitEvent,
} from "react";
import type {
  EtlConnection,
  EtlExecution,
  EtlLogEvent,
  EtlSourceName,
  User,
} from "@/domain/models";
import { ETL_SOURCE_NAMES } from "@/domain/models";
import { authService } from "@/services/authService";
import { etlService, type EtlConnectionInput } from "@/services/etlService";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";

const emptyConnection = (name: EtlSourceName): EtlConnectionInput => ({
  name,
  server: "",
  engine: "PostgreSQL",
  database: "",
  username: "",
  password: "",
});
const sourceLabel = (source: EtlSourceName) =>
  source === "siga_1646" ? "SIGA 1646" : source;
const levelStyle = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
} as const;

export function EtlPage() {
  const [actor, setActor] = useState<User | null>(null);
  const [connections, setConnections] = useState<EtlConnection[]>([]);
  const [executions, setExecutions] = useState<EtlExecution[]>([]);
  const [consolidated, setConsolidated] = useState<
    Awaited<ReturnType<typeof etlService.listConsolidated>>
  >([]);
  const [selectedSource, setSelectedSource] = useState<EtlSourceName>(
    ETL_SOURCE_NAMES[0],
  );
  const [selectedSources, setSelectedSources] = useState<EtlSourceName[]>([]);
  const [form, setForm] = useState<EtlConnectionInput>(
    emptyConnection(ETL_SOURCE_NAMES[0]),
  );
  const [selectedExecution, setSelectedExecution] =
    useState<EtlExecution | null>(null);
  const [liveEvents, setLiveEvents] = useState<EtlLogEvent[]>([]);
  const [liveState, setLiveState] = useState<EtlExecution["state"]>("pending");
  const [liveProgress, setLiveProgress] = useState(0);
  const [query, setQuery] = useState("");
  const [historyState, setHistoryState] = useState<
    EtlExecution["state"] | "all"
  >("all");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | string | null>(null);

  const reload = useCallback(async () => {
    const current = await authService.currentUser();
    if (!current) {
      window.location.replace("/login/");
      return;
    }
    setActor(current);
    const [connectionRows, executionRows, consolidatedRows] = await Promise.all(
      [
        etlService.listConnections(current.role),
        etlService.listExecutions(current.role, { state: historyState }),
        etlService.listConsolidated(current.role, query),
      ],
    );
    setConnections(connectionRows);
    setExecutions(executionRows);
    setConsolidated(consolidatedRows);
    if (executionRows[0] && !selectedExecution)
      setSelectedExecution(executionRows[0]);
  }, [historyState, query, selectedExecution]);
  useEffect(() => {
    void reload().catch((value) =>
      setMessage({
        ok: false,
        text:
          value instanceof Error
            ? value.message
            : "No se pudo cargar el panel ETL.",
      }),
    );
  }, [reload]);

  const configured = useMemo(
    () => new Map(connections.map((item) => [item.name, item])),
    [connections],
  );
  const currentExecution = selectedExecution
    ? (executions.find((item) => item.id === selectedExecution.id) ??
      selectedExecution)
    : executions[0];
  const displayedEvents = liveEvents.length
    ? liveEvents
    : (currentExecution?.logEvents ?? []);
  const latestLoad = consolidated.reduce<string | undefined>(
    (latest, row) => (!latest || row.date > latest ? row.date : latest),
    undefined,
  );
  const selectedMetricCount = currentExecution?.loaded ?? 0;

  function selectSource(source: EtlSourceName) {
    setSelectedSource(source);
    const saved = configured.get(source);
    setForm(
      saved
        ? {
            id: saved.id,
            name: saved.name,
            server: saved.server,
            engine: saved.engine,
            database: saved.database,
            username: saved.username,
            password: "",
          }
        : emptyConnection(source),
    );
    setError("");
  }
  async function validateConnection() {
    if (!actor) return;
    setBusy(true);
    setError("");
    try {
      const result = await etlService.validateConnection(actor.role, form);
      setMessage({ ok: result.valid, text: result.message });
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "No se pudo validar la conexión.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveConnection(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor) return;
    setBusy(true);
    setError("");
    try {
      await etlService.saveConnection(actor.role, actor, form);
      setMessage({
        ok: true,
        text: "Configuración guardada. La contraseÃ±a no fue almacenada.",
      });
      await reload();
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "No se pudo guardar la configuración.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (!actor || !selectedSources.length) return;
    setBusy(true);
    setMessage(null);
    setLiveEvents([]);
    setLiveProgress(2);
    setLiveState("pending");
    const expectedEvents = selectedSources.length * 3 + 2;
    try {
      const result = await etlService.execute(
        actor.role,
        actor,
        selectedSources,
        (event) => {
          setLiveState("running");
          setLiveEvents((current) => [...current, event]);
          setLiveProgress((current) =>
            Math.min(96, current + Math.ceil(94 / expectedEvents)),
          );
        },
      );
      setLiveState(result.state);
      setLiveProgress(100);
      setSelectedExecution(result);
      setMessage({
        ok: result.state === "completed",
        text:
          result.state === "completed"
            ? "ETL finalizado y consolidado validado."
            : "ETL finalizado con errores.",
      });
      await reload();
    } catch (value) {
      setLiveState("error");
      setLiveProgress(100);
      setMessage({
        ok: false,
        text:
          value instanceof Error
            ? value.message
            : "No se pudo ejecutar el ETL.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function rerun(execution: EtlExecution) {
    if (!actor) return;
    setBusy(true);
    setLiveEvents([]);
    setLiveProgress(2);
    setLiveState("pending");
    try {
      const result = await etlService.rerun(actor.role, actor, execution.id);
      setLiveState(result.state);
      setLiveProgress(100);
      setSelectedExecution(result);
      setMessage({
        ok: result.state === "completed",
        text: "El proceso fue ejecutado nuevamente.",
      });
      await reload();
    } catch (value) {
      setMessage({
        ok: false,
        text:
          value instanceof Error
            ? value.message
            : "No se pudo reejecutar el proceso.",
      });
    } finally {
      setBusy(false);
    }
  }
  async function confirmAction() {
    if (!actor || !confirm) return;
    setBusy(true);
    try {
      if (confirm === "clear") {
        const count = await etlService.clearConsolidated(actor.role, actor);
        setMessage({
          ok: true,
          text: `Se limpiaron ${count} filas. Las fuentes y auditorÃ­as fueron preservadas.`,
        });
      } else {
        await etlService.removeConnection(actor.role, actor, confirm);
        setMessage({ ok: true, text: "Configuración eliminada." });
      }
      setConfirm(null);
      await reload();
    } catch (value) {
      setMessage({
        ok: false,
        text:
          value instanceof Error
            ? value.message
            : "No se pudo completar la operación.",
      });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  const toggleSource = (source: EtlSourceName, checked: boolean) =>
    setSelectedSources((current) =>
      checked
        ? [...current, source]
        : current.filter((item) => item !== source),
    );

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-surface-sidebar p-6 text-white shadow-card sm:p-8">
        <p className="text-sm font-bold uppercase tracking-wider text-sky-300">
          Administración e integración
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-3xl font-extrabold">Panel de procesos ETL</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Configura fuentes, ejecuta cargas, consulta resultados y
              administra el consolidado desde un solo espacio de trabajo.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm">
            <span className="block text-slate-400">Fuentes disponibles</span>
            <strong>{ETL_SOURCE_NAMES.length}</strong>
          </div>
        </div>
      </header>
      {message && (
        <div
          role="status"
          className={`flex justify-between rounded-lg p-3 text-sm ${message.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}
        >
          {message.text}
          <button
            type="button"
            aria-label="Cerrar mensaje"
            onClick={() => setMessage(null)}
          >
            Ã—
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-border-default bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-active">
              01 · Configuraciónn
            </p>
            <h2 className="mt-1 text-xl font-bold">Conexión de origen</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Selecciona una de las seis fuentes y valida sus parÃ¡metros sin
              conectarte a servidores reales.
            </p>
          </div>
          <span className="rounded-full bg-success-subtle px-3 py-1 text-xs font-bold text-success">
            Credenciales protegidas
          </span>
        </div>
        <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
          <div className="space-y-2">
            <label
              className="text-xs font-bold uppercase tracking-wide text-text-secondary"
              htmlFor="etl-source"
            >
              Base de datos de origen
            </label>
            <select
              id="etl-source"
              value={selectedSource}
              onChange={(event) =>
                selectSource(event.target.value as EtlSourceName)
              }
              className="min-h-11 w-full rounded-lg border border-border-default bg-white px-3 text-sm"
            >
              {ETL_SOURCE_NAMES.map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
            <div className="grid gap-2 pt-2">
              {ETL_SOURCE_NAMES.map((source) => (
                <button
                  type="button"
                  key={source}
                  onClick={() => selectSource(source)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${source === selectedSource ? "border-primary bg-primary/5 text-primary-active" : "border-border-default text-text-secondary"}`}
                >
                  <span>{sourceLabel(source)}</span>
                  <span
                    className={`size-2 rounded-full ${configured.has(source) ? "bg-success" : "bg-slate-300"}`}
                  />
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={saveConnection} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">
              Nombre del servidor
              <input
                required
                value={form.server}
                onChange={(event) =>
                  setForm({ ...form, server: event.target.value })
                }
                className="min-h-11 rounded-lg border border-border-default px-3 font-normal"
                placeholder="servidor-origen"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Motor de base de datos
              <input
                required
                value={form.engine}
                onChange={(event) =>
                  setForm({ ...form, engine: event.target.value })
                }
                className="min-h-11 rounded-lg border border-border-default px-3 font-normal"
                placeholder="PostgreSQL, SQL Serverâ€¦"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Nombre de la base de datos
              <input
                required
                value={form.database}
                onChange={(event) =>
                  setForm({ ...form, database: event.target.value })
                }
                className="min-h-11 rounded-lg border border-border-default px-3 font-normal"
                placeholder="base_origen"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Usuario
              <input
                required
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                className="min-h-11 rounded-lg border border-border-default px-3 font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
              ContraseÃ±a
              <input
                type="password"
                autoComplete="new-password"
                value={form.password ?? ""}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                className="min-h-11 rounded-lg border border-border-default px-3 font-normal"
                placeholder={
                  form.id
                    ? "Dejar vacÃ­o para conservar el indicador"
                    : "Solo se usa para validar"
                }
              />
            </label>
            {error && (
              <p className="rounded-lg bg-danger-subtle p-3 text-sm text-danger sm:col-span-2">
                {error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
              <ActionButton
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void validateConnection()}
              >
                Validar conexión
              </ActionButton>
              <ActionButton type="submit" disabled={busy}>
                {busy ? "Guardandoâ€¦" : "Guardar configuración"}
              </ActionButton>
            </div>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-primary-active">
            02 Â· Control de ejecución
          </p>
          <h2 className="mt-1 text-xl font-bold">Ejecutar proceso ETL</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Selecciona una o varias fuentes configuradas para iniciar una carga.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ETL_SOURCE_NAMES.map((source) => (
            <label
              key={source}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${selectedSources.includes(source) ? "border-primary bg-primary/5" : "border-border-default"}`}
            >
              <input
                type="checkbox"
                checked={selectedSources.includes(source)}
                disabled={!configured.has(source)}
                onChange={(event) => toggleSource(source, event.target.checked)}
              />
              <span className="min-w-0">
                <strong className="block truncate text-sm">
                  {sourceLabel(source)}
                </strong>
                <small className="text-text-secondary">
                  {configured.has(source)
                    ? "Lista para procesar"
                    : "Configura esta fuente arriba"}
                </small>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-4 rounded-xl bg-surface-page p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div>
            <span className="block text-xs uppercase text-text-secondary">
              Estado actual
            </span>
            <StatusBadge status={liveState} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-text-secondary">
              <span>Progreso de la ejecución</span>
              <strong>{liveProgress}%</strong>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${liveProgress}%` }}
              />
            </div>
          </div>
          <ActionButton
            disabled={!selectedSources.length || busy}
            onClick={() => void execute()}
          >
            {busy ? "Procesandoâ€¦" : "Ejecutar ETL"}
          </ActionButton>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <span className="block text-text-secondary">
              Última ejecución
            </span>
            <strong>
              {currentExecution
                ? new Date(currentExecution.startedAt).toLocaleString("es-PE")
                : "Sin ejecuciones"}
            </strong>
          </div>
          <div>
            <span className="block text-text-secondary">
              Registros procesados
            </span>
            <strong>{selectedMetricCount || "—"}</strong>
          </div>
          <div>
            <span className="block text-text-secondary">
              Fuentes seleccionadas
            </span>
            <strong>{selectedSources.length}</strong>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <ActionButton
            variant="secondary"
            disabled={!currentExecution}
            onClick={() =>
              document
                .getElementById("etl-results")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Consultar resultados
          </ActionButton>
        </div>
      </section>
      <section
        id="etl-results"
        className="rounded-2xl border border-border-default bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-active">
              03 · Seguimiento
            </p>
            <h2 className="mt-1 text-xl font-bold">Logs de ejecución</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Eventos informativos, advertencias y errores por fuente y etapa.
            </p>
          </div>
          {currentExecution && (
            <select
              value={currentExecution.id}
              onChange={(event) =>
                setSelectedExecution(
                  executions.find((item) => item.id === event.target.value) ??
                    null,
                )
              }
              className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"
            >
              {executions.map((item) => (
                <option key={item.id} value={item.id}>
                  {new Date(item.startedAt).toLocaleString("es-PE")}
                </option>
              ))}
            </select>
          )}
        </div>
        {displayedEvents.length > 0 ? (
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-slate-950 p-4">
            {displayedEvents.map((event) => (
              <div
                key={event.id}
                className={`rounded-lg border p-3 text-xs ${levelStyle[event.level]}`}
              >
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono">
                  <strong>{event.level.toUpperCase()}</strong>
                  <span>
                    {new Date(event.timestamp).toLocaleString("es-PE")}
                  </span>
                  {event.source && <span>{event.source}</span>}
                  {event.stage && <span>#{event.stage}</span>}
                </div>
                <p className="mt-1">{event.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border-default p-10 text-center text-sm text-text-secondary">
            Los eventos aparecerán aquí al ejecutar un proceso ETL.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border-default bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-active">
              04 Â· Consolidado
            </p>
            <h2 className="mt-1 text-xl font-bold">Base consolidada</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Conserva procedencia, claves de origen y auditorÃ­a independiente
              de las fuentes.
            </p>
          </div>
          <ActionButton
            variant="danger"
            disabled={!consolidated.length || busy}
            onClick={() => setConfirm("clear")}
          >
            Limpiar base consolidada
          </ActionButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-page p-4">
            <span className="block text-xs uppercase text-text-secondary">
              Registros consolidados
            </span>
            <strong className="mt-1 block text-2xl">
              {consolidated.length}
            </strong>
          </div>
          <div className="rounded-xl bg-surface-page p-4">
            <span className="block text-xs uppercase text-text-secondary">
              Fecha de última carga
            </span>
            <strong className="mt-1 block">{latestLoad ?? "Sin cargas"}</strong>
          </div>
          <div className="rounded-xl bg-surface-page p-4">
            <span className="block text-xs uppercase text-text-secondary">
              Estado de integridad
            </span>
            <strong className="mt-1 block text-success">
              {currentExecution?.validation?.passed ? "Aprobada" : "Pendiente"}
            </strong>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar fuente, clave u operación"
            className="min-h-10 w-full rounded-lg border border-border-default px-3 text-sm sm:max-w-md"
          />
          <span className="text-xs text-text-secondary">
            La limpieza no elimina fuentes originales ni auditorÃ­as.
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border-default">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-page text-xs uppercase text-text-secondary">
              <tr>
                <th className="p-3">Fuente</th>
                <th className="p-3">Clave</th>
                <th className="p-3">Procedencia</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Importe</th>
                <th className="p-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {consolidated.slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td className="p-3 font-semibold">{row.source}</td>
                  <td className="p-3">{row.sourceKey}</td>
                  <td className="p-3">{row.origin}</td>
                  <td className="p-3">
                    {row.businessType === "b2g-order"
                      ? "Orden B2G"
                      : "Venta comercial"}
                  </td>
                  <td className="p-3">S/ {row.amount.toFixed(2)}</td>
                  <td className="p-3">{row.date}</td>
                </tr>
              ))}
              {!consolidated.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-text-secondary"
                  >
                    Ejecuta el ETL para cargar registros consolidados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary-active">
              05 Â· Historial y auditorÃ­a
            </p>
            <h2 className="mt-1 text-xl font-bold">Procesos registrados</h2>
          </div>
          <select
            value={historyState}
            onChange={(event) =>
              setHistoryState(event.target.value as typeof historyState)
            }
            className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="running">En ejecución</option>
            <option value="completed">Finalizado</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border-default">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-page text-xs uppercase text-text-secondary">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Fuentes</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Duración</th>
                <th className="p-3">Resultado</th>
                <th className="p-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {executions.map((item) => (
                <tr key={item.id}>
                  <td className="p-3">
                    {new Date(item.startedAt).toLocaleString("es-PE")}
                  </td>
                  <td className="p-3">{item.sourceNames.join(", ")}</td>
                  <td className="p-3">
                    <StatusBadge status={item.state} />
                  </td>
                  <td className="p-3">{item.durationSeconds.toFixed(1)} s</td>
                  <td className="p-3">
                    {item.loaded} cargados Â· {item.rejected} rechazados
                  </td>
                  <td className="p-3">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="font-bold text-primary-active hover:underline"
                        onClick={() => {
                          setSelectedExecution(item);
                          document
                            .getElementById("etl-results")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        Ver logs
                      </button>
                      <button
                        type="button"
                        className="font-bold text-text-secondary hover:underline"
                        disabled={busy}
                        onClick={() => void rerun(item)}
                      >
                        Reejecutar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!executions.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-text-secondary"
                  >
                    Aún no hay procesos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-primary-active">
            Configuraciones existentes
          </p>
          <h2 className="mt-1 text-xl font-bold">Fuentes registradas</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ETL_SOURCE_NAMES.map((source) => {
            const item = configured.get(source);
            return (
              <article
                key={source}
                className="rounded-xl border border-border-default p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold">{sourceLabel(source)}</h3>
                  <span
                    className={`size-2.5 rounded-full ${item ? "bg-success" : "bg-slate-300"}`}
                  />
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  {item
                    ? `${item.server} Â· ${item.database}`
                    : "Sin configuración guardada"}
                </p>
                <div className="mt-3 flex gap-3 text-xs font-bold">
                  {item && (
                    <button
                      type="button"
                      className="text-primary-active hover:underline"
                      onClick={() => selectSource(source)}
                    >
                      Editar
                    </button>
                  )}
                  {item && (
                    <button
                      type="button"
                      className="text-danger hover:underline"
                      onClick={() => setConfirm(item.id)}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm === "clear"
            ? "Limpiar base consolidada"
            : "Eliminar configuración"
        }
        message={
          confirm === "clear"
            ? "Â¿Confirmas limpiar todos los registros consolidados? Las fuentes originales, ejecuciones y auditorÃ­as no serÃ¡n eliminadas."
            : "Â¿Confirmas eliminar esta configuración de conexión? Los procesos y auditorÃ­as existentes se conservarÃ¡n."
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmAction()}
      />
    </div>
  );
}
