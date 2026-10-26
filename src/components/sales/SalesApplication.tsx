import { AdminShell } from "@/components/layout/AdminShell";
import { SalesPage } from "./SalesPage";
export function SalesApplication({ initialTab = "sales" }: { initialTab?: "sales" | "receipts" | "payments" }) { return <AdminShell title={initialTab === "sales" ? "Ventas" : initialTab === "receipts" ? "Comprobantes" : "Medios de pago"} requiredPermission="sales:read"><SalesPage initialTab={initialTab} /></AdminShell>; }
