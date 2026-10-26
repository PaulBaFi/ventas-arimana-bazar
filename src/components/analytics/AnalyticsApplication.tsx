import { AdminShell } from "@/components/layout/AdminShell";
import { AnalyticsPage } from "./AnalyticsPage";
export function AnalyticsApplication() { return <AdminShell title="Análisis y reportes" requiredPermission="analytics:read"><AnalyticsPage /></AdminShell>; }
