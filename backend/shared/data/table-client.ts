// TableClient — the thin storage seam the repos sit on. Two implementations:
//   • DynamoTableClient   — real DynamoDB (production / integration)
//   • InMemoryTableClient — ./memory-client.ts, used by unit tests
// Keeping repo logic (keys, stamping, list ranges, merge) above this seam lets us unit-test
// all of it for real without AWS, while the Dynamo client stays a thin translation layer.

import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { partitionAttr, sortAttr, type IndexName } from './keys.js';

export interface StoredItem {
  PK: string;
  SK: string;
  [attr: string]: unknown;
}

/** A single guard for a conditional write: require `attr` to be absent, or equal `equals`. */
export interface PutCondition {
  attr: string;
  equals?: unknown;
  notExists?: boolean;
}

/** Thrown by `putIf` when the guard fails (e.g. a second single-use claim). Typed so callers can
 *  distinguish "someone beat me to it" from a genuine I/O error. */
export class ConditionFailedError extends Error {
  constructor(message = 'Conditional write failed') {
    super(message);
    this.name = 'ConditionFailedError';
  }
}

export interface QueryOptions {
  /** begins_with on the (base-table or index) sort key. */
  skBeginsWith?: string;
  /** BETWEEN (inclusive) on the sort key. */
  skBetween?: [string, string];
  /** Cap the number of items returned (applied after ordering). */
  limit?: number;
  /** Sort ascending by sort key (default true). */
  ascending?: boolean;
}

export interface TableClient {
  put(item: StoredItem): Promise<void>;
  /** Conditional single-use write: put `item` only if `condition` holds (attribute absent, or
   *  equal to `condition.equals`). Throws `ConditionFailedError` if the guard fails. */
  putIf(item: StoredItem, condition: PutCondition): Promise<void>;
  get(pk: string, sk: string): Promise<StoredItem | null>;
  delete(pk: string, sk: string): Promise<void>;
  /** Query the base table partition `pk`. */
  query(pk: string, opts?: QueryOptions): Promise<StoredItem[]>;
  /** Query a GSI partition `pk` on `index`. */
  queryIndex(index: IndexName, pk: string, opts?: QueryOptions): Promise<StoredItem[]>;
  /** Full-table scan for every item whose PK begins with `pkPrefix`. Used only for partition-wide
   *  admin operations (e.g. purging a removed student's data) — NOT a request-path primitive. */
  scanByPkPrefix(pkPrefix: string): Promise<StoredItem[]>;
}

function buildKeyCondition(pkAttr: string, skAttr: string, opts: QueryOptions | undefined) {
  const names: Record<string, string> = { '#pk': pkAttr };
  const values: Record<string, unknown> = { ':pk': undefined };
  let expr = '#pk = :pk';
  if (opts?.skBeginsWith !== undefined) {
    names['#sk'] = skAttr;
    values[':skp'] = opts.skBeginsWith;
    expr += ' AND begins_with(#sk, :skp)';
  } else if (opts?.skBetween !== undefined) {
    names['#sk'] = skAttr;
    values[':lo'] = opts.skBetween[0];
    values[':hi'] = opts.skBetween[1];
    expr += ' AND #sk BETWEEN :lo AND :hi';
  }
  return { names, values, expr };
}

export class DynamoTableClient implements TableClient {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    doc?: DynamoDBDocumentClient,
  ) {
    this.doc =
      doc ??
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

  async put(item: StoredItem): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  async putIf(item: StoredItem, condition: PutCondition): Promise<void> {
    const names: Record<string, string> = { '#a': condition.attr };
    const values: Record<string, unknown> = {};
    let expr = 'attribute_not_exists(#a)';
    if (!condition.notExists) {
      expr = 'attribute_not_exists(#a) OR #a = :v';
      values[':v'] = condition.equals;
    }
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: expr,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
        }),
      );
    } catch (err) {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
        throw new ConditionFailedError();
      }
      throw err;
    }
  }

  async get(pk: string, sk: string): Promise<StoredItem | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } }),
    );
    return (res.Item as StoredItem | undefined) ?? null;
  }

  async delete(pk: string, sk: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } }),
    );
  }

  async query(pk: string, opts?: QueryOptions): Promise<StoredItem[]> {
    return this.runQuery(undefined, 'PK', 'SK', pk, opts);
  }

  async queryIndex(index: IndexName, pk: string, opts?: QueryOptions): Promise<StoredItem[]> {
    return this.runQuery(index, partitionAttr(index), sortAttr(index), pk, opts);
  }

  async scanByPkPrefix(pkPrefix: string): Promise<StoredItem[]> {
    const items: StoredItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'begins_with(#pk, :p)',
          ExpressionAttributeNames: { '#pk': 'PK' },
          ExpressionAttributeValues: { ':p': pkPrefix },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const it of (res.Items ?? []) as StoredItem[]) items.push(it);
      exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);
    return items;
  }

  private async runQuery(
    index: IndexName | undefined,
    pkAttr: string,
    skAttr: string,
    pk: string,
    opts?: QueryOptions,
  ): Promise<StoredItem[]> {
    const { names, values, expr } = buildKeyCondition(pkAttr, skAttr, opts);
    values[':pk'] = pk;
    const items: StoredItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: index,
          KeyConditionExpression: expr,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ScanIndexForward: opts?.ascending ?? true,
          Limit: opts?.limit,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const it of (res.Items ?? []) as StoredItem[]) items.push(it);
      exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey && (opts?.limit === undefined || items.length < opts.limit));
    return opts?.limit !== undefined ? items.slice(0, opts.limit) : items;
  }
}

/** Read the table name from the environment (CDK injects TABLE_NAME). Never hardcoded. */
export function tableClientFromEnv(env: NodeJS.ProcessEnv = process.env): DynamoTableClient {
  const tableName = env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME environment variable is not set (injected by CDK from SSM).');
  }
  return new DynamoTableClient(tableName);
}
