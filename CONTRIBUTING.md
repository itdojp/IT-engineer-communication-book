# コントリビューションガイド

株式会社アイティードゥ（ITDO Inc.）の書籍プロジェクトへのご協力ありがとうございます。

## 📋 コントリビューション方針

### 非営利コントリビューション
以下のコントリビューションは歓迎いたします。

- **誤字脱字の修正**
- **技術的な間違いの指摘**
- **翻訳・多言語化**
- **アクセシビリティ改善**
- **学習効果向上のための提案**

### 商用利用を伴うコントリビューション

商用目的でのコントリビューション（企業研修での利用等）をお考えの場合は、
事前に commercial_license Issue での相談をお願いいたします。

## 🤝 コントリビューション手順

1. **Issue作成** - 改善提案や問題報告
2. **Fork & Clone** - リポジトリをフォーク
3. **ブランチ作成** - 作業用ブランチを作成
4. **変更実装** - 修正・改善を実装
5. **プルリクエスト** - 変更内容を提出
6. **レビュー** - 内容確認・調整
7. **マージ** - 変更の取り込み

## 📝 ライセンス同意

コントリビューションを行うことで、以下に同意したものとみなします。

- コントリビューション内容が CC BY-NC-SA 4.0 で提供されること
- 株式会社アイティードゥが商用ライセンス契約において当該コントリビューション内容を利用できること

## 📞 お問い合わせ

**株式会社アイティードゥ（ITDO Inc.）**  
Email: knowledge@itdo.jp

## Canonical authoring source

chapter / appendix本文は`src/`を正本とし、同じ相対pathの`docs/`は公開用の生成結果です。対象mappingは`src/canonical-content.json`で確認できます。本文を変更する場合は`src/`を編集し、`npm run sync:content`で同期してから`npm run check:content-drift`を実行してください。manifest対象の`docs/`を直接編集してはいけません。

`docs/_config.yml`、navigation、layout、asset、公開topなどのsite implementationは本文生成の対象外であり、責務ごとに直接管理します。migrationとrollbackの契約は`decisions/0001-canonical-authoring-source.md`、batch証跡は`decisions/0002-canonical-content-migration-evidence.md`を参照してください。
