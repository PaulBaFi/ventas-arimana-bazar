import { useState, type SubmitEvent } from "react";
import { DEMO_LOGIN_PASSWORD, authService } from "@/services/authService";
import { ActionButton } from "@/components/ui/ActionButton";

const examples = ["admin.arimana", "vendedor.arimana", "analista.arimana"];
export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await authService.signIn(username, password);
      window.location.assign("/");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo iniciar sesión.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen bg-surface-page lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-surface-sidebar p-12 text-text-inverse lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl overflow-hidden bg-primary">
            <img src="/LOGO_FILL.png" alt="Logo de Arimana Bazar" />
          </div>
          <span className="text-lg font-bold">Arimana Bazar</span>
        </div>

        <div className="max-w-lg">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-primary">
            Gestión comercial
          </p>
          <h1 className="text-5xl font-extrabold leading-tight">
            Portal de gestión de ventas empresarial
          </h1>
          <p className="mt-5 text-lg text-slate-300">
            Ingresa tus credenciales para acceder a la plataforma comercial
          </p>
        </div>
        <div className="pointer-events-none absolute -bottom-36 -right-20 size-96 rounded-full border-48 border-white/5" />
      </section>

      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="font-bold">Arimana Bazar</p>
            <p className="text-sm text-text-secondary">
              Sistema de Gestión de Ventas
            </p>
          </div>
          <p className="text-sm font-bold uppercase tracking-wider text-primary-active">
            Bienvenido
          </p>
          <h2 className="mt-2 text-3xl font-extrabold">Iniciar sesión</h2>
          <p className="mt-2 text-text-secondary">
            Ingresa con las credenciales autorizadas por la administración.
          </p>
          <form className="mt-8 grid gap-5" onSubmit={submit}>
            <label
              className="grid gap-1.5 text-sm font-semibold"
              htmlFor="login-username"
            >
              Usuario
              <input
                id="login-username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="min-h-11 rounded-lg border border-border-default bg-white px-3 font-normal outline-none focus:border-border-primary"
              />
            </label>
            <label
              className="grid gap-1.5 text-sm font-semibold"
              htmlFor="login-password"
            >
              Contraseña
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11 rounded-lg border border-border-default bg-white px-3 font-normal outline-none focus:border-border-primary"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-danger-subtle p-3 text-sm text-danger"
              >
                {error}
              </p>
            )}
            <ActionButton type="submit" disabled={busy}>
              {busy ? "Validando…" : "Ingresar"}
            </ActionButton>
          </form>
          <div className="mt-8 rounded-xl border border-border-default bg-white p-4">
            <p className="text-sm font-bold">Accesos disponibles</p>
            <p className="mt-1 text-xs text-text-secondary">
              Clave de acceso:{" "}
              <code className="font-bold">{DEMO_LOGIN_PASSWORD}</code>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {examples.map((account) => (
                <button
                  key={account}
                  type="button"
                  onClick={() => {
                    setUsername(account);
                    setPassword(DEMO_LOGIN_PASSWORD);
                  }}
                  className="rounded-full bg-surface-page px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-primary-subtle"
                >
                  {account}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-text-muted">
            El acceso y la administración de cuentas están sujetos a los permisos asignados.
          </p>
        </div>
      </section>
    </main>
  );
}
