// Generic repository for the common "details" entity shape: PK=`<PREFIX>#<id>`, SK=DETAILS.
// Covers create / get / update / delete, collection listing via GSI1, optional extra GSI
// projections (category/facility/etc.), and hydration-safe merge for AI-enriched entities.
//
// Repos are returned as plain objects of functions (not class instances) so specialised
// accessors can compose extra methods with a simple spread.

import { randomUUID } from 'node:crypto';
import {
  INDEX,
  SK_DETAILS,
  dateSortKey,
  stripInternal,
  type IndexName,
} from './keys.js';
import type { QueryOptions, StoredItem, TableClient } from './table-client.js';
import type { Timestamped } from './types.js';

export class NotFoundError extends Error {
  constructor(public readonly entity: string, public readonly id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

const STAMP_KEYS = new Set(['createdAt', 'updatedAt']);

export const isoNow = (): string => new Date().toISOString();
export const newId = (): string => randomUUID();

export interface ListRange {
  /** Inclusive lower bound on the collection's sort date (ISO date/timestamp prefix). */
  from?: string;
  /** Inclusive upper bound on the collection's sort date. */
  to?: string;
  limit?: number;
  /** Sort ascending by date (default true). */
  ascending?: boolean;
}

export interface DetailsRepoConfig<T, IdKey extends keyof T & string> {
  /** Entity label for errors, and PK prefix, e.g. "ACTIVITY". */
  prefix: string;
  /** Domain field that holds the generated id, e.g. "activityId". */
  idField: IdKey;
  /** GSI1PK collection name (e.g. "ACTIVITIES"). Set to enable list()/listByDateRange(). */
  collection?: string;
  /** Field providing the GSI1 sort date; defaults to createdAt. */
  sortField?: keyof T & string;
  /** Extra GSI attribute projections (GSI2/GSI3/GSI4) computed from the domain item. */
  indexProjections?: (item: T) => Record<string, string | undefined>;
  /** Whether this entity supports AI hydration with user-edit preservation. */
  hydratable?: boolean;
}

/** Fields the caller never supplies on create: the lib stamps timestamps and generates the id. */
type NewInput<T, IdKey extends keyof T & string> = Omit<T, 'createdAt' | 'updatedAt' | IdKey>;

export interface DetailsRepo<T extends Timestamped, IdKey extends keyof T & string> {
  create(input: NewInput<T, IdKey>): Promise<T>;
  get(id: string): Promise<T | null>;
  /** Get or throw NotFoundError. */
  require(id: string): Promise<T>;
  update(id: string, patch: Partial<NewInput<T, IdKey>>): Promise<T>;
  delete(id: string): Promise<void>;
  /** List the whole collection (requires `collection`), ordered by sort date. */
  list(range?: ListRange): Promise<T[]>;
  listByDateRange(from: string, to: string, range?: Omit<ListRange, 'from' | 'to'>): Promise<T[]>;
  /** Low-level GSI listing used by specialised accessors (category, facility, …). */
  listByIndex(index: IndexName, partitionValue: string, range?: ListRange): Promise<T[]>;
  /** Re-hydrate AI data without clobbering fields a human has edited. */
  mergePreservingUserEdits(id: string, aiData: Partial<T>): Promise<T>;
}

export function makeDetailsRepo<T extends Timestamped, IdKey extends keyof T & string>(
  client: TableClient,
  config: DetailsRepoConfig<T, IdKey>,
): DetailsRepo<T, IdKey> {
  const { prefix, idField, collection, sortField, indexProjections, hydratable } = config;
  const pkOf = (id: string): string => `${prefix}#${id}`;

  const toStored = (domain: T): StoredItem => {
    const id = String(domain[idField]);
    const item: StoredItem = { ...(domain as Record<string, unknown>), PK: pkOf(id), SK: SK_DETAILS };
    if (collection) {
      const sortVal = sortField ? domain[sortField] : domain.createdAt;
      item.GSI1PK = collection;
      item.GSI1SK = dateSortKey(String(sortVal ?? domain.createdAt), id);
    }
    if (indexProjections) {
      for (const [k, v] of Object.entries(indexProjections(domain))) {
        if (v !== undefined) item[k] = v;
      }
    }
    return item;
  };

  const toDomain = (item: StoredItem): T => stripInternal(item) as unknown as T;

  const range2opts = (range?: ListRange): QueryOptions => {
    const opts: QueryOptions = { ascending: range?.ascending ?? true, limit: range?.limit };
    if (range?.from !== undefined || range?.to !== undefined) {
      // GSI sort keys are `<date>#<id>`; pad the upper bound so the whole `to` day is included.
      opts.skBetween = [range?.from ?? '', `${range?.to ?? '￿'}￿`];
    }
    return opts;
  };

  async function get(id: string): Promise<T | null> {
    const item = await client.get(pkOf(id), SK_DETAILS);
    return item ? toDomain(item) : null;
  }

  async function require(id: string): Promise<T> {
    const found = await get(id);
    if (!found) throw new NotFoundError(prefix, id);
    return found;
  }

  return {
    async create(input) {
      const now = isoNow();
      const domain = {
        ...(input as Record<string, unknown>),
        [idField]: newId(),
        createdAt: now,
        updatedAt: now,
      } as unknown as T;
      await client.put(toStored(domain));
      return domain;
    },

    get,
    require,

    async update(id, patch) {
      const existing = await client.get(pkOf(id), SK_DETAILS);
      if (!existing) throw new NotFoundError(prefix, id);
      const current = toDomain(existing);
      const merged: T = {
        ...(current as Record<string, unknown>),
        ...(patch as Record<string, unknown>),
        [idField]: id,
        createdAt: current.createdAt,
        updatedAt: isoNow(),
      } as unknown as T;
      if (hydratable) {
        const edited = new Set<string>((current as { userEdited?: string[] }).userEdited ?? []);
        for (const key of Object.keys(patch as Record<string, unknown>)) {
          if (key !== idField && !STAMP_KEYS.has(key) && key !== 'userEdited') edited.add(key);
        }
        (merged as { userEdited?: string[] }).userEdited = [...edited];
      }
      await client.put(toStored(merged));
      return merged;
    },

    async delete(id) {
      await client.delete(pkOf(id), SK_DETAILS);
    },

    async list(range) {
      if (!collection) throw new Error(`${prefix} has no collection index; list() unsupported`);
      const items = await client.queryIndex(INDEX.GSI1, collection, range2opts(range));
      return items.map(toDomain);
    },

    async listByDateRange(from, to, range) {
      if (!collection) throw new Error(`${prefix} has no collection index; listByDateRange() unsupported`);
      const items = await client.queryIndex(INDEX.GSI1, collection, range2opts({ ...range, from, to }));
      return items.map(toDomain);
    },

    async listByIndex(index, partitionValue, range) {
      const items = await client.queryIndex(index, partitionValue, range2opts(range));
      return items.map(toDomain);
    },

    async mergePreservingUserEdits(id, aiData) {
      const existing = await client.get(pkOf(id), SK_DETAILS);
      if (!existing) throw new NotFoundError(prefix, id);
      const current = toDomain(existing);
      const edited = new Set<string>((current as { userEdited?: string[] }).userEdited ?? []);
      const merged: Record<string, unknown> = { ...(current as Record<string, unknown>) };
      for (const [key, value] of Object.entries(aiData as Record<string, unknown>)) {
        if (key === idField || STAMP_KEYS.has(key) || key === 'userEdited') continue;
        if (edited.has(key)) continue; // a human owns this field — never overwrite
        merged[key] = value;
      }
      merged[idField] = id;
      merged.createdAt = current.createdAt;
      merged.updatedAt = isoNow();
      merged.lastDataRefresh = isoNow();
      const result = merged as unknown as T;
      await client.put(toStored(result));
      return result;
    },
  };
}
