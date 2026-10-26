import { AdminShell } from "@/components/layout/AdminShell";
import { AnalyticsPage } from "./AnalyticsPage";
import type { ReportId } from "@/services/analyticsService";
export function AnalyticsApplication({ mode = "full", reportId }: { mode?: "full" | "dashboard" | "report"; reportId?: ReportId }) { return <AdminShell title={mode === "dashboard" ? "Dashboard" : mode === "report" ? "Reportes" : "Análisis y reportes"} requiredPermission="analytics:read"><AnalyticsPage mode={mode} reportId={reportId} /></AdminShell>; }
