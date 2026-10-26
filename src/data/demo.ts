import type { EntityByStore, StoreName } from "@/domain/models";

const stamp = "2026-01-15T12:00:00.000Z";
const base = (id: string) => ({ id, createdAt: stamp, updatedAt: stamp, status: "active" as const, demo: true as const });
export const DEMO_DATA: { [K in StoreName]: EntityByStore[K][] } = {
  users: [
    { ...base("user-admin"), username: "admin.arimana", displayName: "Administración General", role: "Administrador" },
    { ...base("user-seller"), username: "vendedor.arimana", displayName: "María Fernanda Torres", role: "Vendedor", employeeId: "seller-1" },
    { ...base("user-analyst"), username: "analista.arimana", displayName: "Analista Comercial", role: "Analista" },
  ],
  customers: [
    { ...base("customer-1"), kind: "person", personId: "person-customer-1" },
    { ...base("customer-2"), kind: "company", companyId: "company-customer-2" },
  ],
  persons: [{ ...base("person-customer-1"), documentType: "DNI", documentNumber: "00000001", firstName: "Cliente", lastName: "Frecuente", email: "cliente@example.test" }],
  companies: [{ ...base("company-customer-2"), ruc: "20000000001", legalName: "Comercial Andina SAC" }],
  categories: [{ ...base("category-1"), code: "CAT-001", name: "Accesorios" }],
  products: [{ ...base("product-1"), code: "PRD-001", name: "Bolso urbano", categoryId: "category-1", unitPrice: 25 }],
  branches: [{ ...base("branch-1"), code: "SUC-001", name: "Sucursal Central", address: "Av. Principal 120", phone: "(01) 555-0100" }],
  sellers: [{ ...base("seller-1"), documentType: "DNI", documentNumber: "00000002", name: "María Fernanda Torres", branchId: "branch-1", email: "maria.torres@example.test", userId: "user-seller" }],
  paymentMethods: [{ ...base("payment-cash"), name: "Efectivo", description: "Pago en efectivo" }, { ...base("payment-card"), name: "Tarjeta", description: "Pago con tarjeta" }],
  sales: [], receipts: [],
  departments: [{ ...base("department-lima"), code: "15", name: "Lima" }],
  provinces: [{ ...base("province-lima"), code: "1501", name: "Lima", departmentId: "department-lima" }],
  districts: [{ ...base("district-miraflores"), code: "150122", name: "Miraflores", provinceId: "province-lima" }],
  etlConnections: [], etlExecutions: [], auditLogs: [], consolidatedRows: [],
};
