import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_DATA } from "@/data/demo";
import type { Sale } from "@/domain/models";
import { EntityService } from "@/services/entityService";
import { localRepository } from "./database";

async function clearDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("arimana-bazar-demo");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Borrado de base bloqueado."));
  });
}

describe("persistencia IndexedDB", () => {
  beforeEach(clearDatabase);

  it("inserta datos iniciales una sola vez aunque seeding se repita", async () => {
    await localRepository.seedDemoData();
    await localRepository.seedDemoData();
    expect((await localRepository.list("users"))).toHaveLength(DEMO_DATA.users.length);
    expect((await localRepository.list("customers"))).toHaveLength(DEMO_DATA.customers.length);
    expect((await localRepository.list("products"))[0].categoryId).toBe("category-1");
  });

  it("permite crear, consultar, modificar y eliminar físicamente registro", async () => {
    const categoryService = new EntityService(localRepository, "categories");
    const category = { ...DEMO_DATA.categories[0], id: "category-crud", code: "CRUD", name: "Creada" };
    await categoryService.save(category);
    expect((await categoryService.get(category.id))?.name).toBe("Creada");
    await categoryService.save({ ...category, name: "Modificada" });
    expect((await categoryService.search("modif", ["name"])).map(item => item.id)).toContain(category.id);
    await categoryService.remove(category.id);
    expect(await categoryService.get(category.id)).toBeUndefined();
  });

  it("desactiva lógicamente sin eliminar ventas ni relaciones históricas", async () => {
    await localRepository.seedDemoData();
    const sale: Sale = {
      id: "sale-history", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "active", demo: true,
      saleNumber: "DEMO-1", customerId: "customer-1", sellerId: "seller-1", branchId: "branch-1", lines: [], subtotal: 0,
      total: 0, state: "confirmed", saleDate: new Date().toISOString(),
    };
    await localRepository.put("sales", sale);
    await new EntityService(localRepository, "customers").deactivate("customer-1");
    expect((await localRepository.get("customers", "customer-1"))?.status).toBe("inactive");
    expect((await localRepository.get("sales", "sale-history"))?.customerId).toBe("customer-1");
    expect((await localRepository.list("customers"))).toHaveLength(DEMO_DATA.customers.length);
  });

  it("conserva registros al cerrar y reabrir la conexión IndexedDB", async () => {
    await localRepository.seedDemoData();
    const product = (await localRepository.get("products", "product-1"))!;
    await localRepository.put("products", { ...product, name: "Persistente" });
    // Cada operación del repositorio abre su propia conexión y la cierra al terminar.
    expect((await localRepository.get("products", "product-1"))?.name).toBe("Persistente");
  });
});
