# infra

World API のバックエンド（AWS CDK、TypeScript）。規約は [`.claude/rules/infra.md`](../.claude/rules/infra.md)、設計は [`docs/world-api-design.md`](../docs/world-api-design.md) を参照。

## コマンド

このディレクトリで実行する。

| コマンド | 内容 |
|---|---|
| `npm ci` | 依存関係のインストール |
| `npm run build` | 型チェック |
| `npm test` | テスト（Jest）。`../shared/domain` のテストも含む |
| `npm run synth -- -c stage=dev` | CloudFormation テンプレートの合成（AWS には接続しない） |
| `npx cdk diff -c stage=dev` | デプロイ済みの環境との差分 |
| `npx cdk deploy -c stage=dev` | デプロイ。**実行前に必ずユーザーの承認を得る** |

`stage` は `dev`／`prod`。省略すると `dev`。

初回のデプロイ前に、署名用の鍵を SSM パラメータストアに作る必要がある。手順は [`.claude/rules/infra.md`](../.claude/rules/infra.md) の「初回だけ手元で行うこと」を参照。
