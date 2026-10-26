import { AdminShell } from "@/components/layout/AdminShell";
import { OrganizationPage } from "./OrganizationPage";
export function OrganizationApplication() {
  return (
    <AdminShell
      title="Vendedores y sucursales"
      requiredPermission="organization:read"
    >
      <OrganizationPage />
    </AdminShell>
  );
}
