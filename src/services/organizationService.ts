import type { Branch, Seller, User, UserRole } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { validateBranch, validateSeller, type BranchInput, type SellerInput } from "@/domain/validation";
import { localRepository } from "@/persistence/database";

type StatusFilter = "all" | "active" | "inactive";
function throwValidation(errors: Record<string, string | undefined>) {
  const messages = Object.values(errors).filter((value): value is string => !!value);
  if (messages.length) throw new Error(messages.join(" "));
}
export class OrganizationService {
  async listBranches(role: UserRole): Promise<Branch[]> { assertPermission(role, "organization:read"); return localRepository.list("branches"); }
  async getBranch(role: UserRole, id: string): Promise<Branch> {
    assertPermission(role, "organization:read");
    const branch = await localRepository.get("branches", id);
    if (!branch) throw new Error("No se encontró la sucursal.");
    return branch;
  }
  async saveBranch(role: UserRole, input: BranchInput & { id?: string }): Promise<Branch> {
    assertPermission(role, "organization:write"); throwValidation(validateBranch(input));
    const branches = await localRepository.list("branches");
    const previous = input.id ? branches.find(item => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error("No se encontró la sucursal que deseas modificar.");
    if (previous?.status === "inactive") throw new Error("No se puede modificar una sucursal inactiva.");
    const code = input.code.trim().toLocaleUpperCase("es");
    if (branches.some(item => item.code.trim().toLocaleUpperCase("es") === code && item.id !== input.id)) throw new Error("Ya existe una sucursal con ese código.");
    const now = new Date().toISOString();
    return localRepository.put("branches", { id: input.id ?? crypto.randomUUID(), code, name: input.name.trim(), address: input.address?.trim() || undefined, phone: input.phone?.trim() || undefined, createdAt: previous?.createdAt ?? now, updatedAt: now, status: "active", demo: true });
  }
  async deleteBranch(role: UserRole, id: string): Promise<"deleted" | "deactivated"> {
    assertPermission(role, "organization:write");
    const branch = await localRepository.get("branches", id);
    if (!branch) throw new Error("No se encontró la sucursal.");
    const [sellers, sales] = await Promise.all([localRepository.list("sellers"), localRepository.list("sales")]);
    const hasSellers = sellers.some(seller => seller.branchId === id);
    const hasSales = sales.some(sale => sale.branchId === id);
    if (hasSellers || hasSales) {
      await localRepository.deactivateBranchWithSellers(id);
      return "deactivated";
    }
    await localRepository.remove("branches", id);
    return "deleted";
  }
  async searchBranches(role: UserRole, query: string, status: StatusFilter = "all"): Promise<Branch[]> {
    const term = query.trim().toLocaleLowerCase("es");
    return (await this.listBranches(role)).filter(branch => (status === "all" || branch.status === status) && (!term || `${branch.code} ${branch.name} ${branch.address ?? ""} ${branch.phone ?? ""}`.toLocaleLowerCase("es").includes(term)));
  }

  async listSellers(role: UserRole): Promise<Seller[]> { assertPermission(role, "organization:read"); return localRepository.list("sellers"); }
  async getSeller(role: UserRole, id: string): Promise<Seller> {
    assertPermission(role, "organization:read");
    const seller = await localRepository.get("sellers", id);
    if (!seller) throw new Error("No se encontró el vendedor.");
    return seller;
  }
  async saveSeller(role: UserRole, input: SellerInput & { id?: string }): Promise<Seller> {
    assertPermission(role, "organization:write"); throwValidation(validateSeller(input));
    const [sellers, branches, users] = await Promise.all([localRepository.list("sellers"), localRepository.list("branches"), localRepository.list("users")]);
    const previous = input.id ? sellers.find(item => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error("No se encontró el vendedor que deseas modificar.");
    if (previous?.status === "inactive") throw new Error("No se puede modificar un vendedor inactivo.");
    const branch = branches.find(item => item.id === input.branchId && item.status === "active");
    if (!branch) throw new Error("La sucursal seleccionada no existe o está inactiva.");
    const document = input.documentNumber.trim().toLocaleUpperCase("es");
    if (sellers.some(item => item.documentType === input.documentType && item.documentNumber.trim().toLocaleUpperCase("es") === document && item.id !== input.id)) throw new Error("Ya existe un vendedor con ese documento.");
    const userId = input.userId?.trim() || undefined;
    if (userId) {
      const user: User | undefined = users.find(item => item.id === userId);
      if (!user || user.status !== "active" || user.role !== "Vendedor") throw new Error("La cuenta asociada debe estar activa y tener el rol Vendedor.");
      if (sellers.some(item => item.userId === userId && item.id !== input.id)) throw new Error("La cuenta ya está asignada a otro vendedor.");
    }
    const now = new Date().toISOString();
    return localRepository.put("sellers", { id: input.id ?? crypto.randomUUID(), documentType: input.documentType, documentNumber: document, name: input.name.trim(), branchId: branch.id, email: input.email?.trim() || undefined, phone: input.phone?.trim() || undefined, userId, createdAt: previous?.createdAt ?? now, updatedAt: now, status: "active", demo: true });
  }
  async deleteSeller(role: UserRole, id: string): Promise<"deleted" | "deactivated"> {
    assertPermission(role, "organization:write");
    const seller = await localRepository.get("sellers", id);
    if (!seller) throw new Error("No se encontró el vendedor.");
    const sales = await localRepository.list("sales");
    if (seller.userId || sales.some(sale => sale.sellerId === id)) {
      await localRepository.put("sellers", { ...seller, status: "inactive", updatedAt: new Date().toISOString() });
      return "deactivated";
    }
    await localRepository.remove("sellers", id);
    return "deleted";
  }
  async searchSellers(role: UserRole, query: string, status: StatusFilter = "all"): Promise<Seller[]> {
    const term = query.trim().toLocaleLowerCase("es");
    const [sellers, branches] = await Promise.all([this.listSellers(role), this.listBranches(role)]);
    const branchLabels = new Map(branches.map(branch => [branch.id, `${branch.code} ${branch.name}`]));
    return sellers.filter(seller => (status === "all" || seller.status === status) && (!term || `${seller.name} ${seller.documentType} ${seller.documentNumber} ${seller.email ?? ""} ${seller.phone ?? ""} ${branchLabels.get(seller.branchId) ?? ""}`.toLocaleLowerCase("es").includes(term)));
  }
}
export const organizationService = new OrganizationService();
