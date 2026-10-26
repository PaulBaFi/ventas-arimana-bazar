import { beforeEach, describe, expect, it } from "vitest";
import type { Sale } from "@/domain/models";
import { validateBranch, validateSeller } from "@/domain/validation";
import { localRepository } from "@/persistence/database";
import { organizationService } from "./organizationService";

async function resetDb() {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase("arimana-bazar-demo"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

describe("validación de sucursales y vendedores", () => {
  it("valida campos obligatorios, DNI/CE y correo", () => {
    expect(validateBranch({ code: "", name: "" })).toMatchObject({ code: expect.any(String), name: expect.any(String) });
    expect(validateSeller({ documentType: "DNI", documentNumber: "123", name: "", branchId: "", email: "correo" })).toMatchObject({ documentNumber: expect.any(String), name: expect.any(String), branchId: expect.any(String), email: expect.any(String) });
    expect(validateSeller({ documentType: "CE", documentNumber: "ABC12345", name: "Vendedor", branchId: "branch-1", email: "vendedor@example.test" })).toEqual({});
  });
});

describe("mantenimiento organizacional", () => {
  beforeEach(resetDb);
  it("realiza CRUD y búsqueda de sucursales y vendedores relacionados", async () => {
    await localRepository.seedDemoData();
    const branch = await organizationService.saveBranch("Administrador", { code: "SUC-NEW", name: "Sucursal Nueva", address: "Calle Central 20" });
    expect((await organizationService.searchBranches("Vendedor", "Nueva"))[0].id).toBe(branch.id);
    expect((await organizationService.getBranch("Administrador", branch.id)).name).toBe("Sucursal Nueva");
    const seller = await organizationService.saveSeller("Administrador", { documentType: "DNI", documentNumber: "87654321", name: "Vendedor Nuevo", branchId: branch.id });
    expect(seller.branchId).toBe(branch.id);
    expect((await organizationService.searchSellers("Vendedor", "SUC-NEW"))[0].id).toBe(seller.id);
    const updated = await organizationService.saveSeller("Administrador", { id: seller.id, documentType: "DNI", documentNumber: "87654321", name: "Vendedor Actualizado", branchId: branch.id });
    expect(updated.name).toBe("Vendedor Actualizado");
    expect(await organizationService.deleteSeller("Administrador", seller.id)).toBe("deleted");
    expect(await organizationService.deleteBranch("Administrador", branch.id)).toBe("deleted");
  });
  it("rechaza códigos y documentos duplicados e impide asignar vendedor a sucursal inactiva", async () => {
    await localRepository.seedDemoData();
    await expect(organizationService.saveBranch("Administrador", { code: "suc-001", name: "Duplicada" })).rejects.toThrow(/código/);
    await expect(organizationService.saveSeller("Administrador", { documentType: "DNI", documentNumber: "00000002", name: "Duplicado", branchId: "branch-1" })).rejects.toThrow(/documento/);
    await organizationService.deleteBranch("Administrador", "branch-1");
    await expect(organizationService.saveSeller("Administrador", { documentType: "DNI", documentNumber: "33334444", name: "Sin sucursal", branchId: "branch-1" })).rejects.toThrow(/inactiva/);
  });
  it("mantiene ventas y desactiva vendedores al dar de baja una sucursal relacionada", async () => {
    await localRepository.seedDemoData();
    const sale: Sale = { id: "organization-sale", saleNumber: "ORG-1", customerId: "customer-1", sellerId: "seller-1", branchId: "branch-1", lines: [], subtotal: 30, total: 30, state: "confirmed", saleDate: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "active", demo: true };
    await localRepository.put("sales", sale);
    expect(await organizationService.deleteBranch("Administrador", "branch-1")).toBe("deactivated");
    expect((await localRepository.get("branches", "branch-1"))?.status).toBe("inactive");
    expect((await localRepository.get("sellers", "seller-1"))?.status).toBe("inactive");
    expect((await localRepository.get("sales", sale.id))?.branchId).toBe("branch-1");
  });
  it("desactiva vendedores con ventas y protege la administración según permisos", async () => {
    await localRepository.seedDemoData();
    const seller = await localRepository.get("sellers", "seller-1");
    expect(seller).toBeDefined();
    await localRepository.put("sales", { id: "seller-sale", saleNumber: "SEL-1", customerId: "customer-1", sellerId: "seller-1", branchId: "branch-1", lines: [], subtotal: 15, total: 15, state: "confirmed", saleDate: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "active", demo: true });
    expect(await organizationService.deleteSeller("Administrador", "seller-1")).toBe("deactivated");
    expect((await localRepository.get("sellers", "seller-1"))?.status).toBe("inactive");
    expect(await organizationService.listBranches("Cajero")).toHaveLength(1);
    await expect(organizationService.saveBranch("Vendedor", { code: "NO", name: "Sin permiso" })).rejects.toThrow(/permiso/);
    await expect(organizationService.listSellers("Analista")).rejects.toThrow(/permiso/);
  });
});
