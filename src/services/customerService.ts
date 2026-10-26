import type { Company, Customer, Person, Sale, UserRole } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { validateCustomer, type CustomerInput } from "@/domain/validation";
import { localRepository } from "@/persistence/database";

export interface CustomerRecord extends Customer {
  displayName: string; documentType: "DNI" | "CE" | "RUC"; documentNumber: string;
  email?: string; phone?: string; firstName?: string; lastName?: string; legalName?: string; tradeName?: string;
}
export class CustomerService {
  async list(role: UserRole): Promise<CustomerRecord[]> {
    assertPermission(role, "customers:read");
    const [customers, persons, companies] = await Promise.all([localRepository.list("customers"), localRepository.list("persons"), localRepository.list("companies")]);
    const personMap = new Map(persons.map(person => [person.id, person]));
    const companyMap = new Map(companies.map(company => [company.id, company]));
    return customers.map(customer => {
      const person = customer.kind === "person" && customer.personId ? personMap.get(customer.personId) : undefined;
      const company = customer.kind === "company" && customer.companyId ? companyMap.get(customer.companyId) : undefined;
      if (customer.kind === "person" && (!person || customer.companyId) || customer.kind === "company" && (!company || customer.personId)) throw new Error(`El cliente ${customer.id} tiene una relación Persona/Empresa inválida.`);
      return person ? { ...customer, displayName: `${person.firstName} ${person.lastName}`.trim(), firstName: person.firstName, lastName: person.lastName, documentType: person.documentType, documentNumber: person.documentNumber, email: person.email, phone: person.phone }
        : { ...customer, displayName: company!.legalName, legalName: company!.legalName, tradeName: company!.tradeName, documentType: "RUC" as const, documentNumber: company!.ruc, email: company!.email, phone: company!.phone };
    });
  }
  async get(role: UserRole, id: string): Promise<CustomerRecord> {
    const item = (await this.list(role)).find(customer => customer.id === id);
    if (!item) throw new Error("No se encontró el cliente.");
    return item;
  }
  async save(role: UserRole, input: CustomerInput & { id?: string }): Promise<CustomerRecord> {
    assertPermission(role, "customers:write");
    const errors = validateCustomer(input);
    if (Object.keys(errors).length) throw new Error(Object.values(errors).filter(Boolean).join(" "));
    const [customers, persons, companies] = await Promise.all([localRepository.list("customers"), localRepository.list("persons"), localRepository.list("companies")]);
    const existing = input.id ? customers.find(customer => customer.id === input.id) : undefined;
    if (input.id && !existing) throw new Error("No se encontró el cliente que deseas modificar.");
    if (existing && existing.kind !== input.kind) throw new Error("El tipo de cliente no se puede cambiar; registra el tipo correcto en un nuevo cliente.");
    const doc = input.documentNumber.trim().toLocaleUpperCase("es");
    const duplicatePerson = input.kind === "person" && persons.some(person => person.documentType === input.documentType && person.documentNumber.toLocaleUpperCase("es") === doc && person.id !== existing?.personId);
    const duplicateCompany = input.kind === "company" && companies.some(company => company.ruc === doc && company.id !== existing?.companyId);
    if (duplicatePerson || duplicateCompany) throw new Error("Ya existe un cliente con ese documento.");
    const now = new Date().toISOString();
    const customerId = existing?.id ?? crypto.randomUUID();
    let related: Person | Company;
    let customer: Customer;
    if (input.kind === "person") {
      const personId = existing?.personId ?? crypto.randomUUID();
      const old = existing?.personId ? persons.find(item => item.id === existing.personId) : undefined;
      related = { id: personId, createdAt: old?.createdAt ?? now, updatedAt: now, status: "active", demo: true, documentType: input.documentType as Person["documentType"], documentNumber: doc, firstName: input.firstName!.trim(), lastName: input.lastName!.trim(), email: input.email?.trim() || undefined, phone: input.phone?.trim() || undefined };
      customer = { id: customerId, kind: "person", personId, createdAt: existing?.createdAt ?? now, updatedAt: now, status: existing?.status ?? "active", demo: true };
    } else {
      const companyId = existing?.companyId ?? crypto.randomUUID();
      const old = existing?.companyId ? companies.find(item => item.id === existing.companyId) : undefined;
      related = { id: companyId, createdAt: old?.createdAt ?? now, updatedAt: now, status: "active", demo: true, ruc: doc, legalName: input.legalName!.trim(), tradeName: input.tradeName?.trim() || undefined, email: input.email?.trim() || undefined, phone: input.phone?.trim() || undefined };
      customer = { id: customerId, kind: "company", companyId, createdAt: existing?.createdAt ?? now, updatedAt: now, status: existing?.status ?? "active", demo: true };
    }
    await localRepository.saveCustomerAggregate(customer, related);
    return this.get(role, customerId);
  }
  async delete(role: UserRole, id: string): Promise<"deleted" | "deactivated"> {
    assertPermission(role, "customers:write");
    const customer = await localRepository.get("customers", id);
    if (!customer) throw new Error("No se encontró el cliente.");
    const sales = await localRepository.list("sales");
    if (sales.some((sale: Sale) => sale.customerId === id)) {
      await localRepository.put("customers", { ...customer, status: "inactive", updatedAt: new Date().toISOString() });
      return "deactivated";
    }
    await localRepository.removeCustomerAggregate(customer);
    return "deleted";
  }
  async search(role: UserRole, query: string, status: "all" | "active" | "inactive" = "all"): Promise<CustomerRecord[]> {
    const term = query.trim().toLocaleLowerCase("es");
    return (await this.list(role)).filter(customer => (status === "all" || customer.status === status) && (!term || [customer.displayName, customer.documentNumber, customer.documentType, customer.email ?? "", customer.id].some(value => value.toLocaleLowerCase("es").includes(term))));
  }
  async salesHistory(role: UserRole, customerId: string): Promise<Sale[]> {
    assertPermission(role, "customers:read");
    return (await localRepository.list("sales")).filter(sale => sale.customerId === customerId);
  }
}
export const customerService = new CustomerService();
