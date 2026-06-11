// Accessors that don't fit the generic "details" shape:
//   • child collections under a parent partition (college notes / touchpoints / visits)
//   • per-parent singletons (college checklist, college benchmark)
//   • conversations (a DETAILS marker + MESSAGE# items)
//   • global / per-user singletons (budget, user profile)

import { SK_DETAILS, dateSortKey, stripInternal } from './keys.js';
import { NotFoundError, isoNow, newId } from './repo.js';
import type { ListRange } from './repo.js';
import type { StoredItem, TableClient } from './table-client.js';
import type {
  Budget,
  CollegeChecklist,
  CollegeNote,
  Conversation,
  ConversationMessage,
  Benchmark,
  Invite,
  Profile,
  ReminderSettings,
  StudentProfile,
  Tenant,
  Touchpoint,
  Timestamped,
  Visit,
} from './types.js';

// A strictly-monotonic, lexicographically-ordered id: `<isoNow>#<counter>`. The per-millisecond
// counter guarantees that items created within the same millisecond keep insertion order (a
// random suffix would not), so message/note listings are stable.
let lastStamp = '';
let stampCounter = 0;
const timeId = (): string => {
  const now = isoNow();
  if (now === lastStamp) stampCounter += 1;
  else {
    lastStamp = now;
    stampCounter = 0;
  }
  return `${now}#${stampCounter.toString().padStart(6, '0')}`;
};

const toDomain = <T>(item: StoredItem): T => stripInternal(item) as unknown as T;

// ---------------------------------------------------------------------------
// Generic child repo: items at PK=`<PARENT>#<parentId>`, SK=`<SKPREFIX>#<childId>`.
// ---------------------------------------------------------------------------
interface ChildRepoConfig<T, IdKey extends keyof T & string, ParentKey extends keyof T & string> {
  parentPrefix: string;
  skPrefix: string;
  parentField: ParentKey;
  idField: IdKey;
  /** "time" → sortable `<isoNow>#<short>` id; "uuid" → opaque id. */
  idStrategy: 'time' | 'uuid';
}

/** Fields the caller never supplies on add: the lib stamps timestamps, sets the parent id, and
 *  generates the child id. */
type ChildInput<T, IdKey extends keyof T & string, ParentKey extends keyof T & string> = Omit<
  T,
  'createdAt' | 'updatedAt' | IdKey | ParentKey
>;

export interface ChildRepo<T extends Timestamped, IdKey extends keyof T & string, ParentKey extends keyof T & string> {
  add(parentId: string, input: ChildInput<T, IdKey, ParentKey>): Promise<T>;
  get(parentId: string, childId: string): Promise<T | null>;
  update(parentId: string, childId: string, patch: Partial<ChildInput<T, IdKey, ParentKey>>): Promise<T>;
  delete(parentId: string, childId: string): Promise<void>;
  list(parentId: string, range?: ListRange): Promise<T[]>;
}

function makeChildRepo<T extends Timestamped, IdKey extends keyof T & string, ParentKey extends keyof T & string>(
  client: TableClient,
  config: ChildRepoConfig<T, IdKey, ParentKey>,
): ChildRepo<T, IdKey, ParentKey> {
  const { parentPrefix, skPrefix, parentField, idField, idStrategy } = config;
  const pkOf = (parentId: string): string => `${parentPrefix}#${parentId}`;
  const skOf = (childId: string): string => `${skPrefix}#${childId}`;

  const store = (parentId: string, domain: T): StoredItem => ({
    ...(domain as unknown as Record<string, unknown>),
    PK: pkOf(parentId),
    SK: skOf(String(domain[idField])),
  });

  return {
    async add(parentId, input) {
      const now = isoNow();
      const childId = idStrategy === 'time' ? timeId() : newId();
      const domain = {
        ...(input as unknown as Record<string, unknown>),
        [parentField]: parentId,
        [idField]: childId,
        createdAt: now,
        updatedAt: now,
      } as unknown as T;
      await client.put(store(parentId, domain));
      return domain;
    },
    async get(parentId, childId) {
      const item = await client.get(pkOf(parentId), skOf(childId));
      return item ? toDomain<T>(item) : null;
    },
    async update(parentId, childId, patch) {
      const existing = await client.get(pkOf(parentId), skOf(childId));
      if (!existing) throw new NotFoundError(`${parentPrefix}/${skPrefix}`, `${parentId}/${childId}`);
      const current = toDomain<T>(existing);
      const merged = {
        ...(current as unknown as Record<string, unknown>),
        ...(patch as unknown as Record<string, unknown>),
        [parentField]: parentId,
        [idField]: childId,
        createdAt: current.createdAt,
        updatedAt: isoNow(),
      } as unknown as T;
      await client.put(store(parentId, merged));
      return merged;
    },
    async delete(parentId, childId) {
      await client.delete(pkOf(parentId), skOf(childId));
    },
    async list(parentId, range) {
      const items = await client.query(pkOf(parentId), {
        skBeginsWith: `${skPrefix}#`,
        ascending: range?.ascending ?? true,
        limit: range?.limit,
      });
      return items.map((i) => toDomain<T>(i));
    },
  };
}

