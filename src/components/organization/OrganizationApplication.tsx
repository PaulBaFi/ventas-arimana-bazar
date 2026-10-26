import { AdminShell } from "@/components/layout/AdminShell";
import { OrganizationPage } from "./OrganizationPage";
export function OrganizationApplication({ initialTab = "branches" }: { initialTab?: "branches" | "sellers" }) {
  return (
    <AdminShell
      title={initialTab === "branches" ? "Sucursales" : "Vendedores"}
      requiredPermission="organization:read"
    >
      <OrganizationPage initialTab={initialTab} />
    </AdminShell>
  );
}
