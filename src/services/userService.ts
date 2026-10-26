import type { User, UserRole } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { validateUser, type UserInput } from "@/domain/validation";
import { localRepository } from "@/persistence/database";

export class UserService {
  async list(actorRole: UserRole): Promise<User[]> {
    assertPermission(actorRole, "users:manage");
    return localRepository.list("users");
  }
  async get(actorRole: UserRole, id: string): Promise<User> {
    assertPermission(actorRole, "users:manage");
    const user = await localRepository.get("users", id);
    if (!user) throw new Error("No se encontró el usuario.");
    return user;
  }
  async save(actorRole: UserRole, input: UserInput & { id?: string; employeeId?: string }): Promise<User> {
    assertPermission(actorRole, "users:manage");
    const errors = validateUser(input);
    if (Object.keys(errors).length) throw new Error(Object.values(errors).filter(Boolean).join(" "));
    const users = await localRepository.list("users");
    if (users.some(user => user.username.toLocaleLowerCase("es") === input.username.trim().toLocaleLowerCase("es") && user.id !== input.id)) {
      throw new Error("Ya existe una cuenta con ese nombre de usuario.");
    }
    const now = new Date().toISOString();
    const previous = input.id ? users.find(user => user.id === input.id) : undefined;
    if (input.id && !previous) throw new Error("No se encontró el usuario que deseas modificar.");
    const user: User = {
      id: input.id ?? crypto.randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now,
      status: previous?.status ?? "active", demo: true, username: input.username.trim(),
      displayName: input.displayName.trim(), role: input.role, email: input.email?.trim() || undefined,
      employeeId: input.employeeId?.trim() || undefined,
    };
    return localRepository.put("users", user);
  }
  async deactivate(actorRole: UserRole, id: string, currentUserId: string): Promise<void> {
    assertPermission(actorRole, "users:manage");
    if (id === currentUserId) throw new Error("No puedes desactivar tu propia cuenta mientras tienes sesión iniciada.");
    const user = await this.get(actorRole, id);
    if (user.status === "inactive") throw new Error("La cuenta ya está desactivada.");
    await localRepository.put("users", { ...user, status: "inactive", updatedAt: new Date().toISOString() });
  }
  async search(actorRole: UserRole, query: string, status: "all" | "active" | "inactive" = "all"): Promise<User[]> {
    const users = await this.list(actorRole);
    const term = query.trim().toLocaleLowerCase("es");
    return users.filter(user => (status === "all" || user.status === status) &&
      (!term || [user.id, user.username, user.displayName, user.email ?? "", user.role].some(value => value.toLocaleLowerCase("es").includes(term))));
  }
}
export const userService = new UserService();
