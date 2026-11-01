---
paths:
  - "infra/**"
  - "shared/**"
  - ".github/workflows/infra.yml"
  - "docs/world-api-design.md"
---

# インフラ・バックエンド規約（AWS CDK）

このアプリ専用のバックエンド（World API）を AWS CDK（TypeScript）で `infra/` に置く。設計は `docs/world-api-design.md`。コーディングの基本は `.claude/rules/coding-standard.md` に従い、ここではインフラ固有の決まりを定める。

姉妹リポジトリ `../impulsive-momentum-indicator` の `infra/`（2026-11-01、コミット ad63920）を元に作った。構成・規約はそちらに揃えている。

## 最重要：AWS への操作

- **`cdk deploy`／`cdk destroy`／`cdk bootstrap`、および AWS のリソースを変更する CLI 操作は、実行のたびにユーザーの承認を得る。** 一度の承認を次の実行に流用しない。
- `cdk synth`、`cdk diff`、テストは承認なしで実行してよい（`cdk diff` は AWS の読み取りのみ）。
- デプロイ前には `cdk diff` の結果をユーザーに示し、特にリソースの置き換え・削除がないかを確認する。
- アクセスキー・シークレット・アカウント ID をコード、`cdk.json`、コミットに含めない。

## 姉妹アプリとの境界（同じ AWS アカウントを使う）

- **姉妹アプリのスタック（`ImpulsiveMomentumBackend-<stage>`、`ImpulsiveMomentumGithubDeploy`）を変更・参照・削除しない。** このリポジトリの cdk コマンドでは、必ず `ImpulsiveWorld*` のスタックを指定する。
- 例外：GitHub の OIDC プロバイダーはアカウントに1つしか作れないため、姉妹リポジトリの `ImpulsiveMomentumGithubDeploy` が作ったものを ARN で参照している（`infra/lib/github-deploy-stack.ts`）。姉妹側のスタックを消すと、こちらの GitHub Actions からのデプロイも止まる。
- 予算アラート（AWS Budgets、アカウント全体が対象）は姉妹リポジトリにあるため、ここでは作らない。
- 名前が衝突しないよう、次を姉妹アプリと分ける。

| 項目 | このリポジトリ |
|---|---|
| スタック ID | `ImpulsiveWorldBackend-<stage>`、`ImpulsiveWorldGithubDeploy` |
| タグ `Project` | `world-impulsive-indicator` |
| 署名鍵（SSM） | `/world-impulsive-indicator/<stage>/session-signing-key` |
| ルート | `/v1/...`（姉妹アプリは `/counts` など。版付きにして区別する） |

## リポジトリ内の構成

| 場所 | 責務 |
|---|---|
| `infra/bin/infra.ts` | CDK アプリの入口。ステージの決定、タグ付け、スタックの生成だけを行う |
| `infra/lib/` | スタックと設定。1ファイル1クラス、ファイル名は kebab-case |
| `infra/lambda/world-api/` | Lambda（1関数）。ルーティング（`app.ts`）、集計・投票（`vote-service.ts`）、DynamoDB（`dynamo-vote-store.ts`）、トークン（`session-token.ts`）、5分枠（`buckets.ts`） |
| `infra/test/` | CDK・Lambda・`shared/domain` のテスト |
| `shared/domain/` | 画面と Lambda で共有する純粋なロジック（衝動、上限・ウィンドウ、寄与度、地域）。Nuxt 4 の `shared/` ディレクトリの規約に合わせて置く |

- 依存関係は `infra/package.json` で管理し、ルートの `package.json`（画面。未作成）と混ぜない。npm コマンドは `infra/` で実行する。
- **仕様値とドメインロジックは `shared/domain/` を唯一の正とし、Lambda からはそれを import する。** バックエンドに同じ判定を書き直さない。
- `shared/domain/` には Vue・Nuxt・ブラウザ API・Node.js 固有の API に依存するコードを置かない（画面と Lambda の両方で動くこと）。
- Lambda から `app/`（画面）を import しない。
- 画面を作るまでは、`shared/domain/` のテストも `infra/test/shared/` で Jest で行う。画面のテスト環境（Vitest）ができたら移すか判断する。

## 技術

