# World API 設計

> 状態：**設計は確定し、バックエンドは実装済み・未デプロイ（2026-11-01）**。実装はこのリポジトリの `infra/` と `shared/domain/`。

## 1. 決定事項（2026-11-01）

- **集計は姉妹アプリと分ける。** このアプリの票は姉妹アプリの数値に混ざらず、逆も同じ。
- **姉妹アプリが使っている既存の API は据え置く**（ルート・応答・挙動・スタックを変えない）。
- **このアプリ専用の新しい API（以下 World API）を作る。** 位置情報の付与と寄与度の調整に対応した投票（POST）と集計の取得（GET）を持つ。
- **スタックごと分離する**（API Gateway・DynamoDB などを姉妹アプリと共有しない）。共有案との比較は §7。
- **World API はこのリポジトリで管理する**（当初は姉妹リポジトリに置く案だったが変更した）。

## 2. 構成

```
画面（このリポジトリ、GitHub Pages）
  → CloudFront → API Gateway HTTP API → Lambda（1関数） → DynamoDB（1テーブル）

姉妹アプリ：ImpulsiveMomentumBackend-<stage>（姉妹リポジトリ）… 一切変更しない
このアプリ：ImpulsiveWorldBackend-<stage>（このリポジトリ）
```

### コードの置き場所

| 場所 | 内容 |
|---|---|
| `infra/lib/world-backend-stack.ts` | スタック本体 |
| `infra/lib/api-settings.ts` | CORS、ルートごとの流量上限、テーブルの処理量の上限、キャッシュ秒数、署名鍵のパラメーター名 |
| `infra/lib/github-deploy-stack.ts` | GitHub Actions 用のデプロイロール（OIDC プロバイダーは姉妹リポジトリのものを参照） |
| `infra/lambda/world-api/` | ハンドラー・ルーティング・集計・DynamoDB の実装。`session-token.ts`・`buckets.ts` は姉妹リポジトリ（ad63920）からの複製 |
| `shared/domain/` | 画面と Lambda で共有する純粋ロジック：`impulse.ts`、`vote.ts`（上限・ウィンドウ）、`contribution.ts`（寄与度）、`region.ts`（地域） |

### 分離するもの

| 項目 | 姉妹アプリ | World API |
|---|---|---|
| スタック ID | `ImpulsiveMomentumBackend-<stage>` | `ImpulsiveWorldBackend-<stage>` |
| デプロイ用ロールのスタック | `ImpulsiveMomentumGithubDeploy`（OIDC プロバイダーも作る） | `ImpulsiveWorldGithubDeploy`（ロールだけ） |
| 署名鍵（SSM） | `/impulsive-momentum-indicator/<stage>/session-signing-key` | `/world-impulsive-indicator/<stage>/session-signing-key`（別の鍵。トークンを相互に使えなくし、投票上限も分ける） |
| localStorage のキー | `impulsive-momentum-indicator:session-token` | `world-impulsive-indicator:session-token` |
| タグ `Project` | `impulsive-momentum-indicator` | `world-impulsive-indicator` |
| 予算アラート | あり（アカウント全体） | 作らない |

- CORS：`https://hicoichi.github.io`（dev は `http://localhost:3000` も）。

## 3. エンドポイント

ルートには版を付ける（`/v1/...`）。既存 API と同じく、セッションは `X-Session-Token` ヘッダーの匿名トークン。

| ルート | 認証 | 内容 |
|---|---|---|
| `GET /v1/state` | なし | 衝動ごとの集計（有効投票数、寄与度の合計、地域ごとの分布）。CloudFront で数秒キャッシュ |
| `POST /v1/sessions` | なし | 匿名セッションの発行 |
| `GET /v1/sessions/me` | トークン | 残り投票枠 |
| `POST /v1/votes` | トークン | 投票（任意で地域コード付き） |

### `POST /v1/votes`

```jsonc
// 要求
{ "impulse": "festival", "voteId": "…", "region": "kanto" }   // region は省略可（位置情報を許可しなかった場合）

// 応答 200
{ "result": "accepted", "token": "…", "remaining": { "ikki": 10, "exodus": 10, "festival": 7 } }
// 上限 409 / トークン無効 401 / 不正な入力 400 は既存 API と同じ
```

- `region` は**クライアントで丸めた地域コード**だけを送る。緯度経度はサーバーに送らない（粒度は Q-06）。
- `region` は8地方のコード（`shared/domain/region.ts`）。省略または `null` なら `unknown` に集計する。それ以外の値（`unknown` の直接指定、都道府県、座標など）は 400。

### `GET /v1/state`

```jsonc
{
  "impulses": {
    "festival": {
      "votes": 1234,          // 有効投票数（表示用の実数。USM：表示数値は有効投票数）
      "momentum": 812.5,      // 寄与度の合計（演出の強さに使う。Q-07）
      "regions": { "hokkaido": 0, "tohoku": 12.4, "kanto": 410.0, …, "kyushu": 30.2, "unknown": 182.0 }  // 地域ごとの寄与度。8地方＋unknown を常にすべて返す（地球上の演出の配置に使う。Q-06）
    },
    "ikki": { … }, "exodus": { … }
  }
}
```

