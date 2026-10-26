import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from "react";
import type { Branch, Seller, User } from "@/domain/models";
import { hasPermission } from "@/domain/permissions";
import { validateBranch, validateSeller, type BranchInput, type SellerInput, type ValidationErrors } from "@/domain/validation";
import { authService } from "@/services/authService";
import { organizationService } from "@/services/organizationService";
import { localRepository } from "@/persistence/database";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { StatusBadge } from "@/components/ui/StatusBadge";

type Tab = "branches" | "sellers";
type BranchDraft = BranchInput & { id?: string };
type SellerDraft = SellerInput & { id?: string };
type RecordItem = Branch | Seller;
const newBranch: BranchDraft = { code: "", name: "", address: "", phone: "" };
const newSeller: SellerDraft = { documentType: "DNI", documentNumber: "", name: "", branchId: "", email: "", phone: "" };
export function OrganizationPage() {
  const [actor, setActor] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("branches");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [allSellers, setAllSellers] = useState<Seller[]>([]);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<BranchDraft | SellerDraft>(newBranch);
  const [editing, setEditing] = useState<RecordItem | null>(null);
  const [viewing, setViewing] = useState<RecordItem | null>(null);
  const [confirm, setConfirm] = useState<RecordItem | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = hasPermission(actor?.role, "organization:write");
  const branchNames = useMemo(() => new Map(allBranches.map(branch => [branch.id, branch.name])), [allBranches]);
  const reload = useCallback(async () => {
    const current = await authService.currentUser();
    if (!current) { window.location.replace("/login/"); return; }
    setActor(current);
    const [branchRows, sellerRows, users] = await Promise.all([
      organizationService.listBranches(current.role),
      organizationService.listSellers(current.role),
      localRepository.list("users"),
    ]);
    setAllBranches(branchRows); setAllSellers(sellerRows);
    const term = query.trim().toLocaleLowerCase("es");
    setBranches(branchRows.filter(branch => (status === "all" || branch.status === status) && (!term || `${branch.code} ${branch.name} ${branch.address ?? ""} ${branch.phone ?? ""}`.toLocaleLowerCase("es").includes(term))));
    setSellers(sellerRows.filter(seller => (status === "all" || seller.status === status) && (!term || `${seller.name} ${seller.documentType} ${seller.documentNumber} ${seller.email ?? ""} ${seller.phone ?? ""} ${branchRows.find(branch => branch.id === seller.branchId)?.code ?? ""} ${branchRows.find(branch => branch.id === seller.branchId)?.name ?? ""}`.toLocaleLowerCase("es").includes(term))));
    setAccountNames(new Map(users.map(user => [user.id, user.username])));
  }, [query, status]);
  useEffect(() => { void reload().catch(error => setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudieron cargar los datos organizacionales." })); }, [reload]);

  const branchColumns = useMemo<DataColumn<Branch>[]>(() => [
    { key: "code", header: "Código", value: branch => <span className="font-bold">{branch.code}</span>, searchable: branch => branch.code },
    { key: "name", header: "Sucursal", value: branch => <div><p className="font-semibold">{branch.name}</p><p className="text-xs text-text-secondary">{branch.address || "Sin dirección registrada"}</p></div>, searchable: branch => `${branch.name} ${branch.address ?? ""}` },
    { key: "phone", header: "Teléfono", value: branch => branch.phone || "—", searchable: branch => branch.phone ?? "" },
    { key: "sellers", header: "Vendedores", value: branch => allSellers.filter(seller => seller.branchId === branch.id).length },
    { key: "status", header: "Estado", value: branch => <StatusBadge status={branch.status} /> },
    { key: "actions", header: "Acciones", value: branch => <div className="flex gap-2"><button type="button" onClick={() => setViewing(branch)} className="text-xs font-bold text-primary-active hover:underline">Ver</button>{canWrite && branch.status === "active" && <><button type="button" onClick={() => openBranch(branch)} className="text-xs font-bold text-text-secondary hover:underline">Editar</button><button type="button" onClick={() => setConfirm(branch)} className="text-xs font-bold text-danger hover:underline">Eliminar</button></>}</div> },
  ], [allSellers, canWrite]);
  const sellerColumns = useMemo<DataColumn<Seller>[]>(() => [
    { key: "name", header: "Vendedor", value: seller => <div><p className="font-semibold">{seller.name}</p><p className="text-xs text-text-secondary">{seller.email || "Sin correo registrado"}</p></div>, searchable: seller => `${seller.name} ${seller.email ?? ""}` },
    { key: "document", header: "Identificación", value: seller => <>{seller.documentType} {seller.documentNumber}</>, searchable: seller => `${seller.documentType} ${seller.documentNumber}` },
    { key: "branch", header: "Sucursal", value: seller => branchNames.get(seller.branchId) ?? "Sucursal no disponible", searchable: seller => branchNames.get(seller.branchId) ?? "" },
    { key: "account", header: "Cuenta de acceso", value: seller => seller.userId ? accountNames.get(seller.userId) ?? "Cuenta vinculada" : "No vinculada" },
    { key: "status", header: "Estado", value: seller => <StatusBadge status={seller.status} /> },
    { key: "actions", header: "Acciones", value: seller => <div className="flex gap-2"><button type="button" onClick={() => setViewing(seller)} className="text-xs font-bold text-primary-active hover:underline">Ver</button>{canWrite && seller.status === "active" && <><button type="button" onClick={() => openSeller(seller)} className="text-xs font-bold text-text-secondary hover:underline">Editar</button><button type="button" onClick={() => setConfirm(seller)} className="text-xs font-bold text-danger hover:underline">Eliminar</button></>}</div> },
  ], [branchNames, accountNames, canWrite]);

  function openBranch(branch?: Branch) { setEditing(branch ?? null); setDraft(branch ? { id: branch.id, code: branch.code, name: branch.name, address: branch.address ?? "", phone: branch.phone ?? "" } : { ...newBranch }); setErrors({}); setFormOpen(true); }
  function openSeller(seller?: Seller) { setEditing(seller ?? null); setDraft(seller ? { id: seller.id, documentType: seller.documentType, documentNumber: seller.documentNumber, name: seller.name, branchId: seller.branchId, email: seller.email ?? "", phone: seller.phone ?? "", userId: seller.userId } : { ...newSeller, branchId: allBranches.find(branch => branch.status === "active")?.id ?? "" }); setErrors({}); setFormOpen(true); }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (!actor) return;
    const validation = tab === "branches" ? validateBranch(draft as BranchInput) : validateSeller(draft as SellerInput);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      if (tab === "branches") await organizationService.saveBranch(actor.role, draft as BranchDraft);
      else await organizationService.saveSeller(actor.role, draft as SellerDraft);
      setFormOpen(false); setMessage({ ok: true, text: editing ? "Los cambios se guardaron correctamente." : tab === "branches" ? "Sucursal creada correctamente." : "Vendedor creado y asignado a su sucursal." }); await reload();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo guardar el registro." }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm || !actor) return;
    try {
      const result = "branchId" in confirm ? await organizationService.deleteSeller(actor.role, confirm.id) : await organizationService.deleteBranch(actor.role, confirm.id);
      setConfirm(null); setMessage({ ok: true, text: result === "deactivated" ? "El registro tiene relaciones históricas y fue desactivado; sus ventas se conservan." : "Registro eliminado; no tenía dependencias." }); await reload();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo eliminar el registro." }); }
  }
  const isBranch = tab === "branches";
  const formBranch = isBranch;
  const selectedBranch = viewing && "branchId" in viewing ? allBranches.find(branch => branch.id === viewing.branchId) : undefined;
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-wider text-primary-active">Administración organizacional</p><h1 className="mt-1 text-3xl font-extrabold">Vendedores y sucursales</h1><p className="mt-2 text-sm text-text-secondary">Administra la estructura comercial y sus asignaciones vigentes.</p></div>{canWrite && <ActionButton onClick={() => isBranch ? openBranch() : openSeller()}>＋ Crear {isBranch ? "sucursal" : "vendedor"}</ActionButton>}</div>
    <div className="flex gap-2 border-b border-border-default">{(["branches", "sellers"] as const).map(value => <button type="button" key={value} onClick={() => { setTab(value); setQuery(""); setFormOpen(false); setMessage(null); }} className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === value ? "border-primary text-primary-active" : "border-transparent text-text-secondary hover:text-text-primary"}`}>{value === "branches" ? "Sucursales" : "Vendedores"}</button>)}</div>
    <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-white p-4 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5 text-xs font-bold text-text-secondary">Buscar por {isBranch ? "código, nombre o dirección" : "identificación, nombre o sucursal"}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={isBranch ? "Buscar sucursales…" : "Buscar vendedores…"} className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal text-text-primary" /></label><label className="grid gap-1.5 text-xs font-bold text-text-secondary">Estado<select value={status} onChange={event => setStatus(event.target.value as typeof status)} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal text-text-primary"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label></div>
    {message && <div role="status" className={`flex justify-between rounded-lg p-3 text-sm ${message.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>{message.text}<button type="button" aria-label="Cerrar mensaje" onClick={() => setMessage(null)}>×</button></div>}
    {isBranch ? <DataTable rows={branches} columns={branchColumns} rowKey={item => item.id} emptyMessage="No hay sucursales que coincidan con los filtros." /> : <DataTable rows={sellers} columns={sellerColumns} rowKey={item => item.id} emptyMessage="No hay vendedores que coincidan con los filtros." />}

    {formOpen && <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFormOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="org-form-title" className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-modal sm:p-7"><div className="flex justify-between"><div><h2 id="org-form-title" className="text-xl font-extrabold">{editing ? "Modificar" : "Crear"} {formBranch ? "sucursal" : "vendedor"}</h2><p className="mt-1 text-sm text-text-secondary">Completa los campos obligatorios para continuar.</p></div><button type="button" aria-label="Cerrar formulario" onClick={() => setFormOpen(false)}>×</button></div>
      <form onSubmit={submit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">{formBranch ? <><FormField label="Código" name="code" required value={(draft as BranchDraft).code} onChange={event => setDraft({ ...draft, code: event.target.value } as BranchDraft)} error={errors.code} /><FormField label="Nombre de sucursal" name="name" required value={(draft as BranchDraft).name} onChange={event => setDraft({ ...draft, name: event.target.value } as BranchDraft)} error={errors.name} /><FormField label="Dirección" name="address" value={(draft as BranchDraft).address} onChange={event => setDraft({ ...draft, address: event.target.value } as BranchDraft)} /><FormField label="Teléfono" name="phone" type="tel" value={(draft as BranchDraft).phone} onChange={event => setDraft({ ...draft, phone: event.target.value } as BranchDraft)} /></> : <><FormField label="Tipo de identificación" name="documentType" required><select id="documentType" value={(draft as SellerDraft).documentType} onChange={event => setDraft({ ...draft, documentType: event.target.value as SellerDraft["documentType"] } as SellerDraft)} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option></select></FormField><FormField label="Número de documento" name="documentNumber" required value={(draft as SellerDraft).documentNumber} onChange={event => setDraft({ ...draft, documentNumber: event.target.value } as SellerDraft)} error={errors.documentNumber} /><FormField label="Nombre completo" name="name" required value={(draft as SellerDraft).name} onChange={event => setDraft({ ...draft, name: event.target.value } as SellerDraft)} error={errors.name} /><FormField label="Sucursal asignada" name="branchId" required error={errors.branchId}><select id="branchId" required value={(draft as SellerDraft).branchId} onChange={event => setDraft({ ...draft, branchId: event.target.value } as SellerDraft)} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"><option value="">Seleccionar sucursal</option>{allBranches.filter(branch => branch.status === "active").map(branch => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></FormField><FormField label="Correo electrónico" name="email" type="email" value={(draft as SellerDraft).email} onChange={event => setDraft({ ...draft, email: event.target.value } as SellerDraft)} error={errors.email} /><FormField label="Teléfono" name="phone" type="tel" value={(draft as SellerDraft).phone} onChange={event => setDraft({ ...draft, phone: event.target.value } as SellerDraft)} /></>}
        <div className="flex justify-end gap-3 pt-2 sm:col-span-2"><ActionButton type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancelar</ActionButton><ActionButton type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</ActionButton></div>
      </form></section></div>}

    {viewing && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setViewing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="org-detail-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-modal"><h2 id="org-detail-title" className="text-xl font-extrabold">Detalle de {"branchId" in viewing ? "vendedor" : "sucursal"}</h2>{"branchId" in viewing ? <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-3 text-sm"><dt className="text-text-secondary">Nombre</dt><dd className="font-semibold">{viewing.name}</dd><dt className="text-text-secondary">Identificación</dt><dd>{viewing.documentType} {viewing.documentNumber}</dd><dt className="text-text-secondary">Sucursal</dt><dd>{selectedBranch?.name ?? "No disponible"}</dd><dt className="text-text-secondary">Correo</dt><dd>{viewing.email || "No registrado"}</dd><dt className="text-text-secondary">Teléfono</dt><dd>{viewing.phone || "No registrado"}</dd><dt className="text-text-secondary">Cuenta</dt><dd>{viewing.userId ? accountNames.get(viewing.userId) ?? "Vinculada" : "No vinculada"}</dd><dt className="text-text-secondary">Estado</dt><dd><StatusBadge status={viewing.status} /></dd></dl> : <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-3 text-sm"><dt className="text-text-secondary">Código</dt><dd>{viewing.code}</dd><dt className="text-text-secondary">Sucursal</dt><dd className="font-semibold">{viewing.name}</dd><dt className="text-text-secondary">Dirección</dt><dd>{viewing.address || "No registrada"}</dd><dt className="text-text-secondary">Teléfono</dt><dd>{viewing.phone || "No registrado"}</dd><dt className="text-text-secondary">Vendedores relacionados</dt><dd>{allSellers.filter(seller => seller.branchId === viewing.id).length}</dd><dt className="text-text-secondary">Estado</dt><dd><StatusBadge status={viewing.status} /></dd></dl>}<div className="mt-6 flex justify-end"><ActionButton variant="secondary" onClick={() => setViewing(null)}>Cerrar</ActionButton></div></section></div>}
    <ConfirmDialog open={!!confirm} title={`Eliminar ${confirm && "branchId" in confirm ? "vendedor" : "sucursal"}`} message={confirm && "branchId" in confirm ? `¿Eliminar a ${confirm.name}? Si está asociado a ventas o a una cuenta de acceso, se desactivará para conservar el historial.` : `¿Eliminar ${confirm?.name}? Si mantiene vendedores o ventas relacionadas, se desactivará para conservar sus relaciones e historial.`} onCancel={() => setConfirm(null)} onConfirm={() => void remove()} />
  </div>;
}
