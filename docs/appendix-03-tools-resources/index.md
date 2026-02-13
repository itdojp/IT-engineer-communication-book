---
title: "付録3：ツール・リソース一覧"
description: "コミュニケーションの運用を支えるツールとリソース"
layout: book
order: 15
---

# 付録3：ツール・リソース一覧

この付録は、本文で扱う「デジタルコミュニケーション基盤」を実装する際に検討しやすいよう、カテゴリ別に整理した一覧である。具体的な採用可否は、組織のセキュリティ要件・運用負荷・コストに依存する。

## カテゴリ別一覧（例）

### リアルタイム（同期）

- ビデオ会議: Zoom / Google Meet / Microsoft Teams
- チャット: Slack / Microsoft Teams / Discord
- 音声通話: Slack Huddle / Teams 通話 / 固定電話（エスカレーション用）

### 非同期

- ドキュメント/ナレッジ: Confluence / Notion / GitBook / 社内Wiki
- リポジトリ/レビュー: GitHub / GitLab / Bitbucket
- 課題管理/プロジェクト管理: Jira / Linear / GitHub Projects / Trello / Asana

### 図解・合意形成

- ホワイトボード: Miro / FigJam / Microsoft Whiteboard
- 図の作成: Mermaid / draw.io（diagrams.net）/ Figma

### 運用・可観測性（通知と状況共有）

- 監視/アラート: Prometheus / Grafana / Datadog / CloudWatch
- インシデント管理: PagerDuty / Opsgenie /（オンコール運用の仕組み）
- ステータス共有: Statuspage / 社内ステータスページ

### 検索・発見

- 全文検索: 社内検索基盤 / ナレッジ検索機能
- タグ/分類: タグ体系（運用ルール）/ 情報アーキテクチャ設計

### 生成AI（任意）

- 要約/議事録支援: 会議録画＋文字起こし＋要約（機密区分に注意）
- チケット/文章の下書き: Context Package テンプレに沿った生成（人間のレビュー前提）

## 選定の観点（チェックリスト）

- セキュリティ: SSO/監査ログ/データ保持/持ち出し制御
- 運用: 管理コスト、権限設計、アーカイブ方針、通知疲れ対策
- 統合: API連携、Webhook、通知ルール、同一IDでのアクセス
- 検索性: スレッド/リンク/タグ/命名規則、横断検索の可否
- 定着: トレーニング、ガイドライン、最小ルール（やりすぎない）
