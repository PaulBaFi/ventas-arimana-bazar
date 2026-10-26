import type { User } from "@/domain/models";
import { localRepository } from "@/persistence/database";

const SESSION_KEY = "arimana-demo-session";
const DEMO_PASSWORD = "Demo2026!";
export const DEMO_LOGIN_PASSWORD = DEMO_PASSWORD;

interface Session { userId: string; startedAt: string }
function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null") as Session | null; }
  catch { window.localStorage.removeItem(SESSION_KEY); return null; }
}

export const authService = {
  async signIn(username: string, password: string): Promise<User> {
    await localRepository.seedDemoData();
    const normalized = username.trim().toLocaleLowerCase("es");
    if (password !== DEMO_PASSWORD) throw new Error("Usuario o contraseña de demostración incorrectos.");
    const user = (await localRepository.list("users")).find(item => item.username.toLocaleLowerCase("es") === normalized);
    if (!user || user.status !== "active") throw new Error("La cuenta no existe o está desactivada.");
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, startedAt: new Date().toISOString() } satisfies Session));
    return user;
  },
  async currentUser(): Promise<User | null> {
    const session = readSession();
    if (!session) return null;
    const user = await localRepository.get("users", session.userId);
    if (!user || user.status !== "active") { this.signOut(); return null; }
    return user;
  },
  signOut(): void { if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY); },
};
