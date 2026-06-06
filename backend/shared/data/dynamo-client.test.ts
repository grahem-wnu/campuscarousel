import { describe, expect, it } from 'vitest';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoTableClient } from './table-client.js';

/** Records the commands sent and returns canned responses, so we can assert that the client
 *  translates calls into the right DynamoDB document commands without touching AWS. */
class FakeDoc {
  readonly commands: { constructor: string; input: Record<string, unknown> }[] = [];
  private readonly queue: Record<string, unknown>[];
  constructor(responses: Record<string, unknown>[] = []) {
    this.queue = [...responses];
  }
  send(command: { constructor: { name: string }; input: Record<string, unknown> }): Promise<Record<string, unknown>> {
    this.commands.push({ constructor: command.constructor.name, input: command.input });
    return Promise.resolve(this.queue.shift() ?? {});
  }
}

const make = (responses: Record<string, unknown>[] = []) => {
  const doc = new FakeDoc(responses);
  const client = new DynamoTableClient('keiras-table', doc as unknown as DynamoDBDocumentClient);
  return { doc, client };
};

describe('DynamoTableClient', () => {
  it('put → PutCommand with table + item', async () => {
    const { doc, client } = make();
    await client.put({ PK: 'ACTIVITY#1', SK: 'DETAILS', title: 'x' });
    expect(doc.commands[0]?.constructor).toBe(PutCommand.name);
    expect(doc.commands[0]?.input).toMatchObject({
      TableName: 'keiras-table',
      Item: { PK: 'ACTIVITY#1', SK: 'DETAILS', title: 'x' },
    });
  });

  it('get → GetCommand and unwraps Item (null on miss)', async () => {
    const { doc, client } = make([{ Item: { PK: 'A', SK: 'DETAILS', v: 1 } }, {}]);
    const found = await client.get('A', 'DETAILS');
    expect(doc.commands[0]?.constructor).toBe(GetCommand.name);
    expect(doc.commands[0]?.input).toMatchObject({ TableName: 'keiras-table', Key: { PK: 'A', SK: 'DETAILS' } });
    expect(found).toEqual({ PK: 'A', SK: 'DETAILS', v: 1 });
    expect(await client.get('A', 'DETAILS')).toBeNull();
  });

  it('delete → DeleteCommand', async () => {
    const { doc, client } = make();
    await client.delete('A', 'DETAILS');
    expect(doc.commands[0]?.constructor).toBe(DeleteCommand.name);
  });

  it('query → QueryCommand with begins_with and ScanIndexForward', async () => {
    const { doc, client } = make([{ Items: [{ PK: 'C', SK: 'NOTE#1' }], LastEvaluatedKey: undefined }]);
    const out = await client.query('COLLEGE#1', { skBeginsWith: 'NOTE#', ascending: false });
    const cmd = doc.commands[0]!;
    expect(cmd.constructor).toBe(QueryCommand.name);
    expect(cmd.input.KeyConditionExpression).toContain('begins_with');
    expect(cmd.input.ScanIndexForward).toBe(false);
    expect(cmd.input.IndexName).toBeUndefined();
    expect(out).toHaveLength(1);
  });

  it('queryIndex → QueryCommand with IndexName + BETWEEN, paginating LastEvaluatedKey', async () => {
    const { doc, client } = make([
      { Items: [{ GSI1PK: 'ACTIVITIES', GSI1SK: '2026-01-01#a' }], LastEvaluatedKey: { PK: 'x' } },
      { Items: [{ GSI1PK: 'ACTIVITIES', GSI1SK: '2026-01-02#b' }], LastEvaluatedKey: undefined },
    ]);
    const out = await client.queryIndex('GSI1', 'ACTIVITIES', { skBetween: ['2026-01-01', '2026-01-31'] });
    expect(doc.commands).toHaveLength(2); // followed pagination
    expect(doc.commands[0]?.input.IndexName).toBe('GSI1');
    expect(doc.commands[0]?.input.KeyConditionExpression).toContain('BETWEEN');
    expect(out).toHaveLength(2);
  });
});
