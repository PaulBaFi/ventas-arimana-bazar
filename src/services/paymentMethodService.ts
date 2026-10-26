import type { PaymentMethod, UserRole } from "@/domain/models";
import { assertPermission } from "@/domain/permissions";
import { validatePaymentMethod } from "@/domain/validation";
import { localRepository } from "@/persistence/database";

export class PaymentMethodService {
  async list(role: UserRole): Promise<PaymentMethod[]> { assertPermission(role, "payments:read"); return localRepository.list("paymentMethods"); }
  async save(role: UserRole, input: { id?: string; name: string; description?: string }): Promise<PaymentMethod> {
    assertPermission(role, "payments:write");
    const error = validatePaymentMethod(input.name);
    if (error) throw new Error(error);
    const methods = await localRepository.list("paymentMethods");
    const previous = input.id ? methods.find(item => item.id === input.id) : undefined;
    if (input.id && !previous) throw new Error("No se encontró el medio de pago.");
    if (previous?.status === "inactive") throw new Error("No se puede modificar un medio de pago inactivo.");
    if (methods.some(item => item.name.trim().toLocaleLowerCase("es") === input.name.trim().toLocaleLowerCase("es") && item.id !== input.id)) throw new Error("Ya existe un medio de pago con ese nombre.");
    const now = new Date().toISOString();
    return localRepository.put("paymentMethods", { id: input.id ?? crypto.randomUUID(), name: input.name.trim(), description: input.description?.trim() || undefined, createdAt: previous?.createdAt ?? now, updatedAt: now, status: "active", demo: true });
  }
  async delete(role: UserRole, id: string): Promise<"deleted" | "deactivated"> {
    assertPermission(role, "payments:write");
    const method = await localRepository.get("paymentMethods", id);
    if (!method) throw new Error("No se encontró el medio de pago.");
    const sales = await localRepository.list("sales");
    if (sales.some(sale => sale.paymentMethodId === id)) {
      await localRepository.put("paymentMethods", { ...method, status: "inactive", updatedAt: new Date().toISOString() });
      return "deactivated";
    }
    await localRepository.remove("paymentMethods", id);
    return "deleted";
  }
  async search(role: UserRole, query: string, status: "all" | "active" | "inactive" = "all"): Promise<PaymentMethod[]> {
    const term = query.trim().toLocaleLowerCase("es");
    return (await this.list(role)).filter(method => (status === "all" || method.status === status) && (!term || `${method.name} ${method.description ?? ""}`.toLocaleLowerCase("es").includes(term)));
  }
}
export const paymentMethodService = new PaymentMethodService();
