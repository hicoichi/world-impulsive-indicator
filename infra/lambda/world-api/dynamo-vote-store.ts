// DynamoDB による VoteStore の実装。1つのテーブルに集計とセッションの記録を持つ
//
// | 種類         | pk                 | sk                  | 属性                                                         |
// |--------------|--------------------|---------------------|--------------------------------------------------------------|
// | 集計の枠     | COUNT#<衝動>       | B#<枠の開始時刻>    | votes（票数）、momentum（寄与度）、r_<地域>（地域ごとの寄与度）、expiresAt |
// | セッション   | SESSION#<ID>       | IMPULSE#<衝動>      | packed（投票記録を詰めた文字列。packed-votes.ts）、version、expiresAt |
//
// 寄与度は CONTRIBUTION_SCALE 倍の整数。地域は集計の枠にだけ加算し、セッションの記録には持たない。
// 投票記録は以前、票ごとのマップのリスト（votes）で持っていた。古い形の項目も読めるようにしている
// （TTL で12時間後に消えるため、2026-11-02 以降は不要になる）

import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { createImpulseRecord, isImpulseKey, type ImpulseKey } from '../../../shared/domain/impulse'
import { createRegionRecord, type RegionBucket } from '../../../shared/domain/region'
import type { CastVote } from '../../../shared/domain/vote'
import { packVotes, unpackVotes } from './packed-votes'
import type { BucketTotals, CommitVoteInput, CommitVoteResult, SessionVotes, VoteStore } from './vote-store'

/** 枠の開始時刻を文字列で並べ替えられるよう、桁をそろえる */
const BUCKET_KEY_DIGITS = 15

export function countKey(impulse: ImpulseKey): string {
  return `COUNT#${impulse}`
}

export function bucketKey(start: number): string {
  return `B#${String(start).padStart(BUCKET_KEY_DIGITS, '0')}`
}

export function sessionKey(sid: string): string {
  return `SESSION#${sid}`
}

export function impulseKey(impulse: ImpulseKey): string {
  return `IMPULSE#${impulse}`
}

export function regionAttribute(region: RegionBucket): string {
  return `r_${region}`
}

/** 古い形（票ごとのマップのリスト） */
function toCastVotes(value: unknown): CastVote[] {
  if (!Array.isArray(value)) return []
  return value.filter((vote): vote is CastVote =>
    typeof vote === 'object' && vote !== null
    && typeof (vote as CastVote).id === 'string' && typeof (vote as CastVote).at === 'number')
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function createDynamoVoteStore(client: DynamoDBDocumentClient, tableName: string): VoteStore {
  return {
    async getSessionVotes(sid) {
      const result = createImpulseRecord<SessionVotes>(() => ({ votes: [], version: 0 }))
      const response = await client.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': sessionKey(sid) },
        ConsistentRead: true,
      }))
      for (const item of response.Items ?? []) {
        const impulse = String(item.sk).replace(/^IMPULSE#/, '')
        if (!isImpulseKey(impulse)) continue
        result[impulse] = {
          votes: typeof item.packed === 'string' ? unpackVotes(item.packed) : toCastVotes(item.votes),
          version: typeof item.version === 'number' ? item.version : 0,
        }
      }
      return result
    },

    async commitVote(input: CommitVoteInput): Promise<CommitVoteResult> {
      const isNew = input.expectedVersion === 0
      try {
        await client.send(new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: {
                  pk: sessionKey(input.sid),
                  sk: impulseKey(input.impulse),
                  packed: packVotes(input.votes),
                  version: input.expectedVersion + 1,
                  expiresAt: input.sessionExpiresAt,
                },
                // 読み取ってから保存するまでに別の投票が入っていたら競合として読み直す
                ConditionExpression: isNew ? 'attribute_not_exists(pk)' : 'version = :version',
                ExpressionAttributeValues: isNew ? undefined : { ':version': input.expectedVersion },
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: { pk: countKey(input.impulse), sk: bucketKey(input.bucketStart) },
                UpdateExpression: 'ADD votes :one, momentum :units, #region :units SET expiresAt = if_not_exists(expiresAt, :expiresAt)',
                ExpressionAttributeNames: { '#region': regionAttribute(input.region) },
                ExpressionAttributeValues: { ':one': 1, ':units': input.contributionUnits, ':expiresAt': input.bucketExpiresAt },
              },
            },
          ],
        }))
        return 'committed'
      }
      catch (error) {
        const conflicted = error instanceof TransactionCanceledException
          && (error.CancellationReasons ?? []).some(reason => reason.Code === 'ConditionalCheckFailed')
        if (conflicted) return 'conflict'
        throw error
      }
    },

    async sumBuckets(impulse, fromBucket) {
      const totals: BucketTotals = { votes: 0, contributionUnits: 0, regionUnits: createRegionRecord(() => 0) }
      let startKey: Record<string, unknown> | undefined
      do {
        const response = await client.send(new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND sk >= :from',
          ExpressionAttributeValues: { ':pk': countKey(impulse), ':from': bucketKey(fromBucket) },
          ExclusiveStartKey: startKey,
        }))
        for (const item of response.Items ?? []) {
          totals.votes += numberOf(item.votes)
          totals.contributionUnits += numberOf(item.momentum)
          totals.regionUnits = createRegionRecord(bucket => totals.regionUnits[bucket] + numberOf(item[regionAttribute(bucket)]))
        }
        startKey = response.LastEvaluatedKey
      } while (startKey)
      return totals
    },
  }
}
