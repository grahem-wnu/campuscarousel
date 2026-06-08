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
} from '@aws-sdk/lib-dynamodb';
import { partitionAttr, sortAttr, type IndexName } from './keys.js';

export interface StoredItem {
  PK: string;
  SK: string;
  [attr: string]: unknown;
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
  get(pk: string, sk: string): Promise<StoredItem | null>;
  delete(pk: string, sk: string): Promise<void>;
  /** Query the base table partition `pk`. */
  query(pk: string, opts?: QueryOptions): Promise<StoredItem[]>;
  /** Query a GSI partition `pk` on `index`. */
  queryIndex(index: IndexName, pk: string, opts?: QueryOptions): Promise<StoredItem[]>;
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
