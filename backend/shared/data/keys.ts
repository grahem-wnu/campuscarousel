// Key + index conventions for the single table. Centralised so every repo builds keys the
// same way and so the infra DataStack (see ./README.md) can mirror exactly these names.

export const SK_DETAILS = 'DETAILS';

/** Secondary index names. GSI1 is the generalised "list a collection by date" index
 *  (GSI1PK = collection name e.g. ACTIVITIES/COLLEGES/GOALS, GSI1SK = `<date>#<id>`).
 *  GSI2 = activities by category, GSI3 = experiences by facility, GSI4 = exams by date. */
export const INDEX = {
  GSI1: 'GSI1',
  GSI2: 'GSI2',
  GSI3: 'GSI3',
  GSI4: 'GSI4',
} as const;

export type IndexName = (typeof INDEX)[keyof typeof INDEX];

/** Storage-internal attributes that are stripped before returning items to callers. */
export const INTERNAL_ATTRS = new Set<string>([
  'PK',
  'SK',
  'GSI1PK',
  'GSI1SK',
  'GSI2PK',
  'GSI2SK',
  'GSI3PK',
  'GSI3SK',
  'GSI4PK',
  'GSI4SK',
]);

export const partitionAttr = (index: IndexName): string => `${index}PK`;
export const sortAttr = (index: IndexName): string => `${index}SK`;

/** Composite GSI sort value: `<date-or-createdAt>#<id>`, sortable lexicographically. */
export const dateSortKey = (date: string, id: string): string => `${date}#${id}`;

/** Remove internal PK/SK/GSI attributes, returning the clean domain object. */
export function stripInternal<T extends Record<string, unknown>>(item: T): Omit<T, string> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (!INTERNAL_ATTRS.has(k)) out[k] = v;
  }
  return out as T;
}
