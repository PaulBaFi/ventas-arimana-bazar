import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from "react";
import type { User, UserRole } from "@/domain/models";
import { validateUser, type ValidationErrors } from "@/domain/validation";
import { authService } from "@/services/authService";
import { userService } from "@/services/userService";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { StatusBadge } from "@/components/ui/StatusBadge";

const ROLES: UserRole[] = ["Administrador", "Vendedor", "Cajero", "Gerencia", "Analista"];
type Draft = { username: string; displayName: string; role: UserRole; email: string; employeeId: string };
const emptyDraft: Draft = { username: "", displayName: "", role: "Vendedor", email: "", employeeId: "" };

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<User | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<ValidationErrors>( {});
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const actor = await authService.currentUser();
    if (!actor) { window.location.replace("/login/"); return; }
    setCurrentUser(actor);
    setUsers(await userService.search(actor.role, search, statusFilter));
  }, [search, statusFilter]);
  useEffect(() => { void reload().catch(error => setMessage({ kind: "error", text: error instanceof Error ? error.message : "No se pudieron cargar usuarios." })); }, [reload]);

  const columns = useMemo<DataColumn<User>[]>(() => [
    { key: "name", header: "Usuario", value: user => <div><p className="font-bold">{user.displayName}</p><p className="text-xs text-text-secondary">@{user.username}</p></div>, searchable: user => `${user.displayName} ${user.username}` },
    { key: "email", header: "Correo", value: user => user.email || <span className="text-text-muted">Sin correo</span>, searchable: user => user.email ?? "" },
    { key: "role", header: "Rol", value: user => <span className="rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-bold text-primary-active">{user.role}</span>, searchable: user => user.role },
    { key: "status", header: "Estado", value: user => <StatusBadge status={user.status} />, searchable: user => user.status },
    { key: "actions", header: "Acciones", value: user => <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setViewing(user)} className="text-xs font-bold text-primary-active hover:underline">Ver</button>
      <button type="button" disabled={user.status === "inactive"} onClick={() => openEdit(user)} className="text-xs font-bold text-text-secondary hover:underline disabled:opacity-40">Editar</button>
      {user.status === "active" && <button type="button" disabled={user.id === currentUser?.id} onClick={() => setConfirm(user)} className="text-xs font-bold text-danger hover:underline disabled:opacity-40" title={user.id === currentUser?.id ? "No puedes desactivar tu propia sesión" : undefined}>Desactivar</button>}
    </div> },
  ], [currentUser]);

  function openCreate() { setEditing(null); setDraft(emptyDraft); setErrors({}); setFormOpen(true); setMessage(null); }
  function openEdit(user: User) { setEditing(user); setDraft({ username: user.username, displayName: user.displayName, role: user.role, email: user.email ?? "", employeeId: user.employeeId ?? "" }); setErrors({}); setFormOpen(true); setMessage(null); }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { ...draft, email: draft.email || undefined };
    const validation = validateUser(input); setErrors(validation);
    if (Object.keys(validation).length || !currentUser) return;
    setBusy(true);
    try {
      await userService.save(currentUser.role, { ...input, id: editing?.id });
      setFormOpen(false); setMessage({ kind: "success", text: editing ? "Los cambios del usuario se guardaron." : "El usuario fue creado correctamente." });
      await reload();
    } catch (reason) { setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "No se pudo guardar el usuario." }); }
    finally { setBusy(false); }
  }
  async function deactivate() {
    if (!confirm || !currentUser) return;
    try { await userService.deactivate(currentUser.role, confirm.id, currentUser.id); setConfirm(null); setMessage({ kind: "success", text: `La cuenta ${confirm.username} fue desactivada. Su historial se conserva.` }); await reload(); }
    catch (reason) { setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "No se pudo desactivar la cuenta." }); }
  }

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-primary-active">Administración</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Acceso y usuarios</h1><p className="mt-2 text-sm text-text-secondary">Gestiona cuentas y roles. Las desactivaciones preservan la trazabilidad.</p></div><ActionButton onClick={openCreate}><span aria-hidden="true" className="mr-2">＋</span>Crear usuario</ActionButton></div>
    <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-white p-4 sm:flex-row sm:items-end">
      <label className="grid flex-1 gap-1.5 text-xs font-bold text-text-secondary">Buscar usuario, nombre o correo<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ej. vendedor.demo" className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal text-text-primary outline-none focus:border-border-primary" /></label>
      <label className="grid gap-1.5 text-xs font-bold text-text-secondary">Estado<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal text-text-primary"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
    </div>
    {message && <div role="status" className={`flex items-start justify-between gap-4 rounded-lg p-3 text-sm ${message.kind === "success" ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}><p>{message.text}</p><button type="button" aria-label="Cerrar mensaje" onClick={() => setMessage(null)} className="font-bold">×</button></div>}
    <DataTable rows={users} columns={columns} rowKey={user => user.id} searchPlaceholder="Filtrar los resultados…" emptyMessage="No hay usuarios que coincidan con los filtros." />

    {formOpen && <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFormOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="user-form-title" className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-modal sm:p-7">
        <div className="flex items-start justify-between"><div><h2 id="user-form-title" className="text-xl font-extrabold">{editing ? "Modificar usuario" : "Crear usuario"}</h2><p className="mt-1 text-sm text-text-secondary">Los datos se guardan localmente en este navegador.</p></div><button type="button" aria-label="Cerrar formulario" onClick={() => setFormOpen(false)} className="rounded-lg px-2 text-xl text-text-secondary hover:bg-surface-hover">×</button></div>
        <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2" noValidate>
          <FormField label="Nombre de usuario" name="username" required value={draft.username} onChange={event => setDraft({ ...draft, username: event.target.value })} error={errors.username} />
          <FormField label="Nombre completo" name="displayName" required value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} error={errors.displayName} />
          <FormField label="Correo electrónico" name="email" type="email" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} error={errors.email} />
          <FormField label="Identificador de empleado" name="employeeId" value={draft.employeeId} onChange={event => setDraft({ ...draft, employeeId: event.target.value })} hint="Opcional; no se asigna automáticamente a vendedores." />
          <FormField label="Rol y permisos" name="role" required error={errors.role}>
            <select id="role" name="role" required value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value as UserRole })} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm outline-none focus:border-border-primary">{ROLES.map(role => <option key={role}>{role}</option>)}</select>
          </FormField>
          <p className="self-end pb-2 text-xs text-text-secondary sm:col-span-2">La contraseña no forma parte del registro simulado. El acceso se realiza con cuentas y credenciales exclusivamente de demostración.</p>
          <div className="flex justify-end gap-3 pt-2 sm:col-span-2"><ActionButton type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancelar</ActionButton><ActionButton type="submit" disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear usuario"}</ActionButton></div>
        </form>
      </section>
    </div>}

    {viewing && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setViewing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="user-detail-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-modal">
      <div className="flex items-start justify-between"><h2 id="user-detail-title" className="text-xl font-extrabold">Ficha de usuario</h2><button type="button" onClick={() => setViewing(null)} aria-label="Cerrar detalle" className="text-xl text-text-secondary">×</button></div>
      <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm"><dt className="text-text-secondary">Nombre</dt><dd className="font-semibold">{viewing.displayName}</dd><dt className="text-text-secondary">Usuario</dt><dd>@{viewing.username}</dd><dt className="text-text-secondary">Correo</dt><dd>{viewing.email || "No registrado"}</dd><dt className="text-text-secondary">Rol</dt><dd>{viewing.role}</dd><dt className="text-text-secondary">Empleado</dt><dd>{viewing.employeeId || "No asignado"}</dd><dt className="text-text-secondary">Estado</dt><dd><StatusBadge status={viewing.status} /></dd><dt className="text-text-secondary">Creado</dt><dd>{new Date(viewing.createdAt).toLocaleString("es-PE")}</dd><dt className="text-text-secondary">Actualizado</dt><dd>{new Date(viewing.updatedAt).toLocaleString("es-PE")}</dd></dl>
      <div className="mt-6 flex justify-end"><ActionButton variant="secondary" onClick={() => setViewing(null)}>Cerrar</ActionButton></div>
    </section></div>}
    <ConfirmDialog open={!!confirm} title="Desactivar usuario" message={`¿Desactivar la cuenta ${confirm?.username}? No podrá iniciar sesión; sus registros e historial se conservarán.`} onCancel={() => setConfirm(null)} onConfirm={() => void deactivate()} />
  </div>;
}
