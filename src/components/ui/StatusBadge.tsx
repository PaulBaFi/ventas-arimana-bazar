import type { EntityStatus } from "@/domain/models";
export function StatusBadge({ status }: { status: EntityStatus | "draft" | "confirmed" | "voided" | "pending" | "running" | "completed" | "error" }) {
  const active = status === "active" || status === "confirmed" || status === "completed";
  const warning = status === "draft" || status === "pending" || status === "running";
  const label: Record<typeof status, string> = { active: "Activo", inactive: "Inactivo", draft: "Borrador", confirmed: "Confirmada", voided: "Anulada", pending: "Pendiente", running: "En ejecución", completed: "Finalizada", error: "Con errores" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-success-subtle text-success" : warning ? "bg-warning-subtle text-warning" : "bg-danger-subtle text-danger"}`}>{label[status]}</span>;
}
