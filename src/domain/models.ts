export type EntityStatus = "active" | "inactive";
export type UserRole = "Administrador" | "Vendedor" | "Cajero" | "Gerencia" | "Analista";

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: EntityStatus;
  /** Marca explícita para que los registros de demostración nunca se confundan con datos reales. */
  demo: true;
}

export interface User extends BaseEntity {
  username: string;
  displayName: string;
  role: UserRole;
  employeeId?: string;
  email?: string;
}

export interface Customer extends BaseEntity {
  kind: "person" | "company";
  documentType: "DNI" | "RUC" | "CE";
  documentNumber: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface Category extends BaseEntity { code: string; name: string; description?: string }
export interface Product extends BaseEntity { code: string; name: string; categoryId: string; description?: string; unitPrice: number }
export interface Branch extends BaseEntity { code: string; name: string; address?: string }
export interface Seller extends BaseEntity { documentNumber: string; name: string; branchId: string; userId?: string }
export interface PaymentMethod extends BaseEntity { name: string; description?: string }
export interface SaleLine { id: string; productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number }
export interface Sale extends BaseEntity {
  saleNumber: string; customerId: string; sellerId: string; branchId: string; lines: SaleLine[];
  subtotal: number; total: number; state: "draft" | "confirmed" | "voided"; saleDate: string;
  paymentMethodId?: string; departmentId?: string; provinceId?: string; districtId?: string;
}
export interface Receipt extends BaseEntity { saleId: string; type: "Boleta" | "Factura"; series: string; number: string; state: "draft" | "issued" | "voided" }
export interface Department extends BaseEntity { code: string; name: string }
export interface Province extends BaseEntity { code: string; name: string; departmentId: string }
export interface District extends BaseEntity { code: string; name: string; provinceId: string }

export const ETL_SOURCE_NAMES = [
  "siga_1646", "SamarImportadora", "DW_SamarImportadora", "CASTILLONV2",
  "BD_CASTILLON_VETERINARIA", "Arimana Bazar OLTP",
] as const;
export type EtlSourceName = typeof ETL_SOURCE_NAMES[number];
export interface EtlConnection extends BaseEntity {
  name: EtlSourceName; server: string; engine: string; database: string; username: string;
  /** Nunca se persiste una contraseña auténtica. En demostración solo se guarda un marcador ficticio. */
  credentialConfigured: boolean;
}
export type StoreName = "users" | "customers" | "categories" | "products" | "branches" | "sellers" | "paymentMethods" | "sales" | "receipts" | "departments" | "provinces" | "districts" | "etlConnections" | "etlExecutions" | "auditLogs" | "consolidatedRows";
export interface AuditLog extends BaseEntity { actorId: string; action: string; target: string; result: "success" | "error"; message: string }
export interface EtlExecution extends BaseEntity { sourceNames: EtlSourceName[]; state: "pending" | "running" | "completed" | "error"; startedAt: string; durationSeconds: number; log: string[]; extracted: number; transformed: number; loaded: number; rejected: number }
export interface ConsolidatedRow extends BaseEntity { source: EtlSourceName; sourceKey: string; dimension: string; amount: number; date: string }

export type EntityByStore = {
  users: User; customers: Customer; categories: Category; products: Product; branches: Branch;
  sellers: Seller; paymentMethods: PaymentMethod; sales: Sale; receipts: Receipt;
  departments: Department; provinces: Province; districts: District; etlConnections: EtlConnection;
  etlExecutions: EtlExecution; auditLogs: AuditLog; consolidatedRows: ConsolidatedRow;
};
