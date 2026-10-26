import { AdminShell } from "@/components/layout/AdminShell";
import { UsersPage } from "./UsersPage";
export function UsersApplication() {
  return <AdminShell title="Acceso y usuarios" requiredPermission="users:manage"><UsersPage /></AdminShell>;
}
