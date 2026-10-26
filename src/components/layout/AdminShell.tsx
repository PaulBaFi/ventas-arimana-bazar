import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@/domain/models";
import { hasPermission, type Permission } from "@/domain/permissions";
import { authService } from "@/services/authService";
import { localRepository } from "@/persistence/database";

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
    <div className="min-h-screen bg-surface-page md:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col bg-surface-sidebar text-text-inverse transition-transform md:static md:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid size-9 place-items-center rounded-lg overflow-hidden bg-primary">
            <img src="/LOGO_FILL.png" alt="Logo de Arimana Bazar" />
          </div>
          <div>
            <p className="text-sm font-bold">Arimana Bazar</p>
            <p className="text-xs text-slate-400">Gestión de ventas · Demo</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4" aria-label="Navegación principal">
          <a
            href="/"
            className="block rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Inicio
          </a>
          {hasPermission(user.role, "users:manage") && (
            <a
              href="/usuarios/"
              className="block rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
            >
              Acceso y usuarios
            </a>
          )}
          {hasPermission(user.role, "customers:read") && (
            <a href="/clientes/" className="block rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white">Clientes</a>
          )}
          {hasPermission(user.role, "catalog:read") && (
            <a href="/catalogo/" className="block rounded-lg px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white">Productos y categorías</a>
          )}
        </nav>
        <div className="border-t border-white/10 p-5">
          <p className="truncate text-sm font-semibold">{user.displayName}</p>
          <p className="mt-1 text-xs text-slate-400">{user.role}</p>
        </div>
      </aside>
      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          className="fixed inset-0 z-20 bg-slate-950/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border-default bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg p-2 hover:bg-surface-hover md:hidden"
            >
              <span aria-hidden="true">☰</span>
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
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-7">
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