## 4. 寄与度調整の考え方

USM：「投票回数と集計上の寄与度を分離し、エンターテインメント性と集計の信頼性を両立させる」。

- 投票回数（上限10票/12時間/衝動）は既存と同じ。
- 1セッションの、ある衝動に対する**ウィンドウ内の n 票目の寄与度を w(n)** とし、n が増えるほど小さくする。
- 検討した案（**平方根を採用**。Q-07a）

| 案 | w(1)…w(10) | 1人の最大寄与 |
|---|---|---|
| 一律（現状と同じ） | 1, 1, …, 1 | 10 |
| 逓減 | 1, 0.5, 0.33, …（1/n） | 約 2.93 |
| **平方根（採用）** | √n − √(n−1) | √10 ≒ 3.16 |
| 初票のみ重く | 1, 0.1, 0.1, … | 1.9 |

- 票ごとの寄与度は投票時に決まり、集計の枠に加算する（1/1000 単位の整数で保存。`shared/domain/contribution.ts`）。
- 古い票がウィンドウから外れると n が小さくなるため、次の票の寄与度は再び大きくなる。
- 12時間経過で票が外れると、その票の寄与度も外れる（既存の5分枠の仕組みを踏襲）。

## 5. データモデル（TTL あり）

| 種類 | pk | sk | 属性 |
|---|---|---|---|
| 集計の枠 | `COUNT#<衝動>` | `B#<枠の開始時刻>` | `votes`、`momentum`、`r_<地域>`（地域ごとの寄与度）、`expiresAt` |
| セッション | `SESSION#<ID>` | `IMPULSE#<衝動>` | `votes`（投票記録：ID・時刻。**地域は持たない**）、`version`、`expiresAt` |

- 上限判定とセッション記録・集計の加算は、既存と同じく1つのトランザクションで行う。
- 地域は集計の枠にだけ加算し、セッション（個人）とは結び付けて保存しない。個人の投票と地域を後から結び付けられない形にする。
- IP アドレス・トークン・地域をログに残さない。

## 6. 決定事項（2026-11-01、提案どおり確定）

| ID | 内容 | 決定 |
|---|---|---|
| Q-06a | 地域の粒度 | 8地方（北海道・東北・関東・中部・近畿・中国・四国・九州沖縄）。都道府県は人口の少ない県で個人が推定されやすい |
| Q-06b | 緯度経度 → 地域の変換場所 | クライアント（地方の境界の簡易データを同梱）。サーバーに座標を送らない |
| Q-06c | 地域ごとの値を画面に数値で出すか | 出さない。地球上の演出の配置・強さにだけ使う（USM 非対象「地域別の詳細な分析」） |
| Q-07a | 寄与度の関数 | 平方根（√n − √(n−1)）。1人の連打の影響を約3票分に抑えつつ、毎回少しずつ効く |
| Q-07b | 画面に出す数値は `votes`（有効投票数）か `momentum` か | `votes`（USM の集計方針どおり）。演出の強さは `momentum` から決める |
| Q-12 | 姉妹アプリの既存 API に、将来このアプリの機能を戻すか | 戻さない（据え置き） |
| Q-13 | 流量上限・DynamoDB の処理量の上限 | 既存と同じ値から始める。最悪の月額は既存と同程度が加わる |
| Q-14 | デプロイのワークフロー | このリポジトリの `.github/workflows/infra.yml` で World のスタックだけをデプロイする（管理場所の変更に伴い変更） |

## 7. スタック構成の比較（2026-11-01 検討）

API Gateway・DynamoDB を姉妹アプリと共有する案と比較し、分離を選んだ。

| 観点 | スタックごと分離（採用） | API Gateway・DynamoDB を共有 |
|---|---|---|
| 平常時のコスト | ほぼ 0（どのサービスも従量課金で固定費なし。リクエスト単価も同じ） | 同じ |
| 最悪の場合の合計 | 上限が2つ分。World 側の上限を下げれば調整できる | 1つ分に収まる（上限を共有） |
| 既存 API の据え置き | 既存スタックに差分が出ない | ルート・ステージ・CloudFront に差分が出る |
| 影響の分離 | 片方が上限に達しても、もう片方は動く | 片方の急増で、もう片方も制限される |
| 削除・作り直し | World 側だけ消せる | 既存からの切り離しが要る |
| 管理するリソース数 | 2倍 | 1つずつ |

- Lambda レイヤーは使わない。esbuild で1ファイルにまとめており、共通コードはソースの import で共有できるため。
- 1スタックの最悪月額（`POST /v1/votes` が毎秒10件で1か月続いた場合）の概算は約 $130（東京リージョン、記憶ベースの単価。確定には料金ページで要確認）。流量上限は姉妹アプリと同じ値から始めている（Q-13）。