| 項目 | 内容 |
|---|---|
| CDK | v2（`aws-cdk-lib`、`constructs`）。CLI（`aws-cdk`）は `infra/` の devDependencies に固定し、`npx cdk` で使う |
| 言語 | TypeScript 7 系（strict）。姉妹リポジトリと同じ |
| 実行 | `tsx`（`cdk.json` の `app`） |
| テスト | Jest ＋ `@swc/jest`。CDK のテスト補助機能が Jest 専用のため |
| Lint／整形 | 画面のプロジェクト（`@nuxt/eslint`）を作ったら、ルートの ESLint で `infra/`・`shared/` も対象にする。それまでは型チェックとテストのみ。書式はセミコロンなし、シングルクォート |

- import は `aws-cdk-lib/core`、`aws-cdk-lib/aws-dynamodb` のようにサービス単位で行う。
- 新しい依存を追加するときは、tech-stack.md の「依存関係の追加ルール」に従い、事前に確認する。

## ステージとアカウント

- ステージは `dev`／`prod`。cdk コマンドの `-c stage=<値>` で指定し、省略時は `dev`。不正な値はエラーにする（`infra/lib/stage.ts`）。
- アカウントとリージョンはコードに書かず、実行時の AWS 設定から受け取る。リージョンは姉妹アプリと同じ `ap-northeast-1`（`infra.yml`）。
- ステージによる違いは、スタックの props で受け取ったステージから決める。コンストラクトの中で `tryGetContext` を読まない。

## 命名とタグ

- コンストラクト ID：PascalCase で役割を表す名前（例：`VotesTable`）。デプロイ後に ID を変えるとリソースが置き換わるため、安易に変えない。
- 物理名（`tableName`、`functionName` など）は指定せず、CDK に生成させる。
- すべてのリソースに `Project` と `Stage` のタグを付ける（`bin/infra.ts`）。

## コンストラクトの書き方

- L2 を優先する。L1（`Cfn*`）は L2 で設定できない場合に限り、理由をコメントに書く。
- 権限は grant メソッドで最小権限を付与する。`*` を含むポリシーを手書きしない。

## データとセキュリティ

- DynamoDB の削除ポリシー：`prod` は `RETAIN`（削除保護・ポイントインタイムリカバリあり）、`dev` は `DESTROY`。
- 外部に公開する API にはスロットリングを設定する。投票上限の判定はサーバー側で必ず行い、クライアントの判定を信用しない。
- ログの保持期間を明示する（dev 1週間、prod 1か月）。

### 位置情報（USM Activity 6、docs/world-api-design.md Q-06）

- **サーバーが受け取るのは8地方のコードだけ。** 緯度経度・都道府県・住所を受け取る口を作らない。知らない値は 400 で拒否する。
- 地域は集計の枠（`COUNT#…` の `r_<地域>`）にだけ加算する。**セッションの記録（個人）に地域を保存しない。** 個人と地域を後から結び付けられない形を保つ。
- セッションの投票記録は `packed`（票 ID と秒の時刻を詰めた1本の文字列）で持ち、項目を小さく保つ。DynamoDB の書き込み単位（＝費用・処理量）は項目の大きさで決まるため。
- 地域・トークン・リクエスト本文・IP アドレスをログに残さない。API Gateway のアクセスログは有効にしない。
- これらはテストで検証している（`app.test.ts`、`dynamo-vote-store.test.ts`、`vote-service.test.ts`）。

### 寄与度（USM Activity 5、Q-07）

- n 票目の寄与度は `shared/domain/contribution.ts` の √n − √(n−1)。1/1000 単位の整数で保存・加算する。
- 画面に表示する数値は有効投票数（`votes`）。寄与度（`momentum`）は演出の強さにだけ使う。実際の票数を水増しした値を返さない。
- 寄与度の関数を変えると、変更前後の票が混ざった状態が最大12時間続く。変える場合はユーザーの承認を得る。

## Lambda

- `NodejsFunction` で作り、esbuild でバンドルする（Docker を使わない）。AWS SDK も同梱する。
- ランタイムは Node.js 24、arm64。
- ハンドラーはイベントの解釈と応答の組み立てに専念し、判定ロジックは `shared/domain/` の純粋関数を呼ぶ。
- 時刻・乱数・AWS SDK のクライアントは引数で受け取れるようにし、テストで差し替える。
- 環境変数で受け取る設定は、起動時に1か所で読み取り、未設定なら起動時にエラーにする。

## API の守ること

