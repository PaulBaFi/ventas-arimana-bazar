import type { Category, Product, UserRole } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { localRepository } from "@/persistence/database";

export interface CategoryInput { code: string; name: string; description?: string; id?: string }
export interface ProductInput { code: string; name: string; categoryId: string; description?: string; unitPrice: number; id?: string }
function requiredText(value: string, label: string) { if (!value.trim()) throw new Error(`${label} es obligatorio.`); }
export class CatalogService {
  async listCategories(role: UserRole): Promise<Category[]> { assertPermission(role, "catalog:read"); return localRepository.list("categories"); }
  async listProducts(role: UserRole): Promise<Product[]> { assertPermission(role, "catalog:read"); return localRepository.list("products"); }
  async saveCategory(role: UserRole, input: CategoryInput): Promise<Category> {
    assertPermission(role, "catalog:write");
    requiredText(input.code, "El código"); requiredText(input.name, "El nombre");
    const categories = await localRepository.list("categories");
    const previous = input.id ? categories.find(item => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error("No se encontró la categoría.");
    if (categories.some(item => item.code.trim().toLocaleLowerCase("es") === input.code.trim().toLocaleLowerCase("es") && item.id !== input.id)) throw new Error("Ya existe una categoría con ese código.");
    const now = new Date().toISOString();
    return localRepository.put("categories", { id: input.id ?? crypto.randomUUID(), code: input.code.trim(), name: input.name.trim(), description: input.description?.trim() || undefined, createdAt: previous?.createdAt ?? now, updatedAt: now, status: previous?.status ?? "active", demo: true });
  }
  async saveProduct(role: UserRole, input: ProductInput): Promise<Product> {
    assertPermission(role, "catalog:write");
    requiredText(input.code, "El código"); requiredText(input.name, "El nombre"); requiredText(input.categoryId, "La categoría");
    if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0 || Math.abs(input.unitPrice - Number(input.unitPrice.toFixed(2))) > Number.EPSILON) throw new Error("El precio debe ser un número válido, no negativo y con hasta dos decimales.");
    const [products, categories] = await Promise.all([localRepository.list("products"), localRepository.list("categories")]);
    const previous = input.id ? products.find(item => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error("No se encontró el producto.");
    if (products.some(item => item.code.trim().toLocaleLowerCase("es") === input.code.trim().toLocaleLowerCase("es") && item.id !== input.id)) throw new Error("Ya existe un producto con ese código.");
    if (!categories.some(category => category.id === input.categoryId && category.status === "active")) throw new Error("Selecciona una categoría activa.");
    const now = new Date().toISOString();
    return localRepository.put("products", { id: input.id ?? crypto.randomUUID(), code: input.code.trim(), name: input.name.trim(), categoryId: input.categoryId, description: input.description?.trim() || undefined, unitPrice: input.unitPrice, createdAt: previous?.createdAt ?? now, updatedAt: now, status: previous?.status ?? "active", demo: true });
  }
  async deleteCategory(role: UserRole, id: string): Promise<"deleted" | "deactivated"> {
    assertPermission(role, "catalog:write");
    const category = await localRepository.get("categories", id);
    if (!category) throw new Error("No se encontró la categoría.");
    const products = await localRepository.list("products");
    if (products.some(product => product.categoryId === id)) { await localRepository.put("categories", { ...category, status: "inactive", updatedAt: new Date().toISOString() }); return "deactivated"; }
    await localRepository.remove("categories", id); return "deleted";
  }
  async deleteProduct(role: UserRole, id: string): Promise<"deleted" | "deactivated"> {
    assertPermission(role, "catalog:write");
    const product = await localRepository.get("products", id);
    if (!product) throw new Error("No se encontró el producto.");
    const sales = await localRepository.list("sales");
    if (sales.some(sale => sale.lines.some(line => line.productId === id))) { await localRepository.put("products", { ...product, status: "inactive", updatedAt: new Date().toISOString() }); return "deactivated"; }
    await localRepository.remove("products", id); return "deleted";
  }
  async searchCategories(role: UserRole, query: string, status: "all" | "active" | "inactive" = "all"): Promise<Category[]> {
    const term = query.trim().toLocaleLowerCase("es");
    return (await this.listCategories(role)).filter(item => (status === "all" || item.status === status) && (!term || `${item.code} ${item.name} ${item.description ?? ""}`.toLocaleLowerCase("es").includes(term)));
  }
  async searchProducts(role: UserRole, query: string, status: "all" | "active" | "inactive" = "all"): Promise<Product[]> {
    const term = query.trim().toLocaleLowerCase("es");
    const [products, categories] = await Promise.all([this.listProducts(role), this.listCategories(role)]);
    const categoryNames = new Map(categories.map(category => [category.id, category.name]));
    return products.filter(item => (status === "all" || item.status === status) && (!term || `${item.code} ${item.name} ${item.description ?? ""} ${categoryNames.get(item.categoryId) ?? ""}`.toLocaleLowerCase("es").includes(term)));
  }
}
export const catalogService = new CatalogService();
