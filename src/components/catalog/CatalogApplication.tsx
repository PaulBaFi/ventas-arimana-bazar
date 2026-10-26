import { AdminShell } from "@/components/layout/AdminShell";
import { CatalogPage } from "./CatalogPage";
export function CatalogApplication({ initialTab = "products" }: { initialTab?: "products" | "categories" }) { return <AdminShell title={initialTab === "products" ? "Productos" : "Categorías"} requiredPermission="catalog:read"><CatalogPage initialTab={initialTab} /></AdminShell>; }
