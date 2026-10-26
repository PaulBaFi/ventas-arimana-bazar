import { beforeEach, describe, expect, it } from "vitest";
import type { Sale } from "@/domain/models";
import { localRepository } from "@/persistence/database";
import { customerService } from "./customerService";
import { catalogService } from "./catalogService";

async function resetDb() {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase("arimana-bazar-demo"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

describe("clientes, relaciones e historial", () => {
  beforeEach(resetDb);
  it("realiza CRUD persona natural y conserva vínculo XOR al actualizar", async () => {
    await localRepository.seedDemoData();
    const created = await customerService.save("Administrador", { kind: "person", documentType: "DNI", documentNumber: "12345678", firstName: "Ada", lastName: "Prueba" });
    expect(created.personId).toBeTruthy(); expect(created.companyId).toBeUndefined();
    expect((await localRepository.get("persons", created.personId!))?.firstName).toBe("Ada");
    const updated = await customerService.save("Administrador", { id: created.id, kind: "person", documentType: "DNI", documentNumber: "12345678", firstName: "Ada", lastName: "Actualizada" });
    expect(updated.personId).toBe(created.personId); expect(updated.displayName).toBe("Ada Actualizada");
    expect((await customerService.search("Vendedor", "12345678"))).toHaveLength(1);
    expect((await customerService.delete("Administrador", created.id))).toBe("deleted");
    expect(await localRepository.get("persons", created.personId!)).toBeUndefined();
  });
  it("crea empresa vinculada y rechaza documentos duplicados e inválidos", async () => {
    await localRepository.seedDemoData();
    const company = await customerService.save("Administrador", { kind: "company", documentType: "RUC", documentNumber: "20987654321", legalName: "Empresa de Prueba SAC" });
    expect(company.companyId).toBeTruthy(); expect(company.personId).toBeUndefined();
    expect((await localRepository.get("companies", company.companyId!))?.legalName).toBe("Empresa de Prueba SAC");
    await expect(customerService.save("Administrador", { kind: "company", documentType: "RUC", documentNumber: "20000000001", legalName: "Duplicada SAC" })).rejects.toThrow(/documento/);
    await expect(customerService.save("Administrador", { kind: "company", documentType: "DNI", documentNumber: "12345678", legalName: "Inválida SAC" })).rejects.toThrow(/RUC/);
    await expect(customerService.list("Gerencia")).rejects.toThrow(/permiso/);
    await expect(customerService.save("Cajero", { kind: "person", documentType: "DNI", documentNumber: "11112222", firstName: "No", lastName: "Permiso" })).rejects.toThrow(/permiso/);
  });
  it("desactiva clientes con ventas y permite consultar su historial", async () => {
    await localRepository.seedDemoData();
    const existingSales = (await localRepository.list("sales")).filter(item => item.customerId === "customer-1").length;
    const sale: Sale = { id: "sale-client-test", saleNumber: "TEST-1", customerId: "customer-1", sellerId: "seller-1", branchId: "branch-1", lines: [], subtotal: 10, total: 10, state: "confirmed", saleDate: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "active", demo: true };
    await localRepository.put("sales", sale);
    expect((await customerService.salesHistory("Vendedor", "customer-1")).map(item => item.id)).toContain(sale.id);
    expect(await customerService.delete("Administrador", "customer-1")).toBe("deactivated");
    expect((await customerService.get("Administrador", "customer-1")).status).toBe("inactive");
    expect(await localRepository.get("persons", "person-customer-1")).toBeDefined();
    expect((await customerService.salesHistory("Vendedor", "customer-1"))).toHaveLength(existingSales + 1);
  });
});

describe("catálogo de productos y categorías", () => {
  beforeEach(resetDb);
  it("crea, consulta, actualiza, busca y elimina registros sin dependencias", async () => {
    await localRepository.seedDemoData();
    const category = await catalogService.saveCategory("Administrador", { code: "CAT-NEW", name: "Nueva categoría" });
    expect((await catalogService.searchCategories("Vendedor", "CAT-NEW"))[0].id).toBe(category.id);
    const product = await catalogService.saveProduct("Administrador", { code: "PRD-NEW", name: "Nuevo producto", categoryId: category.id, unitPrice: 14.5 });
    expect((await catalogService.searchProducts("Vendedor", "Nueva categoría"))[0].id).toBe(product.id);
    const updated = await catalogService.saveProduct("Administrador", { id: product.id, code: "PRD-NEW", name: "Actualizado", categoryId: category.id, unitPrice: 20 });
    expect(updated.name).toBe("Actualizado");
    expect(await catalogService.deleteProduct("Administrador", product.id)).toBe("deleted");
    expect(await catalogService.deleteCategory("Administrador", category.id)).toBe("deleted");
  });
  it("valida códigos únicos, obligatorios y precios; aplica permisos de escritura", async () => {
    await localRepository.seedDemoData();
    await expect(catalogService.saveCategory("Administrador", { code: "", name: "Sin código" })).rejects.toThrow(/obligatorio/);
    await expect(catalogService.saveCategory("Administrador", { code: "cat-001", name: "Duplicada" })).rejects.toThrow(/código/);
    await expect(catalogService.saveProduct("Administrador", { code: "BAD", name: "Precio malo", categoryId: "category-1", unitPrice: -1 })).rejects.toThrow(/precio/);
    await expect(catalogService.saveProduct("Administrador", { code: "BAD", name: "Sin categoría", categoryId: "no-existe", unitPrice: 1 })).rejects.toThrow(/categoría activa/);
    await expect(catalogService.saveCategory("Vendedor", { code: "NEW", name: "Sin permiso" })).rejects.toThrow(/permiso/);
    await expect(catalogService.saveProduct("Cajero", { code: "NEW", name: "Sin permiso", categoryId: "category-1", unitPrice: 1 })).rejects.toThrow(/permiso/);
  });
  it("desactiva categoría con productos y producto referenciado por ventas, conservando historial", async () => {
    await localRepository.seedDemoData();
    expect(await catalogService.deleteCategory("Administrador", "category-1")).toBe("deactivated");
    const category = await localRepository.get("categories", "category-1");
    expect(category?.status).toBe("inactive"); expect(await localRepository.get("products", "product-1")).toBeDefined();
    // Restaurar la categoría solo para registrar el producto histórico en la venta simulada.
    await localRepository.put("categories", { ...category!, status: "active" });
    const sale: Sale = { id: "sale-product-test", saleNumber: "TEST-2", customerId: "customer-1", sellerId: "seller-1", branchId: "branch-1", lines: [{ id: "line-1", productId: "product-1", productName: "Producto histórico", quantity: 2, unitPrice: 25, subtotal: 50 }], subtotal: 50, total: 50, state: "confirmed", saleDate: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "active", demo: true };
    await localRepository.put("sales", sale);
    expect(await catalogService.deleteProduct("Administrador", "product-1")).toBe("deactivated");
    expect((await localRepository.get("products", "product-1"))?.status).toBe("inactive");
    expect((await localRepository.get("sales", sale.id))?.lines[0].productName).toBe("Producto histórico");
  });
});
