import type { EntityByStore, StoreName } from "@/domain/models";

const stamp = "2026-01-15T12:00:00.000Z";
const base = (id: string) => ({ id, createdAt: stamp, updatedAt: stamp, status: "active" as const, demo: true as const });
export const DEMO_DATA: { [K in StoreName]: EntityByStore[K][] } = {
  users: [
    { ...base("user-admin"), username: "admin.demo", displayName: "Administración Demo", role: "Administrador" },
    { ...base("user-seller"), username: "vendedor.demo", displayName: "Vendedora Demo", role: "Vendedor", employeeId: "seller-1" },
    { ...base("user-analyst"), username: "analista.demo", displayName: "Analista Demo", role: "Analista" },
  ],
  customers: [
    { ...base("customer-1"), kind: "person", documentType: "DNI", documentNumber: "00000001", name: "Cliente Demostración", email: "cliente@example.test" },
    { ...base("customer-2"), kind: "company", documentType: "RUC", documentNumber: "20000000001", name: "Empresa Demo SAC" },
  ],
  categories: [{ ...base("category-1"), code: "CAT-001", name: "Accesorios", description: "Categoría de demostración" }],
  products: [{ ...base("product-1"), code: "DEM-001", name: "Producto de demostración", categoryId: "category-1", unitPrice: 25 }],
  branches: [{ ...base("branch-1"), code: "SUC-001", name: "Sucursal Demostración", address: "Dirección ficticia" }],
  sellers: [{ ...base("seller-1"), documentNumber: "00000002", name: "Vendedora Demo", branchId: "branch-1", userId: "user-seller" }],
  paymentMethods: [{ ...base("payment-cash"), name: "Efectivo", description: "Medio de pago simulado" }, { ...base("payment-card"), name: "Tarjeta", description: "Medio de pago simulado" }],
  sales: [], receipts: [],
  departments: [{ ...base("department-lima"), code: "15", name: "Lima" }],
  provinces: [{ ...base("province-lima"), code: "1501", name: "Lima", departmentId: "department-lima" }],
  districts: [{ ...base("district-miraflores"), code: "150122", name: "Miraflores", provinceId: "province-lima" }],
  etlConnections: [], etlExecutions: [], auditLogs: [], consolidatedRows: [],
};