export const makeCollegeNotes = (client: TableClient): ChildRepo<CollegeNote, 'noteId', 'collegeId'> =>
  makeChildRepo<CollegeNote, 'noteId', 'collegeId'>(client, {
    parentPrefix: 'COLLEGE',
    skPrefix: 'NOTE',
    parentField: 'collegeId',
    idField: 'noteId',
    idStrategy: 'time',
  });

export const makeTouchpoints = (client: TableClient): ChildRepo<Touchpoint, 'touchpointId', 'collegeId'> =>
  makeChildRepo<Touchpoint, 'touchpointId', 'collegeId'>(client, {
    parentPrefix: 'COLLEGE',
    skPrefix: 'TOUCHPOINT',
    parentField: 'collegeId',
    idField: 'touchpointId',
    idStrategy: 'time',
  });

export const makeVisits = (client: TableClient): ChildRepo<Visit, 'visitId', 'collegeId'> =>
  makeChildRepo<Visit, 'visitId', 'collegeId'>(client, {
    parentPrefix: 'COLLEGE',
    skPrefix: 'VISIT',
    parentField: 'collegeId',
    idField: 'visitId',
    idStrategy: 'uuid',
  });

// ---------------------------------------------------------------------------
// Per-college singletons: checklist (SK=CHECKLIST) and benchmark (SK=BENCHMARK).
// ---------------------------------------------------------------------------
export interface CollegeChecklistRepo {
  get(collegeId: string): Promise<CollegeChecklist | null>;
  put(collegeId: string, items: CollegeChecklist['items']): Promise<CollegeChecklist>;
}

export function makeCollegeChecklist(client: TableClient): CollegeChecklistRepo {
  const pkOf = (id: string): string => `COLLEGE#${id}`;
  return {
    async get(collegeId) {
      const item = await client.get(pkOf(collegeId), 'CHECKLIST');
      return item ? toDomain<CollegeChecklist>(item) : null;
    },
    async put(collegeId, items) {
      const existing = await client.get(pkOf(collegeId), 'CHECKLIST');
      const now = isoNow();
      const domain: CollegeChecklist = {
        collegeId,
        items,
        createdAt: (existing?.createdAt as string | undefined) ?? now,
        updatedAt: now,
      };
      await client.put({ ...(domain as unknown as Record<string, unknown>), PK: pkOf(collegeId), SK: 'CHECKLIST' });
      return domain;
    },
  };
}

export interface BenchmarkRepo {
  get(collegeId: string): Promise<Benchmark | null>;
  put(collegeId: string, data: Omit<Benchmark, 'collegeId' | 'createdAt' | 'updatedAt'>): Promise<Benchmark>;
  mergePreservingUserEdits(collegeId: string, aiData: Partial<Benchmark>): Promise<Benchmark>;
}

