import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@/domain/models";
import { hasPermission, type Permission } from "@/domain/permissions";
import { authService } from "@/services/authService";
import { localRepository } from "@/persistence/database";
import {
  BarChart3,
  Building2,
  ChevronDown,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShoppingCart,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function SidebarLink({
  href,
  label,
  external = false,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="flex items-center rounded-lg px-4 py-2.5 pl-11 text-sm font-semibold text-slate-400 hover:bg-white/10 hover:text-white"
    >
      {label}
    </a>
  );
}

function SidebarGroup({
  label,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
      >
        <span className="flex items-center gap-3">
          <Icon size={17} aria-hidden="true" />
          {label}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

export function AdminShell({
  children,
  requiredPermission,
  title,
}: {
  children: ReactNode;
  requiredPermission?: Permission;
  title: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    sales: false,
    catalog: false,
    organization: false,
    reports: false,
  });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await localRepository.seedDemoData();
        const current = await authService.currentUser();
        if (!active) return;
        if (!current) {
          window.location.replace("/login/");
          return;
        }
        setUser(current);
        if (
          requiredPermission &&
          !hasPermission(current.role, requiredPermission)
        )
          setReady(true);
        else setReady(true);
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "No se pudo abrir el almacenamiento local.",
          );
          setReady(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [requiredPermission]);
  async function logout() {
    authService.signOut();
    window.location.assign("/login/");
  }
  if (!ready)
    return (
      <div
        className="grid min-h-screen place-items-center text-sm text-text-secondary"
        aria-live="polite"
      >
        Cargando espacio de trabajo…
      </div>
    );
  if (loadError)
    return (
      <div className="grid min-h-screen place-items-center p-5">
        <section className="max-w-md rounded-xl border border-danger/20 bg-white p-6 shadow-card">
          <h1 className="font-bold">No se pudo iniciar</h1>
          <p className="mt-2 text-sm text-text-secondary">{loadError}</p>
          <a
            href="/login/"
            className="mt-4 inline-block font-bold text-primary-active"
          >
            Volver al acceso
          </a>
        </section>
      </div>
    );
  if (!user)
    return (
      <div
        className="grid min-h-screen place-items-center text-sm text-text-secondary"
        aria-live="polite"
      >
        Redirigiendo al acceso…
      </div>
    );
  const allowed =
    !requiredPermission || hasPermission(user.role, requiredPermission);
  return (
    <div className="h-screen overflow-hidden bg-surface-page md:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col bg-surface-sidebar text-text-inverse transition-transform md:static md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid size-9 place-items-center rounded-lg overflow-hidden bg-primary">
            <img src="/LOGO_FILL.png" alt="Logo de Arimana Bazar" />
          </div>
          <div>
            <p className="text-sm font-bold">Arimana Bazar</p>
            <p className="text-xs text-slate-400">
              Sistema de Gestión de Ventas
            </p>
          </div>
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto p-4 custom-scrollbar on-dark"
          aria-label="Navegación principal"
        >
          <a
            href="/"
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <Home size={17} aria-hidden="true" />
            Inicio
          </a>
          {hasPermission(user.role, "users:manage") && (
            <a
              href="/usuarios/"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Users size={17} aria-hidden="true" />
              Acceso y usuarios
            </a>
          )}
          {hasPermission(user.role, "customers:read") && (
            <a
              href="/clientes/"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Users size={17} aria-hidden="true" />
              Clientes
            </a>
          )}

          {hasPermission(user.role, "sales:read") && (
            <SidebarGroup
              label="Ventas y comprobantes"
              icon={ShoppingCart}
              open={openGroups.sales}
              onToggle={() =>
                setOpenGroups((current) => ({
                  ...current,
                  sales: !current.sales,
                }))
              }
            >
              <SidebarLink href="/ventas/" label="Ventas" />
              <SidebarLink href="/comprobantes/" label="Comprobantes" />
              <SidebarLink href="/medios-pago/" label="Medios de pago" />
            </SidebarGroup>
          )}
          {hasPermission(user.role, "catalog:read") && (
            <SidebarGroup
              label="Productos y categorías"
              icon={Package}
              open={openGroups.catalog}
              onToggle={() =>
                setOpenGroups((current) => ({
                  ...current,
                  catalog: !current.catalog,
                }))
              }
            >
              <SidebarLink href="/productos/" label="Productos" />
              <SidebarLink href="/categorias/" label="Categorías" />
            </SidebarGroup>
          )}
          {hasPermission(user.role, "organization:read") && (
            <SidebarGroup
              label="Vendedores y sucursales"
              icon={Building2}
              open={openGroups.organization}
              onToggle={() =>
                setOpenGroups((current) => ({
                  ...current,
                  organization: !current.organization,
                }))
              }
            >
              <SidebarLink href="/sucursales/" label="Sucursales" />
              <SidebarLink href="/vendedores/" label="Vendedores" />
            </SidebarGroup>
          )}

          {hasPermission(user.role, "etl:admin") && (
            <a
              href="/etl/"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Workflow size={17} aria-hidden="true" />
              Administración ETL
            </a>
          )}
          {hasPermission(user.role, "analytics:read") && (
            <a
              href="/dashboard/"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <LayoutDashboard size={17} aria-hidden="true" />
              Dashboard
            </a>
          )}
          {hasPermission(user.role, "analytics:read") && (
            <SidebarGroup
              label="Reportes"
              icon={BarChart3}
              open={openGroups.reports}
              onToggle={() =>
                setOpenGroups((current) => ({
                  ...current,
                  reports: !current.reports,
                }))
              }
            >
              <SidebarLink
                href="/reportes/ventas/"
                label="Reporte de ventas"
                external
              />
              <SidebarLink
                href="/reportes/clientes/"
                label="Reporte de clientes"
                external
              />
              <SidebarLink
                href="/reportes/productos/"
                label="Reporte de productos"
                external
              />
              <SidebarLink
                href="/reportes/rendimiento/"
                label="Rendimiento comercial"
                external
              />
            </SidebarGroup>
          )}
        </nav>

        <div className="w-full p-3">
          <div className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-white/5 transition-colors duration-300 border border-white/10">
            <div className="grid size-9 place-items-center rounded-full overflow-hidden bg-primary">
              <p>{user.displayName[0]}</p>
            </div>
            <div>
              <p className="truncate text-sm font-semibold">
                {user.displayName}
              </p>
              <p className="text-xs text-slate-400">{user.role}</p>
            </div>
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-20 bg-slate-950/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-border-default bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg p-2 hover:bg-surface-hover md:hidden"
            >
              {menuOpen ? (
                <X size={20} aria-hidden="true" />
              ) : (
                <Menu size={20} aria-hidden="true" />
              )}
            </button>
            <p className="text-sm font-bold sm:text-base">{title}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {user.displayName}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold hover:bg-surface-hover"
            >
              <span className="flex items-center gap-2">
                <LogOut size={16} aria-hidden="true" />
                Cerrar sesión
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-7 custom-scrollbar">
          {!allowed ? (
            <section className="rounded-xl border border-warning/30 bg-warning-subtle p-6">
              <h1 className="font-bold">Acceso restringido</h1>
              <p className="mt-2 text-sm text-text-secondary">
                Tu rol no tiene permiso para consultar esta sección.
              </p>
              <a
                href="/"
                className="mt-4 inline-block text-sm font-bold text-primary-active"
              >
                Volver al inicio
              </a>
            </section>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