- **キャッシュするのは `GET /v1/state` だけ。** セッションを扱う応答には `Cache-Control: no-store` を付け、CloudFront の既定の振る舞いはキャッシュしない（他人の残り枠を返さないため）。
- `GET /v1/state` は認証なしで呼べるようにする（トークンをキャッシュの条件に含めない）。
- セッショントークンは `X-Session-Token` ヘッダーで受け取る。`Authorization` は CloudFront の転送の制約があるため使わない。
- 上限の判定とセッションの記録・集計の加算は、DynamoDB のトランザクションで同時に行う。競合したら読み直す。
- 流量上限・DynamoDB の処理量の上限は、費用の上限も兼ねる。値を変えるときは最悪の月額への影響を説明してから変える。
- **応答の形式を変えるときは後方互換にする**（項目の追加はよいが、削除・意味の変更はしない）。互換性のない変更は `/v2` を作る。

## テスト

- スタックごとに `aws-cdk-lib/assertions` の `Template` で、重要なプロパティを個別に検証する。スナップショットだけに頼らない。
- `prod` と `dev` で設定が変わる箇所は、両方のステージでテストする。
- ハンドラーは AWS に接続せずに単体テストする。
- 変更後は `infra/` で `npm run build`、`npm test`、`npm run synth -- -c stage=dev` を実行し、通ってから完了とする。

## コミットするもの・しないもの

- コミットする：`cdk.json`、`cdk.context.json`（作られた場合）、`package-lock.json`。
- コミットしない：`cdk.out/`、`node_modules/`、ビルドされた `.js`／`.d.ts`（`infra/.gitignore` で除外済み）。

## デプロイ

### 通常のデプロイ：GitHub Actions（`.github/workflows/infra.yml`）

- main への push と PR のうち、`infra/**`・`shared/domain/**`・`infra.yml` が変わったときに検査（型チェック・テスト・合成）が動く。
- デプロイは **main への push で、かつ GitHub の変数 `AWS_DEPLOY_ROLE_ARN` が設定されているときだけ**。OIDC でロールを引き受け、`cdk diff` を残してから `ImpulsiveWorldBackend-dev` を `cdk deploy` する。
- **`AWS_DEPLOY_ROLE_ARN` を設定した後は、main への push がそのまま AWS の変更になる。** infra に影響する変更を push する前に、ローカルで `cdk diff` の結果をユーザーに示して承認を得る。
- デプロイ先は今は `dev` だけ。

### 初回だけ手元で行うこと

どれも AWS を変更する操作なので、実行前に内容（`cdk diff` など）を示してユーザーの承認を得る。

1. 署名用の鍵を SSM パラメータストアに SecureString で作る（姉妹アプリとは別の鍵）。
   ```bash
   aws ssm put-parameter --type SecureString \
     --name /world-impulsive-indicator/<stage>/session-signing-key \
     --value "$(openssl rand -base64 48)"
   ```
   鍵を入れ替えると、すべてのトークンが無効になり、全員のセッションが新しくなる（上限もリセットされる）。
2. CDK の初期設定（bootstrap）は姉妹アプリで済んでいる（同じアカウント・リージョン）。別のアカウント・リージョンを使う場合だけ `npx cdk bootstrap` を実行する。
3. デプロイ用ロールを作る：`npx cdk deploy ImpulsiveWorldGithubDeploy`。出力 `DeployRoleArn` を、このリポジトリの GitHub の変数 `AWS_DEPLOY_ROLE_ARN` に設定する。姉妹アプリの OIDC プロバイダーが存在することが前提。
4. 初回のバックエンドを作る（手元からでも Actions からでもよい）：`npx cdk deploy ImpulsiveWorldBackend-<stage> -c stage=<stage>`。出力 `ApiBaseUrl` を画面のビルド時の `NUXT_PUBLIC_API_BASE_URL` に使う。

### デプロイ用ロールの権限

デプロイ用ロールは、CDK の初期設定で作られたロール（`cdk-hnb659fds-*`）を引き受けることだけを許可している。ただし、その先で CloudFormation が使う実行ロールは既定で管理者権限を持つため、**main ブランチで動くワークフローは、実質的にこのアカウントの任意のリソース（姉妹アプリのものを含む）を変更できる。** main への push 権限を持つ人を限ること。

### 実装上の注意

- IAM の説明文（ロールの `description` など）は ASCII などに限られ、日本語を使うとデプロイ時の検証でエラーになる。英語で書く。

## 未確定事項

- prod ステージを作るか、作るなら AWS アカウントを分けるか（今は dev だけ）。