export function makeBenchmarks(client: TableClient): BenchmarkRepo {
  const pkOf = (id: string): string => `COLLEGE#${id}`;
  const write = async (collegeId: string, domain: Benchmark): Promise<Benchmark> => {
    await client.put({ ...(domain as unknown as Record<string, unknown>), PK: pkOf(collegeId), SK: 'BENCHMARK' });
    return domain;
  };
  return {
    async get(collegeId) {
      const item = await client.get(pkOf(collegeId), 'BENCHMARK');
      return item ? toDomain<Benchmark>(item) : null;
    },
    async put(collegeId, data) {
      const existing = await client.get(pkOf(collegeId), 'BENCHMARK');
      const now = isoNow();
      return write(collegeId, {
        ...data,
        collegeId,
        createdAt: (existing?.createdAt as string | undefined) ?? now,
        updatedAt: now,
      });
    },
    async mergePreservingUserEdits(collegeId, aiData) {
      const existing = await client.get(pkOf(collegeId), 'BENCHMARK');
      const now = isoNow();
      const current = existing ? toDomain<Benchmark>(existing) : ({ collegeId, createdAt: now, updatedAt: now } as Benchmark);
      const edited = new Set<string>(current.userEdited ?? []);
      const merged: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
      for (const [key, value] of Object.entries(aiData as unknown as Record<string, unknown>)) {
        if (key === 'collegeId' || key === 'createdAt' || key === 'updatedAt' || key === 'userEdited') continue;
        if (edited.has(key)) continue;
        merged[key] = value;
      }
      merged.collegeId = collegeId;
      merged.updatedAt = now;
      merged.lastDataRefresh = now;
      return write(collegeId, merged as unknown as Benchmark);
    },
  };
}

// ---------------------------------------------------------------------------
// Conversations: a DETAILS marker (listable via GSI1 "CONVERSATIONS") + MESSAGE# items.
// ---------------------------------------------------------------------------
export interface ConversationRepo {
  create(input: Omit<Conversation, 'conversationId' | 'createdAt' | 'updatedAt'>): Promise<Conversation>;
  get(conversationId: string): Promise<Conversation | null>;
  list(range?: ListRange): Promise<Conversation[]>;
  addMessage(
    conversationId: string,
    input: Omit<ConversationMessage, 'conversationId' | 'messageId' | 'createdAt' | 'updatedAt'>,
  ): Promise<ConversationMessage>;
  listMessages(conversationId: string, range?: ListRange): Promise<ConversationMessage[]>;
}

export function makeConversations(client: TableClient): ConversationRepo {
  const pkOf = (id: string): string => `CONVERSATION#${id}`;
  return {
    async create(input) {
      const now = isoNow();
      const conversationId = newId();
      const domain: Conversation = { ...input, conversationId, createdAt: now, updatedAt: now };
      await client.put({
        ...(domain as unknown as Record<string, unknown>),
        PK: pkOf(conversationId),
        SK: SK_DETAILS,
        GSI1PK: 'CONVERSATIONS',
        GSI1SK: dateSortKey(now, conversationId),
      });
      return domain;
    },
    async get(conversationId) {
      const item = await client.get(pkOf(conversationId), SK_DETAILS);
      return item ? toDomain<Conversation>(item) : null;
    },
    async list(range) {
      const items = await client.queryIndex('GSI1', 'CONVERSATIONS', {
        ascending: range?.ascending ?? true,
        limit: range?.limit,
      });
      return items.map((i) => toDomain<Conversation>(i));
    },
    async addMessage(conversationId, input) {
      const now = isoNow();
      const messageId = timeId();
      const domain: ConversationMessage = {
        ...input,
        conversationId,
        messageId,
        createdAt: now,
        updatedAt: now,
      };
      await client.put({
        ...(domain as unknown as Record<string, unknown>),
        PK: pkOf(conversationId),
        SK: `MESSAGE#${messageId}`,
      });
      return domain;
    },
    async listMessages(conversationId, range) {
      const items = await client.query(pkOf(conversationId), {
        skBeginsWith: 'MESSAGE#',
        ascending: range?.ascending ?? true,
        limit: range?.limit,
      });
      return items.map((i) => toDomain<ConversationMessage>(i));
    },
  };
}

// ---------------------------------------------------------------------------
// Global / per-user singletons: budget (PK=BUDGET) and profile (PK=USER#<id>).
// ---------------------------------------------------------------------------
export interface BudgetRepo {
  get(): Promise<Budget | null>;
  put(input: Omit<Budget, 'createdAt' | 'updatedAt'>): Promise<Budget>;
  update(patch: Partial<Omit<Budget, 'createdAt' | 'updatedAt'>>): Promise<Budget>;
}

