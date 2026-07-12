// Tests for the conditional single-use write primitive `putIf`, across implementers:
//   • DynamoTableClient — asserts the PutCommand carries a ConditionExpression and maps a
//     DynamoDB ConditionalCheckFailedException to a typed ConditionFailedError.
//   • InMemoryTableClient — asserts pending-or-absent succeeds and a stale status rejects.
// This is what makes the FamilyInvite single-use claim atomic (a second claim loses).

import { describe, expect, it } from 'vitest';
import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InMemoryTableClient } from './memory-client.js';
import { ConditionFailedError, DynamoTableClient, type StoredItem } from './table-client.js';

/** Fake document client: records commands and can be primed to reject the next send. */
class FakeDoc {
  readonly commands: { constructor: string; input: Record<string, unknown> }[] = [];
  constructor(private readonly rejectWith?: Error) {}
  send(command: { constructor: { name: string }; input: Record<string, unknown> }): Promise<Record<string, unknown>> {
    this.commands.push({ constructor: command.constructor.name, input: command.input });
    if (this.rejectWith) return Promise.reject(this.rejectWith);
    return Promise.resolve({});
  }
}

const conditionalCheckFailed = (): Error => {
  const err = new Error('The conditional request failed');
  err.name = 'ConditionalCheckFailedException';
  return err;
};

const make = (rejectWith?: Error) => {
  const doc = new FakeDoc(rejectWith);
  const client = new DynamoTableClient('keiras-table', doc as unknown as DynamoDBDocumentClient);
  return { doc, client };
};

const invite = (over: Partial<StoredItem> = {}): StoredItem => ({
  PK: 'INVITE_FAMILY#abc',
  SK: 'DETAILS',
  status: 'pending',
  ...over,
});

describe('DynamoTableClient.putIf', () => {
  it('sends a PutCommand with a ConditionExpression (attribute_not_exists OR equals)', async () => {
    const { doc, client } = make();
    await client.putIf(invite({ status: 'accepted' }), { attr: 'status', equals: 'pending' });
    const cmd = doc.commands[0]!;
    expect(cmd.constructor).toBe(PutCommand.name);
    expect(cmd.input.TableName).toBe('keiras-table');
    expect(cmd.input.ConditionExpression).toBe('attribute_not_exists(#a) OR #a = :v');
    expect(cmd.input.ExpressionAttributeNames).toMatchObject({ '#a': 'status' });
    expect(cmd.input.ExpressionAttributeValues).toMatchObject({ ':v': 'pending' });
  });

  it('maps ConditionalCheckFailedException to a typed ConditionFailedError', async () => {
    const { client } = make(conditionalCheckFailed());
    await expect(
      client.putIf(invite({ status: 'accepted' }), { attr: 'status', equals: 'pending' }),
    ).rejects.toBeInstanceOf(ConditionFailedError);
  });

  it('rethrows other errors unchanged', async () => {
    const other = new Error('throttled');
    other.name = 'ProvisionedThroughputExceededException';
    const { client } = make(other);
    await expect(client.putIf(invite(), { attr: 'status', equals: 'pending' })).rejects.toBe(other);
  });
});

describe('InMemoryTableClient.putIf', () => {
  it('succeeds when the item is absent', async () => {
    const c = new InMemoryTableClient();
    await c.putIf(invite(), { attr: 'status', equals: 'pending' });
    expect((await c.get('INVITE_FAMILY#abc', 'DETAILS'))?.status).toBe('pending');
  });

  it('succeeds when the stored status still equals the expected value', async () => {
    const c = new InMemoryTableClient();
    await c.put(invite({ status: 'pending' }));
    await c.putIf(invite({ status: 'accepted' }), { attr: 'status', equals: 'pending' });
    expect((await c.get('INVITE_FAMILY#abc', 'DETAILS'))?.status).toBe('accepted');
  });

  it('rejects with ConditionFailedError when the stored status differs', async () => {
    const c = new InMemoryTableClient();
    await c.put(invite({ status: 'accepted' }));
    await expect(
      c.putIf(invite({ status: 'accepted' }), { attr: 'status', equals: 'pending' }),
    ).rejects.toBeInstanceOf(ConditionFailedError);
  });
});
