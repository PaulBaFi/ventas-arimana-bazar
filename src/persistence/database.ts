import { DEMO_DATA } from "@/data/demo";
import type { Company, Customer, EntityByStore, Person, StoreName } from "@/domain/models";

const DB_NAME = "arimana-bazar-demo";
const DB_VERSION = 3;
const STORES: StoreName[] = ["users", "customers", "persons", "companies", "categories", "products", "branches", "sellers", "paymentMethods", "sales", "receipts", "departments", "provinces", "districts", "etlConnections", "etlExecutions", "auditLogs", "consolidatedRows"];

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB no está disponible en este entorno."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      if ((event as IDBVersionChangeEvent).oldVersion < 2 && db.objectStoreNames.contains("customers")) {
        const tx = request.transaction!;
        const customers = tx.objectStore("customers");
        const cursorRequest = customers.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const legacy = cursor.value as Record<string, unknown>;
          if (!legacy.personId && !legacy.companyId && typeof legacy.name === "string") {
            const id = String(legacy.id);
            const stamp = String(legacy.updatedAt ?? new Date().toISOString());
            if (legacy.kind === "company") {
              const companyId = `company-${id}`;
              tx.objectStore("companies").put({ id: companyId, ruc: String(legacy.documentNumber ?? ""), legalName: legacy.name === "Empresa Demo SAC" ? "Comercial Andina SAC" : legacy.name, email: legacy.email, phone: legacy.phone, createdAt: legacy.createdAt ?? stamp, updatedAt: stamp, status: legacy.status ?? "active", demo: true });
              cursor.update({ id, kind: "company", companyId, createdAt: legacy.createdAt, updatedAt: stamp, status: legacy.status, demo: true });
            } else {
              const personId = `person-${id}`;
              const fullName = String(legacy.name).trim().split(/\s+/);
              const firstName = fullName.shift() ?? "Cliente";
              const lastName = fullName.join(" ") || "Migrado";
              tx.objectStore("persons").put({ id: personId, documentType: legacy.documentType === "CE" ? "CE" : "DNI", documentNumber: legacy.documentNumber ?? "", firstName, lastName: lastName === "Demostración" ? "Frecuente" : lastName, email: legacy.email, phone: legacy.phone, createdAt: legacy.createdAt ?? stamp, updatedAt: stamp, status: legacy.status ?? "active", demo: true });
              cursor.update({ id, kind: "person", personId, createdAt: legacy.createdAt, updatedAt: stamp, status: legacy.status, demo: true });
            }
          }
          cursor.continue();
        };
      }
      if ((event as IDBVersionChangeEvent).oldVersion < 3) {
        const tx = request.transaction!;
        const sellers = tx.objectStore("sellers");
        const sellerCursor = sellers.openCursor();
        sellerCursor.onsuccess = () => {
          const cursor = sellerCursor.result;
          if (!cursor) return;
          const seller = cursor.value as Record<string, unknown>;
          if (!seller.documentType) cursor.update({ ...seller, documentType: "DNI" });
          cursor.continue();
        };
        const migrate = (storeName: StoreName, id: string, transform: (record: Record<string, unknown>) => Record<string, unknown>) => {
          const store = tx.objectStore(storeName);
          const get = store.get(id);
          get.onsuccess = () => { if (get.result) store.put(transform(get.result as Record<string, unknown>)); };
        };
        migrate("users", "user-admin", record => record.username === "admin.demo" ? { ...record, username: "admin.arimana", displayName: "Administración General" } : record);
        migrate("users", "user-seller", record => record.username === "vendedor.demo" ? { ...record, username: "vendedor.arimana", displayName: "María Fernanda Torres" } : record);
        migrate("users", "user-analyst", record => record.username === "analista.demo" ? { ...record, username: "analista.arimana", displayName: "Analista Comercial" } : record);
        migrate("persons", "person-customer-1", record => record.lastName === "Demostración" ? { ...record, lastName: "Frecuente" } : record);
        migrate("companies", "company-customer-2", record => record.legalName === "Empresa Demo SAC" ? { ...record, legalName: "Comercial Andina SAC" } : record);
        migrate("categories", "category-1", record => record.description === "Categoría de demostración" ? { ...record, description: undefined } : record);
        migrate("products", "product-1", record => record.code === "DEM-001" ? { ...record, code: "PRD-001", name: "Bolso urbano" } : record);
        migrate("branches", "branch-1", record => record.name === "Sucursal Demostración" ? { ...record, name: "Sucursal Central", address: "Av. Principal 120", phone: "(01) 555-0100" } : record);
        migrate("sellers", "seller-1", record => record.name === "Vendedora Demo" ? { ...record, name: "María Fernanda Torres", documentType: "DNI", email: "maria.torres@example.test" } : record);
        migrate("paymentMethods", "payment-cash", record => record.description === "Medio de pago simulado" ? { ...record, description: "Pago en efectivo" } : record);
        migrate("paymentMethods", "payment-card", record => record.description === "Medio de pago simulado" ? { ...record, description: "Pago con tarjeta" } : record);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la base local."));
  });
}
const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Error en IndexedDB."));
});

