import { DEMO_DATA } from "@/data/demo";
import type { AuditLog, Company, ConsolidatedRow, Customer, EntityByStore, EtlExecution, EtlConnection, Person, Receipt, Sale, StoreName } from "@/domain/models";

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
  /** Persist sale header, line snapshots, receipt and audit trail in one IndexedDB transaction. */
  async saveSaleAggregate(sale: Sale, receipt: Receipt | null, audit: AuditLog): Promise<{ sale: Sale; receipt: Receipt | null }> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["sales", "receipts", "auditLogs"], "readwrite");
      const salesStore = tx.objectStore("sales");
      const receiptsStore = tx.objectStore("receipts");
      const auditStore = tx.objectStore("auditLogs");
      const salesRequest = salesStore.getAll();
      const receiptsRequest = receiptsStore.getAll();
      let salesReady = false;
      let receiptsReady = false;
      let savedSale = sale;
      let savedReceipt = receipt;
      let commitError: unknown;
      const apply = () => {
        if (!salesReady || !receiptsReady) return;
        try {
          const sales = salesRequest.result as Sale[];
          const receipts = receiptsRequest.result as Receipt[];
          const previousSale = sales.find(item => item.id === sale.id);
          if (!previousSale) {
            const maxSaleNumber = sales.reduce((max, item) => Math.max(max, Number(item.saleNumber.match(/^V-(\d+)$/)?.[1] ?? 0)), 0);
            savedSale = { ...sale, saleNumber: `V-${String(maxSaleNumber + 1).padStart(6, "0")}` };
          }
          if (receipt) {
            const previousReceipt = receipts.find(item => item.id === receipt.id);
            const canKeepNumber = previousReceipt && previousReceipt.type === receipt.type && previousReceipt.series === receipt.series && !!previousReceipt.number;
            const maxReceiptNumber = receipts.filter(item => item.type === receipt.type && item.series === receipt.series)
              .reduce((max, item) => Math.max(max, Number(item.number) || 0), 0);
            const number = canKeepNumber ? previousReceipt.number : receipt.state === "issued" ? String(maxReceiptNumber + 1).padStart(6, "0") : "";
            savedReceipt = { ...receipt, number };
            savedSale = { ...savedSale, receiptId: savedReceipt.id };
            receiptsStore.put(savedReceipt);
          }
          salesStore.put(savedSale);
          auditStore.put(audit);
        } catch (error) {
          commitError = error;
          tx.abort();
        }
      };
      salesRequest.onsuccess = () => { salesReady = true; apply(); };
      receiptsRequest.onsuccess = () => { receiptsReady = true; apply(); };
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(commitError ?? tx.error ?? new Error("No se pudo guardar la operación y su auditoría."));
        tx.onabort = () => reject(commitError ?? tx.error ?? new Error("La operación fue cancelada."));
      });
      return { sale: savedSale, receipt: savedReceipt };
    } finally { db.close(); }
  },
  async removeDraftReceiptAggregate(sale: Sale, receiptId: string, audit: AuditLog): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["sales", "receipts", "auditLogs"], "readwrite");
      tx.objectStore("sales").put({ ...sale, receiptId: undefined, updatedAt: new Date().toISOString() });
      tx.objectStore("receipts").delete(receiptId);
      tx.objectStore("auditLogs").put(audit);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo eliminar el comprobante borrador."));
        tx.onabort = () => reject(tx.error ?? new Error("La operación fue cancelada."));
      });
    } finally { db.close(); }
  },
  async removeDraftSaleAggregate(sale: Sale, audit: AuditLog): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["sales", "receipts", "auditLogs"], "readwrite");
      tx.objectStore("sales").delete(sale.id);
      if (sale.receiptId) tx.objectStore("receipts").delete(sale.receiptId);
      tx.objectStore("auditLogs").put(audit);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo eliminar el borrador."));
        tx.onabort = () => reject(tx.error ?? new Error("La operación fue cancelada."));
      });
    } finally { db.close(); }
  },
  async saveEtlExecution(execution: EtlExecution, rows: ConsolidatedRow[], audit: AuditLog): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["etlExecutions", "consolidatedRows", "auditLogs"], "readwrite");
      tx.objectStore("etlExecutions").put(execution);
      const rowsStore = tx.objectStore("consolidatedRows");
      const existingRows = rowsStore.getAll();
      existingRows.onsuccess = () => {
        const keys = new Set(rows.map(row => row.sourceKey));
        for (const existing of existingRows.result as ConsolidatedRow[]) if (keys.has(existing.sourceKey)) rowsStore.delete(existing.id);
        for (const row of rows) rowsStore.put(row);
        tx.objectStore("auditLogs").put(audit);
      };
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar la ejecución ETL."));
        tx.onabort = () => reject(tx.error ?? new Error("La ejecución ETL fue cancelada."));
      });
    } finally { db.close(); }
  },
  async clearConsolidated(audit: AuditLog): Promise<number> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["consolidatedRows", "auditLogs"], "readwrite");
      const rows = tx.objectStore("consolidatedRows");
      const count = rows.count();
      let countValue = 0;
      count.onsuccess = () => { countValue = count.result; };
      rows.clear();
      tx.objectStore("auditLogs").put(audit);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo limpiar el consolidado."));
        tx.onabort = () => reject(tx.error ?? new Error("La limpieza fue cancelada."));
      });
      return countValue;
    } finally { db.close(); }
  },
  async saveEtlConnection(connection: EtlConnection, audit: AuditLog): Promise<void> {
    const db = await openDatabase();
    try {
      const tx = db.transaction(["etlConnections", "auditLogs"], "readwrite");
      tx.objectStore("etlConnections").put(connection);
      tx.objectStore("auditLogs").put(audit);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar la conexión ETL."));
        tx.onabort = () => reject(tx.error ?? new Error("La conexión ETL fue cancelada."));
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
