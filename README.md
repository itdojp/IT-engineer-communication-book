# エンジニアのための実践コミュニケーション設計

システム思考とデータ駆動で身につける対人スキルとメンタル管理。

## Phase 6 実務コミュニケーション運用ゲート

本書のチェックリストやテンプレートをチーム運用へ適用する前に、次を確認してください。

- **目的と文脈**: 何を決める/伝える/相談するのか、背景と制約を分けている。
- **責任分界**: 依頼者、判断者、レビュー担当、実行担当、次回更新者が明確である。
- **非同期運用**: 期限、返信期待、判断に必要なリンク、エスカレーション条件を明示している。
- **記録とフィードバック**: 決定事項、未決事項、次アクション、振り返り観点を残している。

## オンライン版（推奨）

- https://itdojp.github.io/IT-engineer-communication-book/

## まず読む場所

- 導入章: [クイックスタートガイド](docs/chapter-quickstart/index.md)（短時間で効果を出すための最小実践）
- 本編の起点: [エンジニアリング思考とコミュニケーション](docs/chapter-engineering-communication/index.md)（本書の出発点）

## 目次

- `docs/index.md`（オンライン版の目次ページと同内容）

## 品質ゲート（ローカル）

```bash
npm run check:content-drift
npm run check:metadata
npm run test:metadata-ux
npm run test:external-links
npm test
npm run build
```

`test:metadata-ux` は一時copyのUX module flagを1件だけ反転し、source checkerが不一致を検出することを確認します。`build`はJekyll生成後の`docs/_site/book-config.json`についても、canonicalなUX profileと全module flagsの一致を検査します。

外部HTTP(S)参照はPR QAから分離し、scheduled/manual workflowで監視します。local HTTP serverによる決定的な分類testは`test:external-links`、実ネットワークprobeは`npm run check:external-links`です。分類・artifact・一時ignoreの保守手順は[`project-management/external-link-monitor.md`](project-management/external-link-monitor.md)を参照してください。

実行内容:

- `src` canonical contentと公開`docs`のbyte-exact drift検証
- メタデータ / ナビゲーション整合性検証
- Markdown lint
- `docs/` に対するリンク検証

chapter / appendix本文は`src/`を編集し、`npm run sync:content`で`docs/`へ同期します。mappingとsite implementationの除外scopeは[`src/canonical-content.json`](src/canonical-content.json)を参照してください。

## ライセンス

- `LICENSE.md`（Creative Commons BY-NC-SA 4.0 / シリーズ統一ライセンス準拠）
