import { AdminShell } from "@/components/layout/AdminShell";
import { CustomersPage } from "./CustomersPage";
export function CustomersApplication() { return <AdminShell title="Clientes" requiredPermission="customers:read"><CustomersPage /></AdminShell>; }
