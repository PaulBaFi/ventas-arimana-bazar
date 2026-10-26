import type { SaleLine } from "./models";
import type { UserRole } from "./models";

export type ValidationErrors<T extends string = string> = Partial<Record<T, string>>;
export const required = (value: unknown, label: string): string | undefined => String(value ?? "").trim() ? undefined : `${label} es obligatorio.`;
export const validEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validDocument = (type: "DNI" | "RUC" | "CE", value: string): boolean => {
  const digits = value.replace(/\D/g, "");
  return type === "DNI" ? /^\d{8}$/.test(digits) : type === "RUC" ? /^\d{11}$/.test(digits) : /^[A-Za-z0-9]{8,12}$/.test(value.trim());
};
export interface CustomerInput {
  kind: "person" | "company"; documentType: "DNI" | "RUC" | "CE"; documentNumber: string;
  firstName?: string; lastName?: string; legalName?: string; tradeName?: string; email?: string; phone?: string;
}
export function validateCustomer(input: CustomerInput): ValidationErrors<"firstName" | "lastName" | "legalName" | "documentNumber" | "kind" | "email"> {
  const errors: ValidationErrors<"firstName" | "lastName" | "legalName" | "documentNumber" | "kind" | "email"> = {};
  if (input.kind === "person") {
    if (required(input.firstName, "Nombre")) errors.firstName = "El nombre es obligatorio.";
    if (required(input.lastName, "Apellido")) errors.lastName = "El apellido es obligatorio.";
    if (input.documentType === "RUC") errors.kind = "Una persona natural debe usar DNI o CE.";
  } else {
    if (required(input.legalName, "Razón social")) errors.legalName = "La razón social es obligatoria.";
    if (input.documentType !== "RUC") errors.kind = "Las empresas deben registrarse con RUC.";
  }
  if (!validDocument(input.documentType, input.documentNumber)) errors.documentNumber = "El documento no tiene un formato válido.";
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

export interface UserInput { username: string; displayName: string; role: UserRole; email?: string }
export function validateUser(input: UserInput): ValidationErrors<"username" | "displayName" | "role" | "email"> {
  const errors: ValidationErrors<"username" | "displayName" | "role" | "email"> = {};
  if (required(input.username, "Usuario")) errors.username = "El usuario es obligatorio.";
  else if (!/^[a-zA-Z0-9._-]{3,32}$/.test(input.username)) errors.username = "Usa entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.";
  if (required(input.displayName, "Nombre")) errors.displayName = "El nombre es obligatorio.";
  if (!input.role) errors.role = "Selecciona un rol.";
  if (input.email && !validEmail(input.email)) errors.email = "Ingresa un correo válido.";
  return errors;
}

export interface BranchInput { code: string; name: string; address?: string; phone?: string }
export interface SellerInput {
  documentType: "DNI" | "CE"; documentNumber: string; name: string; branchId: string;
  email?: string; phone?: string; userId?: string;
}
export function validateBranch(input: BranchInput): ValidationErrors<"code" | "name"> {
  const errors: ValidationErrors<"code" | "name"> = {};
  if (required(input.code, "Código")) errors.code = "El código de sucursal es obligatorio.";
  if (required(input.name, "Nombre")) errors.name = "El nombre de sucursal es obligatorio.";
  return errors;
}
export function validateSeller(input: SellerInput): ValidationErrors<"documentNumber" | "name" | "branchId" | "email"> {
  const errors: ValidationErrors<"documentNumber" | "name" | "branchId" | "email"> = {};
  if (!validDocument(input.documentType, input.documentNumber)) errors.documentNumber = "El documento no tiene un formato válido.";
  if (required(input.name, "Nombre")) errors.name = "El nombre del vendedor es obligatorio.";
  if (required(input.branchId, "Sucursal")) errors.branchId = "Selecciona una sucursal.";
  if (input.email && !validEmail(input.email)) errors.email = "Ingresa un correo válido.";
  return errors;
}
