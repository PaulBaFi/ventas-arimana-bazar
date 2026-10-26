import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from "react";
import type { Category, Product, User } from "@/domain/models";
import { hasPermission } from "@/domain/permissions";
import { authService } from "@/services/authService";
import { catalogService, type CategoryInput, type ProductInput } from "@/services/catalogService";
import { ActionButton } from "@/components/ui/ActionButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Eye, Filter, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";

type Tab = "products" | "categories";
type Draft = CategoryInput | ProductInput;
const emptyCategory: CategoryInput = { code: "", name: "", description: "" };
const emptyProduct: ProductInput = { code: "", name: "", categoryId: "", description: "", unitPrice: 0 };
export function CatalogPage({ initialTab = "products" }: { initialTab?: Tab }) {
  const [actor, setActor] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | Category | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyProduct);
  const [confirm, setConfirm] = useState<Product | Category | null>(null);
  const [viewing, setViewing] = useState<Product | Category | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = hasPermission(actor?.role, "catalog:write");
  const reload = useCallback(async () => {
    const current = await authService.currentUser();
    if (!current) { window.location.replace("/login/"); return; }
    setActor(current);
    const [nextProducts, nextCategories] = await Promise.all([catalogService.listProducts(current.role), catalogService.listCategories(current.role)]);
    setAllProducts(nextProducts); setCategories(nextCategories);
    const term = query.trim().toLocaleLowerCase("es");
    const categoryNames = new Map(nextCategories.map(category => [category.id, category.name]));
    setProducts(nextProducts.filter(item => (status === "all" || item.status === status) && (!term || `${item.code} ${item.name} ${item.description ?? ""} ${categoryNames.get(item.categoryId) ?? ""}`.toLocaleLowerCase("es").includes(term))));
  }, [query, status]);
  useEffect(() => { void reload().catch(error => setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo cargar el catálogo." })); }, [reload]);
  const categoryMap = useMemo(() => new Map(categories.map(item => [item.id, item.name])), [categories]);
  const productColumns = useMemo<DataColumn<Product>[]>(() => [
    { key: "code", header: "Código", value: item => <span className="font-bold">{item.code}</span>, searchable: item => item.code },
    { key: "name", header: "Producto", value: item => <div><p className="font-semibold">{item.name}</p><p className="text-xs text-text-secondary">{item.description || "Sin descripción"}</p></div>, searchable: item => `${item.name} ${item.description ?? ""}` },
    { key: "category", header: "Categoría", value: item => categoryMap.get(item.categoryId) ?? "Categoría no disponible", searchable: item => categoryMap.get(item.categoryId) ?? "" },
    { key: "price", header: "Precio", value: item => `S/ ${item.unitPrice.toFixed(2)}` },
    { key: "status", header: "Estado", value: item => <StatusBadge status={item.status} /> },
     { key: "actions", header: "Acciones", value: item => <div className="flex gap-2"><button type="button" aria-label="Ver producto" onClick={() => setViewing(item)} className="text-primary-active hover:underline"><Eye size={15} /></button>{canWrite && item.status === "active" && <><button type="button" aria-label="Editar producto" onClick={() => openProduct(item)} className="text-text-secondary hover:underline"><Pencil size={15} /></button><button type="button" aria-label="Eliminar producto" onClick={() => setConfirm(item)} className="text-danger hover:underline"><Trash2 size={15} /></button></>}</div> },
  ], [categoryMap, canWrite]);
  const categoryColumns = useMemo<DataColumn<Category>[]>(() => [
    { key: "code", header: "Código", value: item => <span className="font-bold">{item.code}</span>, searchable: item => item.code },
    { key: "name", header: "Categoría", value: item => <div><p className="font-semibold">{item.name}</p><p className="text-xs text-text-secondary">{item.description || "Sin descripción"}</p></div>, searchable: item => `${item.name} ${item.description ?? ""}` },
    { key: "count", header: "Productos", value: item => allProducts.filter(product => product.categoryId === item.id).length },
    { key: "status", header: "Estado", value: item => <StatusBadge status={item.status} /> },
     { key: "actions", header: "Acciones", value: item => <div className="flex gap-2"><button type="button" aria-label="Ver categoría" onClick={() => setViewing(item)} className="text-primary-active hover:underline"><Eye size={15} /></button>{canWrite && item.status === "active" && <><button type="button" aria-label="Editar categoría" onClick={() => openCategory(item)} className="text-text-secondary hover:underline"><Pencil size={15} /></button><button type="button" aria-label="Eliminar categoría" onClick={() => setConfirm(item)} className="text-danger hover:underline"><Trash2 size={15} /></button></>}</div> },
  ], [allProducts, canWrite]);
  function openCategory(category?: Category) { setEditing(category ?? null); setDraft(category ? { id: category.id, code: category.code, name: category.name, description: category.description ?? "" } : { ...emptyCategory }); setFormOpen(true); }
  function openProduct(product?: Product) { setEditing(product ?? null); setDraft(product ? { id: product.id, code: product.code, name: product.name, categoryId: product.categoryId, description: product.description ?? "", unitPrice: product.unitPrice } : { ...emptyProduct, categoryId: categories.find(item => item.status === "active")?.id ?? "" }); setFormOpen(true); }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (!actor) return; setBusy(true);
    try {
      if (tab === "categories") await catalogService.saveCategory(actor.role, draft as CategoryInput);
      else await catalogService.saveProduct(actor.role, { ...draft, unitPrice: Number((draft as ProductInput).unitPrice) } as ProductInput);
      setFormOpen(false); setMessage({ ok: true, text: editing ? "Cambios guardados." : tab === "products" ? "Producto creado." : "Categoría creada." }); await reload();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo guardar." }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm || !actor) return;
    try {
      const result = "categoryId" in confirm ? await catalogService.deleteProduct(actor.role, confirm.id) : await catalogService.deleteCategory(actor.role, confirm.id);
      setConfirm(null); setMessage({ ok: true, text: result === "deactivated" ? "El registro tiene dependencias y fue desactivado para conservar el historial." : "Registro eliminado; no tenía dependencias." }); await reload();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "No se pudo eliminar." }); }
  }
  function changeTab(next: Tab) { setTab(next); setQuery(""); setFormOpen(false); setMessage(null); }
  const isProduct = tab === "products";
  const visibleCategories = categories.filter(item =>
    (status === "all" || item.status === status) &&
    (!query.trim() || `${item.code} ${item.name} ${item.description ?? ""}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"))),
  );
  return <div className="space-y-6">
     <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-wider text-primary-active">Módulo comercial</p><h1 className="mt-1 text-3xl font-extrabold">Productos y categorías</h1><p className="mt-2 text-sm text-text-secondary">Catálogo comercial sin inventario ni control de existencias.</p></div>{canWrite && <ActionButton icon={Plus} onClick={() => isProduct ? openProduct() : openCategory()}>Crear {isProduct ? "producto" : "categoría"}</ActionButton>}</div>
    <div className="flex gap-2 border-b border-border-default">{(["products", "categories"] as const).map(value => <button type="button" key={value} onClick={() => changeTab(value)} className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === value ? "border-primary text-primary-active" : "border-transparent text-text-secondary hover:text-text-primary"}`}>{value === "products" ? "Productos" : "Categorías"}</button>)}</div>
     <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-white p-4 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5 text-xs font-bold text-text-secondary"><span className="flex items-center gap-1"><Search size={14} />Buscar por código, nombre o categoría</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en el catálogo…" className="min-h-10 rounded-lg border border-border-default px-3 text-sm font-normal text-text-primary" /></label><label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span className="flex items-center gap-1"><Filter size={14} />Estado</span><select value={status} onChange={e => setStatus(e.target.value as typeof status)} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm font-normal text-text-primary"><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label></div>
    {message && <div role="status" className={`flex justify-between rounded-lg p-3 text-sm ${message.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>{message.text}<button type="button" aria-label="Cerrar mensaje" onClick={() => setMessage(null)}>×</button></div>}
    {isProduct ? <DataTable rows={products} columns={productColumns} rowKey={item => item.id} emptyMessage="No hay productos que coincidan con los filtros." /> : <DataTable rows={visibleCategories} columns={categoryColumns} rowKey={item => item.id} emptyMessage="No hay categorías que coincidan con los filtros." />}
    {formOpen && <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/45 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setFormOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="catalog-form-title" className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-modal"><div className="flex justify-between"><div><h2 id="catalog-form-title" className="text-xl font-bold">{editing ? "Modificar" : "Crear"} {isProduct ? "producto" : "categoría"}</h2><p className="mt-1 text-sm text-text-secondary">Los códigos deben ser únicos.</p></div><button type="button" aria-label="Cerrar formulario" onClick={() => setFormOpen(false)}>×</button></div>
       <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><FormField label="Código" name="code" required value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} /><FormField label="Nombre" name="name" required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        {isProduct ? <><FormField label="Categoría" name="categoryId" required><select id="categoryId" required value={(draft as ProductInput).categoryId} onChange={e => setDraft({ ...draft, categoryId: e.target.value } as ProductInput)} className="min-h-10 rounded-lg border border-border-default bg-white px-3 text-sm"><option value="">Seleccionar categoría</option>{categories.filter(category => category.status === "active").map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></FormField><FormField label="Precio unitario (S/)" name="unitPrice" type="number" min="0" step="0.01" required value={(draft as ProductInput).unitPrice} onChange={e => setDraft({ ...draft, unitPrice: e.target.value === "" ? Number.NaN : Number(e.target.value) } as ProductInput)} /><FormField label="Descripción" name="description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></> : <FormField label="Descripción" name="description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />}
         <p className="text-xs text-text-secondary sm:col-span-2">No se gestionan existencias ni movimientos de stock.</p><div className="flex justify-end gap-3 sm:col-span-2"><ActionButton type="button" variant="secondary" icon={X} onClick={() => setFormOpen(false)}>Cancelar</ActionButton><ActionButton type="submit" icon={Save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</ActionButton></div>
      </form></section></div>}
    {viewing && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setViewing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="catalog-detail" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-modal"><h2 id="catalog-detail" className="text-xl font-bold">Detalle de {"categoryId" in viewing ? "producto" : "categoría"}</h2><dl className="mt-5 grid grid-cols-[8rem_1fr] gap-3 text-sm"><dt className="text-text-secondary">Código</dt><dd>{viewing.code}</dd><dt className="text-text-secondary">Nombre</dt><dd className="font-semibold">{viewing.name}</dd>{"categoryId" in viewing ? <><dt className="text-text-secondary">Categoría</dt><dd>{categoryMap.get(viewing.categoryId) ?? "No disponible"}</dd><dt className="text-text-secondary">Precio</dt><dd>S/ {viewing.unitPrice.toFixed(2)}</dd></> : <><dt className="text-text-secondary">Productos</dt><dd>{products.filter(product => product.categoryId === viewing.id).length}</dd></>}<dt className="text-text-secondary">Descripción</dt><dd>{viewing.description || "Sin descripción"}</dd><dt className="text-text-secondary">Estado</dt><dd><StatusBadge status={viewing.status} /></dd></dl><div className="mt-6 flex justify-end"><ActionButton variant="secondary" onClick={() => setViewing(null)}>Cerrar</ActionButton></div></section></div>}
    <ConfirmDialog open={!!confirm} title={`Eliminar ${confirm && "categoryId" in confirm ? "producto" : "categoría"}`} message={`¿Eliminar ${confirm?.name}? Si existen ventas o productos relacionados, se desactivará para conservar las relaciones históricas.`} onCancel={() => setConfirm(null)} onConfirm={() => void remove()} />
  </div>;
}