export function makeBudget(client: TableClient): BudgetRepo {
  const write = async (domain: Budget): Promise<Budget> => {
    await client.put({ ...(domain as unknown as Record<string, unknown>), PK: 'BUDGET', SK: SK_DETAILS });
    return domain;
  };
  return {
    async get() {
      const item = await client.get('BUDGET', SK_DETAILS);
      return item ? toDomain<Budget>(item) : null;
    },
    async put(input) {
      const existing = await client.get('BUDGET', SK_DETAILS);
      const now = isoNow();
      return write({ ...input, createdAt: (existing?.createdAt as string | undefined) ?? now, updatedAt: now });
    },
    async update(patch) {
      const existing = await client.get('BUDGET', SK_DETAILS);
      if (!existing) throw new NotFoundError('BUDGET', 'singleton');
      const current = toDomain<Budget>(existing);
      return write({ ...current, ...patch, createdAt: current.createdAt, updatedAt: isoNow() });
    },
  };
}

// Reminder settings: global singleton (PK=REMINDER_SETTINGS) driving the email digest (v2.1 F1).
export interface ReminderSettingsRepo {
  get(): Promise<ReminderSettings | null>;
  put(input: Omit<ReminderSettings, 'createdAt' | 'updatedAt'>): Promise<ReminderSettings>;
  update(patch: Partial<Omit<ReminderSettings, 'createdAt' | 'updatedAt'>>): Promise<ReminderSettings>;
}

export function makeReminderSettings(client: TableClient): ReminderSettingsRepo {
  const write = async (domain: ReminderSettings): Promise<ReminderSettings> => {
    await client.put({
      ...(domain as unknown as Record<string, unknown>),
      PK: 'REMINDER_SETTINGS',
      SK: SK_DETAILS,
    });
    return domain;
  };
  return {
    async get() {
      const item = await client.get('REMINDER_SETTINGS', SK_DETAILS);
      return item ? toDomain<ReminderSettings>(item) : null;
    },
    async put(input) {
      const existing = await client.get('REMINDER_SETTINGS', SK_DETAILS);
      const now = isoNow();
      return write({ ...input, createdAt: (existing?.createdAt as string | undefined) ?? now, updatedAt: now });
    },
    async update(patch) {
      const existing = await client.get('REMINDER_SETTINGS', SK_DETAILS);
      if (!existing) throw new NotFoundError('REMINDER_SETTINGS', 'singleton');
      const current = toDomain<ReminderSettings>(existing);
      return write({ ...current, ...patch, createdAt: current.createdAt, updatedAt: isoNow() });
    },
  };
}

