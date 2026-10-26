import type { AuditLog, Customer, Department, District, PaymentMethod, Province, Receipt, Sale, Seller, Branch, User, UserRole } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { calculateSaleLines, calculateSaleTotal } from "@/domain/sales";
import { validateReceiptFields, validateSaleDraft, type SaleDraftInput } from "@/domain/validation";
import { localRepository } from "@/persistence/database";

export interface SaleFilters {
  query?: string; state?: "all" | Sale["state"]; from?: string; to?: string;
  customerId?: string; departmentId?: string; provinceId?: string; districtId?: string;
}
export interface SaleView { sale: Sale; customerName: string; customerDocument: string; sellerName: string; branchName: string; receipt?: Receipt; paymentName?: string }
export interface SaleDetails extends SaleView { customer: Customer; seller: Seller; branch: Branch; payment?: PaymentMethod; audit: AuditLog[] }
function createAudit(actorId: string, action: string, target: string, message: string): AuditLog {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), actorId, action, target, result: "success", message, createdAt: now, updatedAt: now, status: "active", demo: true };
}
function defaultSeries(type: Receipt["type"]) { return type === "Boleta" ? "B001" : "F001"; }

export class SalesService {
  async list(role: UserRole): Promise<Sale[]> { assertPermission(role, "sales:read"); return localRepository.list("sales"); }
  async details(role: UserRole, id: string): Promise<SaleDetails> {
    assertPermission(role, "sales:read");
    const sale = await localRepository.get("sales", id);
    if (!sale) throw new Error("No se encontró la venta.");
    const [customer, seller, branch, receipt, methods, people, companies, audits] = await Promise.all([
      localRepository.get("customers", sale.customerId), localRepository.get("sellers", sale.sellerId), localRepository.get("branches", sale.branchId),
      sale.receiptId ? localRepository.get("receipts", sale.receiptId) : Promise.resolve(undefined), localRepository.list("paymentMethods"),
      localRepository.list("persons"), localRepository.list("companies"), localRepository.list("auditLogs"),
    ]);
    if (!customer || !seller || !branch) throw new Error("La venta contiene relaciones que no están disponibles.");
    const person = customer.personId ? people.find(item => item.id === customer.personId) : undefined;
    const company = customer.companyId ? companies.find(item => item.id === customer.companyId) : undefined;
    const customerName = person ? `${person.firstName} ${person.lastName}`.trim() : company?.legalName;
    const customerDocument = person ? `${person.documentType} ${person.documentNumber}` : company ? `RUC ${company.ruc}` : "";
    const payment = methods.find(method => method.id === sale.paymentMethodId);
    return { sale, customer, seller, branch, payment, receipt, customerName: customerName ?? "Cliente no disponible", customerDocument, sellerName: seller.name, branchName: branch.name, paymentName: payment?.name, audit: audits.filter(item => item.target === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  }
  async search(role: UserRole, filters: SaleFilters = {}): Promise<SaleView[]> {
    const [sales, customers, people, companies, sellers, branches, receipts, methods, departments, provinces, districts] = await Promise.all([
      this.list(role), localRepository.list("customers"), localRepository.list("persons"), localRepository.list("companies"), localRepository.list("sellers"), localRepository.list("branches"), localRepository.list("receipts"), localRepository.list("paymentMethods"), localRepository.list("departments"), localRepository.list("provinces"), localRepository.list("districts"),
    ]);
    const personMap = new Map(people.map(person => [person.id, person]));
    const companyMap = new Map(companies.map(company => [company.id, company]));
    const customerMap = new Map(customers.map(customer => [customer.id, customer]));
    const receiptMap = new Map(receipts.map(receipt => [receipt.id, receipt]));
    const sellerMap = new Map(sellers.map(seller => [seller.id, seller]));
    const branchMap = new Map(branches.map(branch => [branch.id, branch]));
    const methodMap = new Map(methods.map(method => [method.id, method]));
    const departmentMap = new Map(departments.map(item => [item.id, item.name]));
    const provinceMap = new Map(provinces.map(item => [item.id, item.name]));
    const districtMap = new Map(districts.map(item => [item.id, item.name]));
    const query = filters.query?.trim().toLocaleLowerCase("es") ?? "";
    return sales.flatMap(sale => {
      const customer = customerMap.get(sale.customerId);
      const person = customer?.personId ? personMap.get(customer.personId) : undefined;
      const company = customer?.companyId ? companyMap.get(customer.companyId) : undefined;
      const seller = sellerMap.get(sale.sellerId); const branch = branchMap.get(sale.branchId);
      const receipt = sale.receiptId ? receiptMap.get(sale.receiptId) : undefined;
      const payment = sale.paymentMethodId ? methodMap.get(sale.paymentMethodId) : undefined;
      const customerName = person ? `${person.firstName} ${person.lastName}`.trim() : company?.legalName ?? "Cliente no disponible";
      const customerDocument = person ? person.documentNumber : company?.ruc ?? "";
      if (!seller || !branch) return [];
      const date = sale.saleDate.slice(0, 10);
      const geo = `${departmentMap.get(sale.departmentId ?? "") ?? ""} ${provinceMap.get(sale.provinceId ?? "") ?? ""} ${districtMap.get(sale.districtId ?? "") ?? ""}`;
      const receiptLabel = receipt ? `${receipt.type} ${receipt.series}-${receipt.number}` : "";
      const text = `${sale.saleNumber} ${customerName} ${customerDocument} ${seller.name} ${branch.name} ${sale.state} ${receiptLabel} ${payment?.name ?? ""} ${geo}`.toLocaleLowerCase("es");
      if (filters.state && filters.state !== "all" && sale.state !== filters.state) return [];
      if (filters.from && date < filters.from || filters.to && date > filters.to) return [];
      if (filters.customerId && sale.customerId !== filters.customerId) return [];
      if (filters.departmentId && sale.departmentId !== filters.departmentId || filters.provinceId && sale.provinceId !== filters.provinceId || filters.districtId && sale.districtId !== filters.districtId) return [];
      if (query && !text.includes(query)) return [];
      return [{ sale, customerName, customerDocument, sellerName: seller.name, branchName: branch.name, receipt, paymentName: payment?.name }];
    }).sort((a, b) => b.sale.saleDate.localeCompare(a.sale.saleDate));
  }
  async saveDraft(role: UserRole, actor: User, input: SaleDraftInput & { id?: string }): Promise<Sale> {
    assertPermission(role, "sales:write");
    const validation = validateSaleDraft(input);
    if (Object.keys(validation).length) throw new Error(Object.values(validation).join(" "));
    const [sales, customers, sellers, branches, products, methods, departments, provinces, districts, receipts, people, companies] = await Promise.all([
      localRepository.list("sales"), localRepository.list("customers"), localRepository.list("sellers"), localRepository.list("branches"), localRepository.list("products"), localRepository.list("paymentMethods"), localRepository.list("departments"), localRepository.list("provinces"), localRepository.list("districts"), localRepository.list("receipts"),
      localRepository.list("persons"), localRepository.list("companies"),
    ]);
    const existing = input.id ? sales.find(item => item.id === input.id) : undefined;
    if (input.id && !existing) throw new Error("No se encontró la venta que deseas modificar.");
    if (existing?.state !== undefined && existing.state !== "draft") throw new Error("Solo se pueden modificar ventas en borrador.");
    const customer = customers.find(item => item.id === input.customerId && item.status === "active");
    if (!customer || (customer.kind === "person" ? !customer.personId || !!customer.companyId : !customer.companyId || !!customer.personId)) throw new Error("Selecciona un cliente activo con una relación válida.");
    if (customer.kind === "person" && !people.some(person => person.id === customer.personId && person.status === "active") || customer.kind === "company" && !companies.some(company => company.id === customer.companyId && company.status === "active")) throw new Error("La entidad vinculada al cliente no está disponible.");
    const seller = sellers.find(item => item.id === input.sellerId && item.status === "active");
    const branch = branches.find(item => item.id === input.branchId && item.status === "active");
    if (!seller) throw new Error("Selecciona un vendedor activo.");
    if (!branch) throw new Error("Selecciona una sucursal activa.");
    if (seller.branchId !== branch.id) throw new Error("La sucursal debe corresponder al vendedor seleccionado.");
    if (input.paymentMethodId && !methods.some(item => item.id === input.paymentMethodId && item.status === "active")) throw new Error("Selecciona un medio de pago activo.");
    this.validateGeography(input, departments, provinces, districts);
    const oldLines = existing?.lines ?? [];
    const lineItems = input.lines.map(line => {
      const product = products.find(item => item.id === line.productId && item.status === "active");
      if (!product) throw new Error("Todos los productos deben estar activos y disponibles en el catálogo.");
      const previousLine = oldLines.find(item => item.productId === product.id);
      return { product, quantity: line.quantity, unitPrice: previousLine?.unitPrice };
    });
    const calculatedLines = calculateSaleLines(lineItems);
    const lines = calculatedLines.map(line => {
      const old = oldLines.find(item => item.productId === line.productId);
      return old ? { ...line, productCode: old.productCode ?? line.productCode, productName: old.productName } : line;
    });
    const total = calculateSaleTotal(lines);
    const now = new Date().toISOString();
    const saleId = existing?.id ?? crypto.randomUUID();
    const oldReceipt = existing?.receiptId ? receipts.find(item => item.id === existing.receiptId) : undefined;
    const receiptType = input.receiptType ?? oldReceipt?.type;
    let receipt: Receipt | null = null;
    if (receiptType) {
      const series = input.receiptType ? (input.receiptType === "Boleta" ? "B001" : "F001") : oldReceipt!.series;
      const receiptError = validateReceiptFields(receiptType, series);
      if (receiptError) throw new Error(receiptError);
      receipt = { id: oldReceipt?.id ?? crypto.randomUUID(), saleId, type: receiptType, series, number: oldReceipt?.number ?? "", state: "draft", createdAt: oldReceipt?.createdAt ?? now, updatedAt: now, status: "active", demo: true };
    }
    const sale: Sale = {
      id: saleId, saleNumber: existing?.saleNumber ?? "", customerId: customer.id, sellerId: seller.id, branchId: branch.id,
      lines, subtotal: total, total, state: "draft", saleDate: new Date(input.saleDate).toISOString(), paymentMethodId: input.paymentMethodId || undefined,
      departmentId: input.departmentId || undefined, provinceId: input.provinceId || undefined, districtId: input.districtId || undefined,
      receiptId: receipt?.id, createdBy: existing?.createdBy ?? actor.id, createdAt: existing?.createdAt ?? now, updatedAt: now, status: "active", demo: true,
    };
    const audit = createAudit(actor.id, existing ? "SALE_DRAFT_UPDATED" : "SALE_DRAFT_CREATED", saleId, existing ? "Se modificó el borrador de venta." : "Se creó el borrador de venta.");
    return (await localRepository.saveSaleAggregate(sale, receipt, audit)).sale;
  }
  async confirm(role: UserRole, actor: User, id: string): Promise<Sale> {
    assertPermission(role, "sales:write");
    const sale = await localRepository.get("sales", id);
    if (!sale || sale.state !== "draft") throw new Error("Solo se pueden confirmar ventas en borrador.");
    if (!sale.paymentMethodId) throw new Error("Selecciona un medio de pago antes de confirmar.");
    const receipt = sale.receiptId ? await localRepository.get("receipts", sale.receiptId) : undefined;
    if (!receipt || receipt.state !== "draft") throw new Error("Agrega un comprobante en borrador antes de confirmar.");
    const [customer, seller, branch, method, products, people, companies, departments, provinces, districts] = await Promise.all([
      localRepository.get("customers", sale.customerId), localRepository.get("sellers", sale.sellerId), localRepository.get("branches", sale.branchId), localRepository.get("paymentMethods", sale.paymentMethodId), localRepository.list("products"), localRepository.list("persons"), localRepository.list("companies"), localRepository.list("departments"), localRepository.list("provinces"), localRepository.list("districts"),
    ]);
    if (!customer || customer.status !== "active" || !seller || seller.status !== "active" || !branch || branch.status !== "active" || seller.branchId !== branch.id || !method || method.status !== "active") throw new Error("La venta contiene una entidad relacionada inactiva o inválida.");
    if (customer.kind === "person" && (!customer.personId || customer.companyId || !people.some(person => person.id === customer.personId && person.status === "active")) || customer.kind === "company" && (!customer.companyId || customer.personId || !companies.some(company => company.id === customer.companyId && company.status === "active"))) throw new Error("El cliente no tiene una relación válida.");
    if (!sale.lines.length || sale.lines.some(line => !products.some(product => product.id === line.productId && product.status === "active"))) throw new Error("La venta debe incluir productos activos.");
    this.validateGeography(sale, departments, provinces, districts);
    const now = new Date().toISOString();
    const confirmedSale = { ...sale, state: "confirmed" as const, updatedAt: now };
    const issuedReceipt = { ...receipt, state: "issued" as const, issuedAt: now, updatedAt: now };
    const audit = createAudit(actor.id, "SALE_CONFIRMED", id, `Venta ${sale.saleNumber} confirmada y comprobante ${receipt.series}-${receipt.number} emitido en el sistema.`);
    return (await localRepository.saveSaleAggregate(confirmedSale, issuedReceipt, audit)).sale;
  }
  async voidSale(role: UserRole, actor: User, id: string): Promise<Sale> {
    assertPermission(role, "sales:write");
    const sale = await localRepository.get("sales", id);
    if (!sale || sale.state !== "confirmed") throw new Error("Solo se pueden anular ventas confirmadas.");
    const receipt = sale.receiptId ? await localRepository.get("receipts", sale.receiptId) : undefined;
    const now = new Date().toISOString();
    const voidedSale = { ...sale, state: "voided" as const, updatedAt: now };
    const voidedReceipt = receipt ? { ...receipt, state: "voided" as const, voidedAt: now, updatedAt: now } : null;
    const audit = createAudit(actor.id, "SALE_VOIDED", id, `Venta ${sale.saleNumber} anulada; el historial se conserva.`);
    return (await localRepository.saveSaleAggregate(voidedSale, voidedReceipt, audit)).sale;
  }
  async deleteDraft(role: UserRole, actor: User, id: string): Promise<void> {
    assertPermission(role, "sales:write");
    const sale = await localRepository.get("sales", id);
    if (!sale || sale.state !== "draft") throw new Error("Solo se pueden eliminar borradores; las ventas confirmadas deben anularse.");
    const audit = createAudit(actor.id, "SALE_DRAFT_DELETED", id, `Borrador ${sale.saleNumber} eliminado antes de la confirmación.`);
    await localRepository.removeDraftSaleAggregate(sale, audit);
  }
  async saveReceiptDraft(role: UserRole, actor: User, saleId: string, type: Receipt["type"], series = defaultSeries(type)): Promise<Receipt> {
    assertPermission(role, "sales:write");
    const sale = await localRepository.get("sales", saleId);
    if (!sale || sale.state !== "draft") throw new Error("Solo se pueden asociar o modificar comprobantes en ventas borrador.");
    const error = validateReceiptFields(type, series);
    if (error) throw new Error(error);
    const existing = sale.receiptId ? await localRepository.get("receipts", sale.receiptId) : undefined;
    if (existing && existing.state !== "draft") throw new Error("El comprobante emitido no se puede modificar.");
    const now = new Date().toISOString();
    const receipt: Receipt = { id: existing?.id ?? crypto.randomUUID(), saleId, type, series: series.toUpperCase(), number: existing?.number ?? "", state: "draft", createdAt: existing?.createdAt ?? now, updatedAt: now, status: "active", demo: true };
    const audit = createAudit(actor.id, existing ? "RECEIPT_DRAFT_UPDATED" : "RECEIPT_DRAFT_CREATED", saleId, existing ? "Se modificó el comprobante borrador." : "Se creó un comprobante borrador.");
    const result = await localRepository.saveSaleAggregate({ ...sale, receiptId: receipt.id, updatedAt: now }, receipt, audit);
    if (!result.receipt) throw new Error("No se pudo guardar el comprobante.");
    return result.receipt;
  }
  async voidReceipt(role: UserRole, actor: User, id: string): Promise<Receipt> {
    assertPermission(role, "sales:write");
    const receipt = await localRepository.get("receipts", id);
    if (!receipt || receipt.state !== "issued") throw new Error("Solo se pueden anular comprobantes emitidos.");
    const sale = await localRepository.get("sales", receipt.saleId);
    if (!sale) throw new Error("No se encontró la venta asociada.");
    const now = new Date().toISOString();
    const voided = { ...receipt, state: "voided" as const, voidedAt: now, updatedAt: now };
    const audit = createAudit(actor.id, "RECEIPT_VOIDED", sale.id, `Comprobante ${receipt.series}-${receipt.number} anulado.`);
    const result = await localRepository.saveSaleAggregate({ ...sale, updatedAt: now }, voided, audit);
    return result.receipt!;
  }
  async deleteReceipt(role: UserRole, actor: User, id: string): Promise<"deleted" | "voided"> {
    assertPermission(role, "sales:write");
    const receipt = await localRepository.get("receipts", id);
    if (!receipt) throw new Error("No se encontró el comprobante.");
    if (receipt.state !== "draft") throw new Error("Un comprobante emitido o anulado no se elimina; conserva su trazabilidad.");
    const sale = await localRepository.get("sales", receipt.saleId);
    if (!sale || sale.state !== "draft") throw new Error("El comprobante solo se elimina mientras la venta está en borrador.");
    const audit = createAudit(actor.id, "RECEIPT_DRAFT_DELETED", sale.id, `Comprobante borrador ${receipt.series}-${receipt.number} eliminado.`);
    await localRepository.removeDraftReceiptAggregate(sale, receipt.id, audit);
    return "deleted";
  }
  async searchReceipts(role: UserRole, query = "", type: "all" | Receipt["type"] = "all", state: "all" | Receipt["state"] = "all"): Promise<Receipt[]> {
    assertPermission(role, "sales:read");
    const term = query.trim().toLocaleLowerCase("es");
    return (await localRepository.list("receipts")).filter(receipt => (type === "all" || receipt.type === type) && (state === "all" || receipt.state === state) && (!term || `${receipt.type} ${receipt.series} ${receipt.number} ${receipt.series}-${receipt.number} ${receipt.saleId}`.toLocaleLowerCase("es").includes(term))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async auditHistory(role: UserRole, saleId: string): Promise<AuditLog[]> {
    assertPermission(role, "sales:read");
    return (await localRepository.list("auditLogs")).filter(entry => entry.target === saleId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  private validateGeography(input: SaleDraftInput, departments: Department[], provinces: Province[], districts: District[]) {
    if ((input.departmentId || input.provinceId || input.districtId) && !(input.departmentId && input.provinceId && input.districtId)) throw new Error("Completa departamento, provincia y distrito para registrar la ubicación de compra.");
    if (!input.departmentId && (input.provinceId || input.districtId)) throw new Error("Selecciona el departamento antes de provincia o distrito.");
    if (input.departmentId && !departments.some(item => item.id === input.departmentId && item.status === "active")) throw new Error("El departamento seleccionado no es válido.");
    if (input.provinceId && !provinces.some(item => item.id === input.provinceId && item.departmentId === input.departmentId && item.status === "active")) throw new Error("La provincia no corresponde al departamento seleccionado.");
    if (input.districtId && !districts.some(item => item.id === input.districtId && item.provinceId === input.provinceId && item.status === "active")) throw new Error("El distrito no corresponde a la provincia seleccionada.");
    if (input.districtId && !input.provinceId || input.provinceId && !input.departmentId) throw new Error("Completa departamento, provincia y distrito en orden.");
  }
}
export const salesService = new SalesService();
