import { beforeEach, describe, expect, it } from "vitest";
import type { UserRole } from "@/domain/models";
import { validateUser } from "@/domain/validation";
import { DEMO_LOGIN_PASSWORD, authService } from "./authService";
import { userService } from "./userService";
import { localRepository } from "@/persistence/database";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: localStorageMock } });

async function resetDb() {
  authService.signOut();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("arimana-bazar-demo");
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  storage.clear();
}

describe("acceso y mantenimiento de usuarios", () => {
  beforeEach(resetDb);

  it("valida requeridos, formato de usuario y correo electrónico", () => {
    expect(validateUser({ username: "", displayName: "", role: "Vendedor" })).toMatchObject({ username: expect.any(String), displayName: expect.any(String) });
    expect(validateUser({ username: "inválido!", displayName: "Nombre", role: "Vendedor", email: "correo" }).username).toBeTruthy();
    expect(validateUser({ username: "nuevo.usuario", displayName: "Nombre", role: "Analista", email: "n@ejemplo.test" })).toEqual({});
  });

  it("simula login y logout sin persistir la contraseña", async () => {
    await expect(authService.signIn("admin.demo", "incorrecta")).rejects.toThrow(/incorrectos/);
    const user = await authService.signIn("admin.demo", DEMO_LOGIN_PASSWORD);
    expect(user.role).toBe("Administrador");
    expect(await authService.currentUser()).toMatchObject({ id: "user-admin" });
    expect([...storage.values()].join(" ")).not.toContain(DEMO_LOGIN_PASSWORD);
    authService.signOut();
    expect(await authService.currentUser()).toBeNull();
  });

  it("crea, consulta, modifica, busca y desactiva usuarios sin borrar el historial", async () => {
    await localRepository.seedDemoData();
    const created = await userService.save("Administrador", { username: "persona.nueva", displayName: "Persona Nueva", role: "Cajero", email: "persona@ejemplo.test" });
    expect((await userService.get("Administrador", created.id)).role).toBe("Cajero");
    const updated = await userService.save("Administrador", { id: created.id, username: "persona.nueva", displayName: "Nombre Editado", role: "Analista" });
    expect(updated.displayName).toBe("Nombre Editado");
    expect((await userService.search("Administrador", "editado", "active")).map(user => user.id)).toContain(created.id);
    await userService.deactivate("Administrador", created.id, "user-admin");
    expect((await userService.get("Administrador", created.id)).status).toBe("inactive");
    expect((await userService.search("Administrador", "persona.nueva", "inactive"))).toHaveLength(1);
  });

  it("rechaza duplicados, datos inválidos, self-deactivation y operaciones de roles no autorizados", async () => {
    await localRepository.seedDemoData();
    await expect(userService.save("Administrador", { username: "admin.demo", displayName: "Duplicado", role: "Vendedor" })).rejects.toThrow(/Ya existe/);
    await expect(userService.save("Administrador", { username: "x", displayName: "Inválido", role: "Vendedor" })).rejects.toThrow(/caracteres/);
    await expect(userService.list("Vendedor")).rejects.toThrow(/permiso/);
    await expect(userService.save("Vendedor" as UserRole, { username: "bloqueado", displayName: "Bloqueado", role: "Vendedor" })).rejects.toThrow(/permiso/);
    await expect(userService.deactivate("Administrador", "user-admin", "user-admin")).rejects.toThrow(/propia cuenta/);
  });

  it("impide el inicio de sesión de una cuenta desactivada", async () => {
    await localRepository.seedDemoData();
    await userService.deactivate("Administrador", "user-admin", "user-seller");
    await expect(authService.signIn("admin.demo", DEMO_LOGIN_PASSWORD)).rejects.toThrow(/desactivada/);
  });
});
