import { describe, expect, it } from "vitest";
import { assertPermission, hasPermission } from "./permissions";
import { validateCustomer, validateSaleLines } from "./validation";

describe("permisos", () => {
  it("reserva la administración ETL exclusivamente al administrador", () => {
    expect(hasPermission("Administrador", "etl:admin")).toBe(true);
    for (const role of ["Vendedor", "Cajero", "Gerencia", "Analista"] as const) {
      expect(hasPermission(role, "etl:admin")).toBe(false);
      expect(() => assertPermission(role, "etl:admin")).toThrow(/permiso/);
    }
    expect(() => assertPermission(undefined, "etl:admin")).toThrow(/permiso/);
  });
});

describe("validaciones", () => {
  it("valida formato de documento por tipo y reglas de empresa", () => {
    expect(validateCustomer({ kind: "person", documentType: "DNI", documentNumber: "12345678", name: "Persona" })).toEqual({});
    expect(validateCustomer({ kind: "person", documentType: "DNI", documentNumber: "123", name: "Persona" }).documentNumber).toBeTruthy();
    expect(validateCustomer({ kind: "company", documentType: "DNI", documentNumber: "12345678", name: "Empresa" }).kind).toBeTruthy();
    expect(validateCustomer({ kind: "company", documentType: "RUC", documentNumber: "20123456789", name: "Empresa" })).toEqual({});
  });
  it("valida obligatorios, correo y formato de detalle de venta", () => {
    expect(validateCustomer({ kind: "person", documentType: "CE", documentNumber: "ABC12345", name: "", email: "no-es-correo" })).toMatchObject({ name: expect.any(String), email: expect.any(String) });
    expect(validateCustomer({ kind: "person", documentType: "CE", documentNumber: "ABC12345", name: "Cliente", email: "a@b.test" })).toEqual({});
    expect(validateSaleLines([{ id: "1", productId: "", productName: "", quantity: 0, unitPrice: -1, subtotal: 0 }])).toHaveLength(3);
    expect(validateSaleLines([{ id: "1", productId: "p1", productName: "Demo", quantity: 1, unitPrice: 0, subtotal: 0 }])).toEqual([]);
  });
});
