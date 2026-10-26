import { DEMO_DATA } from "@/data/demo";
import type { EntityByStore, StoreName } from "@/domain/models";

const DB_NAME = "arimana-bazar-demo";
const DB_VERSION = 1;
const STORES: StoreName[] = ["users", "customers", "categories", "products", "branches", "sellers", "paymentMethods", "sales", "receipts", "departments", "provinces", "districts", "etlConnections", "etlExecutions", "auditLogs", "consolidatedRows"];

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB no está disponible en este entorno."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
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
