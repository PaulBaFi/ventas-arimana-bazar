import { beforeEach, describe, expect, it } from "vitest";
import type { AuditLog, Receipt, Sale } from "@/domain/models";
import { calculateSaleLines, calculateSaleTotal, roundCurrency } from "@/domain/sales";
import { validateReceiptFields, validateSaleDraft } from "@/domain/validation";
import { localRepository } from "@/persistence/database";
import { paymentMethodService } from "./paymentMethodService";
import { salesService } from "./salesService";

async function resetDb() {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase("arimana-bazar-demo"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}
const draftInput = (extra: Record<string, unknown> = {}) => ({ customerId: "customer-1", sellerId: "seller-1", branchId: "branch-1", saleDate: "2026-02-10T10:30", lines: [{ productId: "product-1", quantity: 2 }], ...extra });

describe("cálculos y validaciones transaccionales", () => {
  it("calcula subtotales y total con redondeo monetario", async () => {
    await resetDb(); await localRepository.seedDemoData();
    const product = (await localRepository.get("products", "product-1"))!;
    const lines = calculateSaleLines([{ product, quantity: 3, unitPrice: 2.335 }]);
    expect(roundCurrency(2.335)).toBe(2.34);
    expect(lines[0].subtotal).toBe(7.01);
    expect(calculateSaleTotal(lines)).toBe(7.01);
  });
  it("rechaza ventas incompletas y series no correspondientes al tipo de comprobante", () => {
    expect(validateSaleDraft({ ...draftInput(), customerId: "", lines: [] })).toMatchObject({ customerId: expect.any(String), lines: expect.any(String) });
    expect(validateSaleDraft(draftInput())).toEqual({});
    expect(validateReceiptFields("Boleta", "F001")).toMatch(/debe iniciar/);
    expect(validateReceiptFields("Factura", "F001")).toBeUndefined();
  });
});

describe("ventas, comprobantes y persistencia atómica", () => {
  beforeEach(async () => { await resetDb(); await localRepository.seedDemoData(); });
  it("guarda borrador, líneas, comprobante y auditoría atómicamente, preservando precio del catálogo", async () => {
    const actor = (await localRepository.get("users", "user-seller"))!;
    const sale = await salesService.saveDraft("Vendedor", actor, { ...draftInput(), receiptType: "Boleta" });
    expect(sale.saleNumber).toBe("V-000251"); expect(sale.total).toBe(78); expect(sale.lines).toHaveLength(1);
    const receipt = await localRepository.get("receipts", sale.receiptId!);
    expect(receipt).toMatchObject({ saleId: sale.id, type: "Boleta", series: "B001", number: "", state: "draft" });
    expect((await localRepository.list("auditLogs")).some(log => log.target === sale.id && log.action === "SALE_DRAFT_CREATED")).toBe(true);
    await localRepository.put("products", { ...(await localRepository.get("products", "product-1"))!, unitPrice: 99, name: "Artículo renombrado" });
    const edited = await salesService.saveDraft("Vendedor", actor, { ...draftInput(), id: sale.id, receiptType: "Boleta" });
    expect(edited.lines[0].unitPrice).toBe(39); expect(edited.lines[0].productName).toBe("Polera urbana"); expect(edited.total).toBe(78);
    expect((await localRepository.get("receipts", sale.receiptId!))?.number).toBe("");
  });
  it("revierte cabecera, comprobante y auditoría juntos si falla una escritura de la transacción", async () => {
    const now = new Date().toISOString();
    const saleId = "atomic-rollback-sale";
    const sale: Sale = { id: saleId, saleNumber: "", customerId: "customer-1", sellerId: "seller-1", branchId: "branch-1", lines: [], subtotal: 0, total: 0, state: "draft", saleDate: now, createdAt: now, updatedAt: now, status: "active", demo: true };
    const receipt: Receipt = { id: "atomic-rollback-receipt", saleId, type: "Boleta", series: "B001", number: "", state: "draft", createdAt: now, updatedAt: now, status: "active", demo: true };
    const invalidAudit = { actorId: "user-seller", action: "TEST", target: saleId, result: "success", message: "Falla intencional", createdAt: now, updatedAt: now, status: "active", demo: true } as unknown as AuditLog;
    await expect(localRepository.saveSaleAggregate(sale, receipt, invalidAudit)).rejects.toThrow();
    expect(await localRepository.get("sales", saleId)).toBeUndefined();
    expect(await localRepository.get("receipts", receipt.id)).toBeUndefined();
    expect((await localRepository.list("auditLogs")).some(item => item.target === saleId)).toBe(false);
  });
  it("valida cliente, asignación vendedor-sucursal, producto activo y ubicación dependiente", async () => {
    const actor = (await localRepository.get("users", "user-seller"))!;
    await expect(salesService.saveDraft("Vendedor", actor, { ...draftInput(), customerId: "missing" })).rejects.toThrow(/cliente activo/);
    await expect(salesService.saveDraft("Vendedor", actor, { ...draftInput(), branchId: "missing" })).rejects.toThrow(/sucursal activa/);
    await expect(salesService.saveDraft("Vendedor", actor, { ...draftInput(), lines: [{ productId: "missing", quantity: 1 }] })).rejects.toThrow(/productos deben estar activos/);
    await expect(salesService.saveDraft("Vendedor", actor, { ...draftInput(), departmentId: "department-lima" })).rejects.toThrow(/Completa departamento/);
    await expect(salesService.saveDraft("Vendedor", actor, { ...draftInput(), departmentId: "department-lima", provinceId: "province-lima", districtId: "district-miraflores" })).resolves.toMatchObject({ districtId: "district-miraflores" });
  });
  it("requiere medio de pago y comprobante antes de confirmar; emite estados y números consistentes", async () => {
    const actor = (await localRepository.get("users", "user-seller"))!;
    const sale = await salesService.saveDraft("Vendedor", actor, draftInput());
    await expect(salesService.confirm("Vendedor", actor, sale.id)).rejects.toThrow(/medio de pago/);
    const withReceipt = await salesService.saveReceiptDraft("Vendedor", actor, sale.id, "Factura");
    expect(withReceipt.series).toBe("F001");
    const edited = await salesService.saveDraft("Vendedor", actor, { ...draftInput(), id: sale.id, paymentMethodId: "payment-cash" });
    const confirmed = await salesService.confirm("Vendedor", actor, edited.id);
    expect(confirmed.state).toBe("confirmed");
    expect(await localRepository.get("receipts", withReceipt.id)).toMatchObject({ state: "issued" });
    expect(Number((await localRepository.get("receipts", withReceipt.id))?.number)).toBeGreaterThan(0);
    await expect(salesService.saveDraft("Vendedor", actor, { ...draftInput(), id: sale.id })).rejects.toThrow(/borrador/);
    await expect(salesService.confirm("Vendedor", actor, sale.id)).rejects.toThrow(/borrador/);
    const details = await salesService.details("Vendedor", sale.id);
    expect(details.audit.map(item => item.action)).toContain("SALE_CONFIRMED");
  });
  it("anula venta confirmada y comprobante sin eliminar relaciones ni historial", async () => {
    const actor = (await localRepository.get("users", "user-seller"))!;
    const sale = await salesService.saveDraft("Vendedor", actor, { ...draftInput(), paymentMethodId: "payment-cash", receiptType: "Boleta" });
    await salesService.confirm("Vendedor", actor, sale.id);
    const voided = await salesService.voidSale("Vendedor", actor, sale.id);
    expect(voided.state).toBe("voided");
    expect((await localRepository.get("receipts", sale.receiptId!))?.state).toBe("voided");
    expect((await localRepository.get("sales", sale.id))?.customerId).toBe("customer-1");
    expect((await salesService.auditHistory("Vendedor", sale.id)).map(log => log.action)).toEqual(expect.arrayContaining(["SALE_CONFIRMED", "SALE_VOIDED"]));
  });
  it("filtra ventas por cliente, fecha, comprobante, estado y ubicación", async () => {
    const actor = (await localRepository.get("users", "user-seller"))!;
    const sale = await salesService.saveDraft("Vendedor", actor, { ...draftInput(), paymentMethodId: "payment-cash", receiptType: "Boleta", departmentId: "department-lima", provinceId: "province-lima", districtId: "district-miraflores" });
    await salesService.confirm("Vendedor", actor, sale.id);
    const issued = await localRepository.get("receipts", sale.receiptId!);
    const rows = await salesService.search("Vendedor", { query: `${issued!.series}-${issued!.number}`, state: "confirmed", from: "2026-02-10", to: "2026-02-10", departmentId: "department-lima", provinceId: "province-lima", districtId: "district-miraflores" });
    expect(rows).toHaveLength(1); expect(rows[0].sale.customerId).toBe("customer-1");
    expect(await salesService.search("Vendedor", { customerId: "customer-person-999" })).toHaveLength(0);
  });
  it("edita o elimina comprobantes borrador; anula emitidos y conserva la numeración", async () => {
    const actor = (await localRepository.get("users", "user-seller"))!;
    const sale = await salesService.saveDraft("Vendedor", actor, draftInput());
    const first = await salesService.saveReceiptDraft("Vendedor", actor, sale.id, "Boleta");
    const updated = await salesService.saveReceiptDraft("Vendedor", actor, sale.id, "Factura");
    expect(updated.number).toBe(""); expect(updated.series).toBe("F001");
    expect(await salesService.searchReceipts("Vendedor", "F001", "Factura", "draft")).toHaveLength(1);
    expect(await salesService.deleteReceipt("Vendedor", actor, updated.id)).toBe("deleted");
    expect((await localRepository.get("sales", sale.id))?.receiptId).toBeUndefined();
    const another = await salesService.saveDraft("Vendedor", actor, { ...draftInput(), paymentMethodId: "payment-cash", receiptType: "Factura" });
    await salesService.confirm("Vendedor", actor, another.id);
    const issued = await localRepository.get("receipts", another.receiptId!);
    await expect(salesService.saveReceiptDraft("Vendedor", actor, another.id, "Boleta")).rejects.toThrow(/borrador/);
    const voided = await salesService.voidReceipt("Vendedor", actor, issued!.id);
    expect(voided.state).toBe("voided"); expect(Number(voided.number)).toBeGreaterThan(0);
    expect(first.state).toBe("draft");
  });
  it("elimina borradores con auditoría y aplica permisos de consulta y escritura", async () => {
    const actor = (await localRepository.get("users", "user-seller"))!;
    const sale = await salesService.saveDraft("Vendedor", actor, draftInput());
    await salesService.deleteDraft("Vendedor", actor, sale.id);
    expect(await localRepository.get("sales", sale.id)).toBeUndefined();
    expect((await salesService.auditHistory("Vendedor", sale.id)).map(log => log.action)).toContain("SALE_DRAFT_DELETED");
    await expect(salesService.list("Analista")).rejects.toThrow(/permiso/);
    await expect(salesService.saveDraft("Analista", (await localRepository.get("users", "user-analyst"))!, draftInput())).rejects.toThrow(/permiso/);
  });
});

describe("medios de pago", () => {
  beforeEach(async () => { await resetDb(); await localRepository.seedDemoData(); });
  it("realiza CRUD, búsqueda y baja lógica con operaciones históricas", async () => {
    const method = await paymentMethodService.save("Administrador", { name: "Transferencia", description: "Transferencia bancaria" });
    expect((await paymentMethodService.search("Cajero", "transferencia"))[0].id).toBe(method.id);
    const edited = await paymentMethodService.save("Administrador", { id: method.id, name: "Transferencia bancaria" });
    expect(edited.name).toBe("Transferencia bancaria");
    const actor = (await localRepository.get("users", "user-seller"))!;
    const sale = await salesService.saveDraft("Vendedor", actor, { ...draftInput(), paymentMethodId: method.id });
    expect(await paymentMethodService.delete("Administrador", method.id)).toBe("deactivated");
    expect((await localRepository.get("paymentMethods", method.id))?.status).toBe("inactive");
    expect((await localRepository.get("sales", sale.id))?.paymentMethodId).toBe(method.id);
    await expect(paymentMethodService.save("Administrador", { name: "efectivo" })).rejects.toThrow(/Ya existe/);
    await expect(paymentMethodService.save("Vendedor", { name: "Cheque" })).rejects.toThrow(/permiso/);
    await expect(paymentMethodService.save("Administrador", { name: "   " })).rejects.toThrow(/obligatorio/);
  });
});
