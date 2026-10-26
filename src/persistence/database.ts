import { DEMO_DATA } from "@/data/demo";
import type { Company, Customer, EntityByStore, Person, StoreName } from "@/domain/models";

const DB_NAME = "arimana-bazar-demo";
const DB_VERSION = 2;
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
              tx.objectStore("companies").put({ id: companyId, ruc: String(legacy.documentNumber ?? ""), legalName: legacy.name, email: legacy.email, phone: legacy.phone, createdAt: legacy.createdAt ?? stamp, updatedAt: stamp, status: legacy.status ?? "active", demo: true });
              cursor.update({ id, kind: "company", companyId, createdAt: legacy.createdAt, updatedAt: stamp, status: legacy.status, demo: true });
            } else {
              const personId = `person-${id}`;
              const fullName = String(legacy.name).trim().split(/\s+/);
              const firstName = fullName.shift() ?? "Cliente";
              tx.objectStore("persons").put({ id: personId, documentType: legacy.documentType === "CE" ? "CE" : "DNI", documentNumber: legacy.documentNumber ?? "", firstName, lastName: fullName.join(" ") || "Migrado", email: legacy.email, phone: legacy.phone, createdAt: legacy.createdAt ?? stamp, updatedAt: stamp, status: legacy.status ?? "active", demo: true });
              cursor.update({ id, kind: "person", personId, createdAt: legacy.createdAt, updatedAt: stamp, status: legacy.status, demo: true });
            }
          }
          cursor.continue();
        };
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
        tx.onerror = () => reject(tx.error ?? new Error("No se pudieron inicializar los datos demo."));
        tx.onabort = () => reject(tx.error ?? new Error("Inicialización cancelada."));
      });
    } finally { db.close(); }
  },
};
