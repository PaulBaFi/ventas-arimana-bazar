import { AdminShell } from "@/components/layout/AdminShell";
import { CatalogPage } from "./CatalogPage";
export function CatalogApplication() { return <AdminShell title="Productos y categorías" requiredPermission="catalog:read"><CatalogPage /></AdminShell>; }