/** Repositorio local tipado. La interfaz se puede sustituir por implementaciones REST. */
export const localRepository = {
  async list<K extends StoreName>(store: K): Promise<EntityByStore[K][]> {
    const db = await openDatabase();
    try { return await requestResult(db.transaction(store, "readonly").objectStore(store).getAll()) as EntityByStore[K][]; }
    finally { db.close(); }
  },
  async get<K extends StoreName>(store: K, id: string): Promise<EntityByStore[K] | undefined> {
    const db = await openDatabase();
    try { return await requestResult(db.transaction(store, "readonly").objectStore(store).get(id)) as EntityByStore[K] | undefined; }
    finally { db.close(); }
  },
  async put<K extends StoreName>(store: K, entity: EntityByStore[K]): Promise<EntityByStore[K]> {
    const db = await openDatabase();
    try { await requestResult(db.transaction(store, "readwrite").objectStore(store).put(entity)); return entity; }
    finally { db.close(); }
  },
  async remove<K extends StoreName>(store: K, id: string): Promise<void> {
    const db = await openDatabase();
    try { await requestResult(db.transaction(store, "readwrite").objectStore(store).delete(id)); }
    finally { db.close(); }
  },
  async saveCustomerAggregate(customer: Customer, related: Person | Company): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["customers", "persons", "companies"], "readwrite");
      tx.objectStore(related && "firstName" in related ? "persons" : "companies").put(related);
      tx.objectStore("customers").put(customer);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar el cliente y su entidad vinculada."));
        tx.onabort = () => reject(tx.error ?? new Error("Guardado del cliente cancelado."));
      });
    } finally { db.close(); }
  },
  async removeCustomerAggregate(customer: Customer): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["customers", "persons", "companies"], "readwrite");
      tx.objectStore("customers").delete(customer.id);
      if (customer.personId) tx.objectStore("persons").delete(customer.personId);
      if (customer.companyId) tx.objectStore("companies").delete(customer.companyId);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo eliminar el cliente."));
        tx.onabort = () => reject(tx.error ?? new Error("Eliminación del cliente cancelada."));
      });
    } finally { db.close(); }
  },
  async deactivateBranchWithSellers(branchId: string): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["branches", "sellers"], "readwrite");
      const branches = tx.objectStore("branches");
      const branchRequest = branches.get(branchId);
      const sellers = tx.objectStore("sellers");
      const sellersRequest = sellers.getAll();
      let branchReady = false;
      let sellersReady = false;
      const apply = () => {
        if (!branchReady || !sellersReady) return;
        const branch = branchRequest.result as EntityByStore["branches"] | undefined;
        if (!branch) { tx.abort(); return; }
        branches.put({ ...branch, status: "inactive", updatedAt: new Date().toISOString() });
        for (const seller of sellersRequest.result as EntityByStore["sellers"][]) {
          if (seller.branchId === branchId && seller.status === "active") sellers.put({ ...seller, status: "inactive", updatedAt: new Date().toISOString() });
        }
      };
      branchRequest.onsuccess = () => { branchReady = true; apply(); };
      sellersRequest.onsuccess = () => { sellersReady = true; apply(); };
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo desactivar la sucursal y sus vendedores."));
        tx.onabort = () => reject(tx.error ?? new Error("Desactivación de sucursal cancelada."));
      });
    } finally { db.close(); }
  },
  async seedDemoData(): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(STORES, "readwrite");
      for (const store of STORES) {
        const objectStore = tx.objectStore(store);
        const count = objectStore.count();
        count.onsuccess = () => {
          if (count.result !== 0) return;
          for (const item of DEMO_DATA[store] as EntityByStore[typeof store][]) objectStore.put(item);
        };
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudieron inicializar los datos del sistema."));
        tx.onabort = () => reject(tx.error ?? new Error("Inicialización cancelada."));
      });
    } finally { db.close(); }
  },
};
