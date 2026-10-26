import { AdminShell } from "@/components/layout/AdminShell";
import { EtlPage } from "./EtlPage";
export function EtlApplication() { return <AdminShell title="Administración ETL" requiredPermission="etl:admin"><EtlPage /></AdminShell>; }
