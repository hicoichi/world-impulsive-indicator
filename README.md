# world-impulsive-indicator

世界の空気を、衝動で測る。

「一揆したい」「国外脱出したい」「祭りたい」の3つの衝動に投票し、その集計を衝動ごとに独立した地球の姿として可視化する Web アプリ。

- 姉妹プロジェクト [impulsive-momentum-indicator](https://github.com/hicoichi/impulsive-momentum-indicator) と同じ思想・同じ投票仕様で、フロントエンドを作り直したもの。
- 集計は姉妹プロジェクトと別。このアプリ専用のバックエンド（World API、AWS CDK）をこのリポジトリの `infra/` で管理する。

## ドキュメント

- [ユーザーストーリーマップ](docs/user-story-map.md)
- [World API 設計](docs/world-api-design.md)
- [infra（バックエンド）](infra/README.md)
- 開発ルール：[CLAUDE.md](CLAUDE.md)、[.claude/rules/](.claude/rules/)

## 状態

- バックエンド：実装済み・未デプロイ
- フロントエンド：UI モック作成中（未着手）
