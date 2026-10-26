import type { EntityByStore, StoreName } from "@/domain/models";
export interface Repository {
  list<K extends StoreName>(store: K): Promise<EntityByStore[K][]>;
  get<K extends StoreName>(store: K, id: string): Promise<EntityByStore[K] | undefined>;
  put<K extends StoreName>(store: K, entity: EntityByStore[K]): Promise<EntityByStore[K]>;
  remove<K extends StoreName>(store: K, id: string): Promise<void>;
}
