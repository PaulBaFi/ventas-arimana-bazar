import type { UserRole } from "./models";

export type Permission = "users:manage" | "customers:read" | "customers:write" | "catalog:read" | "catalog:write" | "sales:write" | "organization:write" | "etl:admin" | "analytics:read";
const grants: Record<UserRole, Permission[]> = {
  Administrador: ["users:manage", "customers:read", "customers:write", "catalog:read", "catalog:write", "sales:write", "organization:write", "etl:admin", "analytics:read"],
  Vendedor: ["customers:read", "customers:write", "catalog:read", "sales:write"],
  Cajero: ["customers:read", "catalog:read", "sales:write"],
  Gerencia: ["analytics:read"],
  Analista: ["analytics:read"],
};
export const hasPermission = (role: UserRole | undefined, permission: Permission): boolean => !!role && grants[role].includes(permission);
export const permissionsFor = (role: UserRole): readonly Permission[] => grants[role];
export function assertPermission(role: UserRole | undefined, permission: Permission): void {
  if (!hasPermission(role, permission)) throw new Error("No tienes permiso para realizar esta operación.");
}
