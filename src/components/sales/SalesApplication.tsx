import { AdminShell } from "@/components/layout/AdminShell";
import { SalesPage } from "./SalesPage";
export function SalesApplication() { return <AdminShell title="Ventas y comprobantes" requiredPermission="sales:read"><SalesPage /></AdminShell>; }
