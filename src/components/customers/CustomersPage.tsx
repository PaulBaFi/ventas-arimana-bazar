import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from "react";
import type { User } from "@/domain/models";
import { hasPermission } from "@/domain/permissions";
import { validateCustomer, type CustomerInput, type ValidationErrors } from "@/domain/validation";
import { customerService, type CustomerRecord } from "@/services/customerService";
import { authService } from "@/services/authService";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Eye, Filter, History, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";

type Draft = CustomerInput;
const blank: Draft = { kind: "person", documentType: "DNI", documentNumber: "", firstName: "", lastName: "", legalName: "", tradeName: "", email: "", phone: "" };
export function CustomersPage() {
  const [actor, setActor] = useState<User | null>(null);
  const [records, setRecords] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [viewing, setViewing] = useState<CustomerRecord | null>(null);
  const [history, setHistory] = useState<{ customer: CustomerRecord; sales: Awaited<ReturnType<typeof customerService.salesHistory>> } | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [confirm, setConfirm] = useState<CustomerRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = hasPermission(actor?.role, "customers:write");
  const reload = useCallback(async () => {
    const current = await authService.currentUser();
    if (!current) { window.location.replace("/login/"); return; }
    setActor(current); setRecords(await customerService.search(current.role, query, status));
  }, [query, status]);
  useEffect(() => { void reload().catch(error => setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudieron cargar los clientes." })); }, [reload]);

  const columns = useMemo<DataColumn<CustomerRecord>[]>(() => [
    { key: "customer", header: "Cliente", value: item => <><p className="font-bold">{item.displayName}</p><p className="text-xs text-text-secondary">{item.kind === "person" ? "Persona natural" : "Empresa"}</p></>, searchable: item => item.displayName },
    { key: "document", header: "Documento", value: item => <><span className="font-semibold">{item.documentType}</span> {item.documentNumber}</>, searchable: item => `${item.documentType} ${item.documentNumber}` },
    { key: "contact", header: "Contacto", value: item => <><span className="block">{item.email || "—"}</span><span className="text-xs text-text-secondary">{item.phone || "Sin teléfono"}</span></>, searchable: item => `${item.email ?? ""} ${item.phone ?? ""}` },
    { key: "status", header: "Estado", value: item => <StatusBadge status={item.status} />, searchable: item => item.status },
    { key: "actions", header: "Acciones", value: item => <div className="flex flex-wrap gap-2"><button type="button" aria-label="Ver cliente" onClick={() => setViewing(item)} className="text-primary-active hover:underline"><Eye size={15} /></button><button type="button" aria-label="Ver ventas del cliente" onClick={() => void showHistory(item)} className="text-primary-active hover:underline"><History size={15} /></button>{canWrite && item.status === "active" && <><button type="button" aria-label="Editar cliente" onClick={() => edit(item)} className="text-text-secondary hover:underline"><Pencil size={15} /></button><button type="button" aria-label="Eliminar cliente" onClick={() => setConfirm(item)} className="text-danger hover:underline"><Trash2 size={15} /></button></>}</div> },
  ], [canWrite]);
  function create() { setEditing(null); setDraft({ ...blank }); setErrors({}); setFormOpen(true); }
  function edit(item: CustomerRecord) { setEditing(item); setDraft(item.kind === "person" ? { ...blank, kind: "person", documentType: item.documentType as "DNI" | "CE", documentNumber: item.documentNumber, firstName: item.firstName ?? "", lastName: item.lastName ?? "", email: item.email ?? "", phone: item.phone ?? "" } : { ...blank, kind: "company", documentType: "RUC", documentNumber: item.documentNumber, legalName: item.legalName ?? item.displayName, tradeName: item.tradeName ?? "", email: item.email ?? "", phone: item.phone ?? "" }); setErrors({}); setFormOpen(true); }
  async function showHistory(item: CustomerRecord) { if (!actor) return; try { setHistoryPage(1); setHistory({ customer: item, sales: await customerService.salesHistory(actor.role, item.id) }); } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo consultar el historial." }); } }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); const validation = validateCustomer(draft); setErrors(validation);
    if (Object.keys(validation).length || !actor) return;
    setBusy(true);
    try { await customerService.save(actor.role, { ...draft, id: editing?.id }); setFormOpen(false); setMessage({ ok: true, text: editing ? "Cliente actualizado." : "Cliente creado y vinculado con su entidad." }); await reload(); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo guardar el cliente." }); }
    finally { setBusy(false); }
  }
  async function remove() { if (!confirm || !actor) return; try { const result = await customerService.delete(actor.role, confirm.id); setConfirm(null); setMessage({ ok: true, text: result === "deactivated" ? "El cliente conserva su historial y fue desactivado." : "Cliente eliminado; no tenía ventas relacionadas." }); await reload(); } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo eliminar el cliente." }); } }

  return <div className="space-y-6">
     <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-wider text-primary-active">Módulo comercial</p><h1 className="mt-1 text-3xl font-extrabold">Clientes</h1><p className="mt-2 text-sm text-text-secondary">Personas naturales y empresas vinculadas a su entidad correspondiente.</p></div>{canWrite && <ActionButton icon={Plus} onClick={create}>Crear cliente</ActionButton>}</div>
     <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-white p-4 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5 text-xs font-bold text-text-secondary"><span className="flex items-center gap-1"><Search size={14} />Buscar por documento, nombre o correo</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar clientes…" className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal text-text-primary" /></label><label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span className="flex items-center gap-1"><Filter size={14} />Estado</span><select value={status} onChange={e => setStatus(e.target.value as typeof status)} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal text-text-primary"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label></div>
    {message && <div role="status" className={`flex justify-between rounded-lg p-3 text-sm ${message.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>{message.text}<button type="button" aria-label="Cerrar mensaje" onClick={() => setMessage(null)}>×</button></div>}
    <DataTable rows={records} columns={columns} rowKey={item => item.id} emptyMessage="No hay clientes que coincidan con la búsqueda." />

    {formOpen && <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/45 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setFormOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="customer-title" className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-modal sm:p-7"><div className="flex justify-between"><div><h2 id="customer-title" className="text-xl font-extrabold">{editing ? "Modificar cliente" : "Crear cliente"}</h2><p className="mt-1 text-sm text-text-secondary">El documento debe ser único.</p></div><button type="button" aria-label="Cerrar" onClick={() => setFormOpen(false)}>×</button></div>
      <form onSubmit={submit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2"><FormField label="Tipo de cliente" name="kind" required><select id="kind" value={draft.kind} disabled={!!editing} onChange={e => setDraft({ ...draft, kind: e.target.value as Draft["kind"], documentType: e.target.value === "company" ? "RUC" : "DNI" })} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm disabled:bg-surface-page"><option value="person">Persona natural</option><option value="company">Empresa</option></select></FormField>
        <FormField label="Tipo de documento" name="documentType" required><select id="documentType" value={draft.documentType} onChange={e => setDraft({ ...draft, documentType: e.target.value as Draft["documentType"] })} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"><option value="DNI">DNI</option>{draft.kind === "person" ? <option value="CE">Carné de extranjería</option> : <option value="RUC">RUC</option>}</select></FormField>
        <FormField label={draft.kind === "company" ? "RUC" : "Número de documento"} name="documentNumber" required value={draft.documentNumber} onChange={e => setDraft({ ...draft, documentNumber: e.target.value })} error={errors.documentNumber} />
        {draft.kind === "person" ? <><FormField label="Nombres" name="firstName" required value={draft.firstName} onChange={e => setDraft({ ...draft, firstName: e.target.value })} error={errors.firstName} /><FormField label="Apellidos" name="lastName" required value={draft.lastName} onChange={e => setDraft({ ...draft, lastName: e.target.value })} error={errors.lastName} /></> : <><FormField label="Razón social" name="legalName" required value={draft.legalName} onChange={e => setDraft({ ...draft, legalName: e.target.value })} error={errors.legalName} /><FormField label="Nombre comercial" name="tradeName" value={draft.tradeName} onChange={e => setDraft({ ...draft, tradeName: e.target.value })} /></>}
        <FormField label="Correo electrónico" name="email" type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} error={errors.email} /><FormField label="Teléfono" name="phone" type="tel" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} />
         {errors.kind && <p className="text-sm text-danger sm:col-span-2">{errors.kind}</p>}<div className="flex justify-end gap-3 pt-2 sm:col-span-2"><ActionButton type="button" variant="secondary" icon={X} onClick={() => setFormOpen(false)}>Cancelar</ActionButton><ActionButton type="submit" icon={Save} disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear cliente"}</ActionButton></div>
      </form></section></div>}
    {viewing && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setViewing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="customer-detail" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-modal"><h2 id="customer-detail" className="text-xl font-bold">Ficha del cliente</h2><dl className="mt-5 grid grid-cols-[9rem_1fr] gap-3 text-sm"><dt className="text-text-secondary">Tipo</dt><dd>{viewing.kind === "person" ? "Persona natural" : "Empresa"}</dd><dt className="text-text-secondary">Nombre</dt><dd className="font-semibold">{viewing.displayName}</dd><dt className="text-text-secondary">Documento</dt><dd>{viewing.documentType} {viewing.documentNumber}</dd><dt className="text-text-secondary">Correo</dt><dd>{viewing.email || "No registrado"}</dd><dt className="text-text-secondary">Teléfono</dt><dd>{viewing.phone || "No registrado"}</dd><dt className="text-text-secondary">Referencia vinculada</dt><dd>{viewing.personId ?? viewing.companyId}</dd><dt className="text-text-secondary">Estado</dt><dd><StatusBadge status={viewing.status} /></dd></dl><div className="mt-6 flex justify-end"><ActionButton variant="secondary" onClick={() => setViewing(null)}>Cerrar</ActionButton></div></section></div>}
    {history && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setHistory(null); }}><section role="dialog" aria-modal="true" aria-labelledby="history-title" className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-modal"><h2 id="history-title" className="text-xl font-bold">Historial de ventas · {history.customer.displayName}</h2>{history.sales.length ? <><ul className="mt-4 divide-y divide-border-default">{history.sales.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize).map(sale => <li key={sale.id} className="flex justify-between py-3 text-sm"><span><strong>{sale.saleNumber}</strong><span className="ml-2 text-text-secondary">{new Date(sale.saleDate).toLocaleDateString("es-PE")} · {sale.state}</span></span><span className="font-bold">S/ {sale.total.toFixed(2)}</span></li>)}</ul><Pagination page={historyPage} pageSize={historyPageSize} total={history.sales.length} onPageChange={setHistoryPage} onPageSizeChange={size => { setHistoryPageSize(size); setHistoryPage(1); }} /></> : <p className="mt-4 rounded-lg bg-surface-page p-4 text-sm text-text-secondary">Este cliente todavía no tiene ventas registradas.</p>}<div className="mt-5 flex justify-end"><ActionButton variant="secondary" onClick={() => setHistory(null)}>Cerrar</ActionButton></div></section></div>}
    <ConfirmDialog open={!!confirm} title="Eliminar cliente" message={`¿Eliminar a ${confirm?.displayName}? Si tiene ventas relacionadas, se desactivará y su historial se conservará.`} onCancel={() => setConfirm(null)} onConfirm={() => void remove()} />
  </div>;
}