export interface ProfileRepo {
  get(userId: string): Promise<Profile | null>;
  put(input: Omit<Profile, 'createdAt' | 'updatedAt'>): Promise<Profile>;
  update(userId: string, patch: Partial<Omit<Profile, 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Profile>;
}

export function makeProfiles(client: TableClient): ProfileRepo {
  const pkOf = (id: string): string => `USER#${id}`;
  const write = async (domain: Profile): Promise<Profile> => {
    await client.put({ ...(domain as unknown as Record<string, unknown>), PK: pkOf(domain.userId), SK: 'PROFILE' });
    return domain;
  };
  return {
    async get(userId) {
      const item = await client.get(pkOf(userId), 'PROFILE');
      return item ? toDomain<Profile>(item) : null;
    },
    async put(input) {
      const existing = await client.get(pkOf(input.userId), 'PROFILE');
      const now = isoNow();
      return write({ ...input, createdAt: (existing?.createdAt as string | undefined) ?? now, updatedAt: now });
    },
    async update(userId, patch) {
      const existing = await client.get(pkOf(userId), 'PROFILE');
      if (!existing) throw new NotFoundError('USER', userId);
      const current = toDomain<Profile>(existing);
      return write({ ...current, ...patch, userId, createdAt: current.createdAt, updatedAt: isoNow() });
    },
  };
}

// Student profile: global singleton (PK=STUDENT_PROFILE) for the onboarding wizard (v2.1 F4).
export interface StudentProfileRepo {
  get(): Promise<StudentProfile | null>;
  put(input: Omit<StudentProfile, 'createdAt' | 'updatedAt'>): Promise<StudentProfile>;
}

export function makeStudentProfile(client: TableClient): StudentProfileRepo {
  return {
    async get() {
      const item = await client.get('STUDENT_PROFILE', SK_DETAILS);
      return item ? toDomain<StudentProfile>(item) : null;
    },
    async put(input) {
      const existing = await client.get('STUDENT_PROFILE', SK_DETAILS);
      const now = isoNow();
      const domain: StudentProfile = {
        ...input,
        createdAt: (existing?.createdAt as string | undefined) ?? now,
        updatedAt: now,
      };
      await client.put({
        ...(domain as unknown as Record<string, unknown>),
        PK: 'STUDENT_PROFILE',
        SK: SK_DETAILS,
      });
      return domain;
    },
  };
}

// ---------------------------------------------------------------------------
// Tenant registry (PK: TENANT#<id>) — the one GLOBAL namespace (SaaS platform). Always built on the
// UN-scoped base client, so registry keys are never tenant-prefixed. Enumerable via GSI1PK='TENANTS'.
// ---------------------------------------------------------------------------
export interface TenantRepo {
  get(tenantId: string): Promise<Tenant | null>;
  create(input: Omit<Tenant, 'createdAt' | 'updatedAt'>): Promise<Tenant>;
  update(
    tenantId: string,
    patch: Partial<Omit<Tenant, 'tenantId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Tenant>;
  list(): Promise<Tenant[]>;
}

export function makeTenants(client: TableClient): TenantRepo {
  const write = async (domain: Tenant): Promise<Tenant> => {
    await client.put({
      ...(domain as unknown as Record<string, unknown>),
      PK: `TENANT#${domain.tenantId}`,
      SK: SK_DETAILS,
      GSI1PK: 'TENANTS',
      GSI1SK: dateSortKey(domain.createdAt, domain.tenantId),
    });
    return domain;
  };
  return {
    async get(tenantId) {
      const item = await client.get(`TENANT#${tenantId}`, SK_DETAILS);
      return item ? toDomain<Tenant>(item) : null;
    },
    async create(input) {
      const now = isoNow();
      return write({ ...input, createdAt: now, updatedAt: now });
    },
    async update(tenantId, patch) {
      const existing = await client.get(`TENANT#${tenantId}`, SK_DETAILS);
      if (!existing) throw new NotFoundError('TENANT', tenantId);
      const current = toDomain<Tenant>(existing);
      return write({ ...current, ...patch, tenantId, createdAt: current.createdAt, updatedAt: isoNow() });
    },
    async list() {
      const items = await client.queryIndex('GSI1', 'TENANTS', { ascending: true });
      return items.map((i) => toDomain<Tenant>(i));
    },
  };
}

// ---------------------------------------------------------------------------
// Invite registry (PK: INVITE#<code>) — GLOBAL (base client, never tenant-prefixed). Enumerable via
// GSI1PK='INVITES'. Mirrors the tenant registry. Codes are the partition, so lookup-by-code is O(1).
// ---------------------------------------------------------------------------
export interface InviteRepo {
  get(code: string): Promise<Invite | null>;
  create(input: Omit<Invite, 'createdAt' | 'updatedAt'>): Promise<Invite>;
  update(
    code: string,
    patch: Partial<Omit<Invite, 'code' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Invite>;
  list(): Promise<Invite[]>;
}

export function makeInvites(client: TableClient): InviteRepo {
  const write = async (domain: Invite): Promise<Invite> => {
    await client.put({
      ...(domain as unknown as Record<string, unknown>),
      PK: `INVITE#${domain.code}`,
      SK: SK_DETAILS,
      GSI1PK: 'INVITES',
      GSI1SK: dateSortKey(domain.createdAt, domain.code),
    });
    return domain;
  };
  return {
    async get(code) {
      const item = await client.get(`INVITE#${code}`, SK_DETAILS);
      return item ? toDomain<Invite>(item) : null;
    },
    async create(input) {
      const now = isoNow();
      return write({ ...input, createdAt: now, updatedAt: now });
    },
    async update(code, patch) {
      const existing = await client.get(`INVITE#${code}`, SK_DETAILS);
      if (!existing) throw new NotFoundError('INVITE', code);
      const current = toDomain<Invite>(existing);
      return write({ ...current, ...patch, code, createdAt: current.createdAt, updatedAt: isoNow() });
    },
    async list() {
      const items = await client.queryIndex('GSI1', 'INVITES', { ascending: false });
      return items.map((i) => toDomain<Invite>(i));
    },
  };
}
