// DynamoDB による VoteStore の実装。1つのテーブルに集計とセッションの記録を持つ
//
// | 種類         | pk                          | sk                           | 属性                                                         |
// |--------------|-----------------------------|------------------------------|--------------------------------------------------------------|
// | 集計の枠     | COUNT#[<対象>#]<衝動>       | B#<枠の開始時刻>             | votes（票数）、momentum（寄与度）、r_<地域>（地域ごとの寄与度）、expiresAt |
// | セッション   | SESSION#<ID>                | IMPULSE#[<対象>#]<衝動>      | packed（投票記録を詰めた文字列。packed-votes.ts）、version、expiresAt |
//
// オリジナル版（world）のキーには対象を入れない。対象を足す前（2026-11-15 以前）のデータをそのまま使うため
// （docs/world-api-design.md §8.3）。それ以外の対象は `<対象>#` を前に付ける。
// 寄与度は CONTRIBUTION_SCALE 倍の整数。地域は集計の枠にだけ加算し、セッションの記録には持たない。
// 位置情報を使わない対象（函南町版）は r_<地域> を書かない。
// 投票記録は以前、票ごとのマップのリスト（votes）で持っていた。古い形の項目も読めるようにしている
// （TTL で12時間後に消えるため、2026-11-02 以降は不要になる）

import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import { QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { createRegionRecord, type RegionBucket } from '../../../shared/domain/region'
import { createTargetImpulseRecord, DEFAULT_TARGET, type TargetKey } from '../../../shared/domain/target'
import type { CastVote } from '../../../shared/domain/vote'
import { packVotes, unpackVotes } from './packed-votes'
import type { BucketTotals, CommitVoteInput, CommitVoteResult, SessionVotes, VoteStore } from './vote-store'

/** 枠の開始時刻を文字列で並べ替えられるよう、桁をそろえる */
const BUCKET_KEY_DIGITS = 15

/** オリジナル版は対象を付けない（既存のキーのまま）。それ以外は `<対象>#<衝動>` */
function scoped(target: TargetKey, impulse: string): string {
  return target === DEFAULT_TARGET ? impulse : `${target}#${impulse}`
}

export function countKey(target: TargetKey, impulse: string): string {
  return `COUNT#${scoped(target, impulse)}`
}

export function bucketKey(start: number): string {
  return `B#${String(start).padStart(BUCKET_KEY_DIGITS, '0')}`
}

export function sessionKey(sid: string): string {
  return `SESSION#${sid}`
}

export function impulseKey(target: TargetKey, impulse: string): string {
  return `IMPULSE#${scoped(target, impulse)}`
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

/** 集計の枠の加算式。地域がなければ（位置情報を使わない対象）地域の属性を書かない */
function bucketUpdate(region: RegionBucket | null): { UpdateExpression: string, ExpressionAttributeNames?: Record<string, string> } {
  if (region === null) {
    return { UpdateExpression: 'ADD votes :one, momentum :units SET expiresAt = if_not_exists(expiresAt, :expiresAt)' }
  }
  return {
    UpdateExpression: 'ADD votes :one, momentum :units, #region :units SET expiresAt = if_not_exists(expiresAt, :expiresAt)',
    ExpressionAttributeNames: { '#region': regionAttribute(region) },
  }
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function createDynamoVoteStore(client: DynamoDBDocumentClient, tableName: string): VoteStore {
  return {
    async getSessionVotes(sid, target) {
      const result = createTargetImpulseRecord<SessionVotes>(target, () => ({ votes: [], version: 0 }))
      // sk から、この対象の衝動を引く（別の対象の記録は読み飛ばす）
      const impulseBySortKey = new Map(Object.keys(result).map(impulse => [impulseKey(target, impulse), impulse]))
      const response = await client.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': sessionKey(sid) },
        ConsistentRead: true,
      }))
      for (const item of response.Items ?? []) {
        const impulse = impulseBySortKey.get(String(item.sk))
        if (impulse === undefined) continue
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
                  sk: impulseKey(input.target, input.impulse),
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
                Key: { pk: countKey(input.target, input.impulse), sk: bucketKey(input.bucketStart) },
                ...bucketUpdate(input.region),
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

    async sumBuckets(target, impulse, fromBucket) {
      const totals: BucketTotals = { votes: 0, contributionUnits: 0, regionUnits: createRegionRecord(() => 0) }
      let startKey: Record<string, unknown> | undefined
      do {
        const response = await client.send(new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND sk >= :from',
          ExpressionAttributeValues: { ':pk': countKey(target, impulse), ':from': bucketKey(fromBucket) },
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
