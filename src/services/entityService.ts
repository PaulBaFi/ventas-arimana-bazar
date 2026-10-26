import type { BaseEntity, EntityByStore, StoreName } from "@/domain/models";
import type { Repository } from "./contracts";

export class EntityService<K extends StoreName> {
  constructor(private readonly repository: Repository, private readonly store: K) {}
  list() { return this.repository.list(this.store); }
  get(id: string) { return this.repository.get(this.store, id); }
  async save(entity: EntityByStore[K]): Promise<EntityByStore[K]> {
    const now = new Date().toISOString();
    const record = { ...entity, updatedAt: now } as EntityByStore[K];
    return this.repository.put(this.store, record);
  }
  async deactivate(id: string): Promise<void> {
    const existing = await this.repository.get(this.store, id);
    if (!existing) throw new Error("No se encontró el registro.");
    await this.repository.put(this.store, { ...existing, status: "inactive", updatedAt: new Date().toISOString() } as BaseEntity as EntityByStore[K]);
  }
  /** Eliminación física reservada a datos sin dependencias y a elementos de prueba descartables. */
  remove(id: string) { return this.repository.remove(this.store, id); }
  async search(query: string, fields: (keyof EntityByStore[K])[]): Promise<EntityByStore[K][]> {
    const normalized = query.trim().toLocaleLowerCase("es");
    const records = await this.list();
    if (!normalized) return records;
    return records.filter(record => fields.some(field => String(record[field] ?? "").toLocaleLowerCase("es").includes(normalized)));
  }
}
