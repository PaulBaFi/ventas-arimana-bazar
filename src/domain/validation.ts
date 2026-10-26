import type { Customer, SaleLine } from "./models";

export type ValidationErrors<T extends string = string> = Partial<Record<T, string>>;
export const required = (value: unknown, label: string): string | undefined => String(value ?? "").trim() ? undefined : `${label} es obligatorio.`;
export const validEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validDocument = (type: Customer["documentType"], value: string): boolean => {
  const digits = value.replace(/\D/g, "");
  return type === "DNI" ? /^\d{8}$/.test(digits) : type === "RUC" ? /^\d{11}$/.test(digits) : /^[A-Za-z0-9]{8,12}$/.test(value.trim());
};
export function validateCustomer(input: Pick<Customer, "kind" | "documentType" | "documentNumber" | "name" | "email">): ValidationErrors<"name" | "documentNumber" | "kind" | "email"> {
  const errors: ValidationErrors<"name" | "documentNumber" | "kind" | "email"> = {};
  if (required(input.name, input.kind === "company" ? "Razón social" : "Nombre")) errors.name = "Este campo es obligatorio.";
  if (!validDocument(input.documentType, input.documentNumber)) errors.documentNumber = "El documento no tiene un formato válido.";
  if (input.kind === "company" && input.documentType !== "RUC") errors.kind = "Las empresas deben registrarse con RUC.";
  if (input.email && !validEmail(input.email)) errors.email = "Ingresa un correo válido.";
  return errors;
}
export function validateSaleLines(lines: SaleLine[]): string[] {
  return lines.flatMap((line, i) => [
    ...(line.productId ? [] : [`Línea ${i + 1}: selecciona un producto.`]),
    ...(Number.isInteger(line.quantity) && line.quantity > 0 ? [] : [`Línea ${i + 1}: cantidad debe ser un entero mayor a cero.`]),
    ...(Number.isFinite(line.unitPrice) && line.unitPrice >= 0 ? [] : [`Línea ${i + 1}: precio inválido.`]),
  ]);
}
