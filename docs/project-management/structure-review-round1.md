# 構成レビュー（Round1）

対象（参照した主なファイル）
- `docs/index.md`
- `docs/src/chapter-quickstart/index.md`
- `docs/src/chapter-engineering-communication/index.md` ほか `docs/src/chapter-*/index.md`
- `docs/_data/navigation.yml`
- `LICENSE.md`

## 1. 書籍の概要

- 想定読者: `docs/index.md` より、対人スキルに課題を感じる初級〜初中級エンジニア（「システム思考とデータ駆動で身につける」前提）。
- 本書のゴール: コミュニケーションを「再現可能な設計・運用」として扱い、技術説明・調整・メンタル管理までを体系化する（`docs/index.md` より）。
- 入口（読者導線）の現状:
  - リポジトリトップの `README.md` からオンライン版（GitHub Pages）と目次に誘導できる。
  - `docs/index.md` の章リンクは `src/.../` に統一されており、GitHub Pages のURL構造と整合している。
  - 一方で、`docs/_data/navigation.yml` 側に実体と一致しないパスが含まれるため、サイドバー/prev-next のリンク切れリスクがある（後述）。

## 2. 現状の章構成サマリ

### 第1章: クイックスタートガイド（`docs/src/chapter-quickstart/index.md`）
- 狙い / 主なトピック: すぐ試せる改善法（PREP法など）と、効果測定・次アクション。
- 学習目標: 「読了時間/実践開始/効果実感」など、行動ベースで提示。

### 第2章: エンジニアリング思考とコミュニケーション（`docs/src/chapter-engineering-communication/index.md`）
- 狙い / 主なトピック: 認知特性、コミュニケーションのシステムモデル、メンタルヘルスとパフォーマンス、認知バイアス、フロー状態。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第3章: エンジニア特有のコミュニケーション課題（`docs/src/chapter-communication-challenges/index.md`）
- 狙い / 主なトピック: 技術者間の特徴、非技術者とのギャップ、組織階層での情報伝達。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第4章: 構造化コミュニケーション手法（`docs/src/chapter-structured-communication/index.md`）
- 狙い / 主なトピック: RFC形式、PREP法、段階的詳細化、デバッグ思考、実践演習。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第5章: ステークホルダー別コミュニケーション戦略（`docs/src/chapter-stakeholder-communication/index.md`）
- 狙い / 主なトピック: チーム内討議、PM/ビジネス連携、顧客/ベンダ対応（SLA、障害対応等）。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第6章: デジタルコミュニケーション最適化（`docs/src/chapter-digital-communication/index.md`）
- 狙い / 主なトピック: リモート協働、会議効率、ドキュメント/ナレッジ管理、チャット運用。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第7章: エンジニア特有のストレス要因分析（`docs/src/chapter-stress-analysis/index.md`）
- 狙い / 主なトピック: 技術的ストレス、組織/人間関係ストレス、個人特性由来ストレス。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第8章: 技術的アプローチによるメンタルヘルス管理（`docs/src/chapter-technical-mental-health/index.md`）
- 狙い / 主なトピック: システム思考でのメンタル設計、データ駆動モニタリング、個人アジャイル適用。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第9章: 予防的メンタルヘルスシステム構築（`docs/src/chapter-preventive-systems/index.md`）
- 狙い / 主なトピック: 予防システム設計、個人/チームレベルの予防システム。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第10章: 技術リーダーシップとコミュニケーション（`docs/src/chapter-technical-leadership/index.md`）
- 狙い / 主なトピック: 技術的意思決定と合意形成（テンプレート例を含む）。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

### 第11章: キャリア開発とセルフブランディング（`docs/src/chapter-career-development/index.md`）
- 狙い / 主なトピック: キャリア設計、セルフブランディング、コミュニティでの影響力構築。
- 学習目標: `## 学習目標と章の位置づけ` に記載あり。

## 3. 構成上の気になる点（候補）

- 付録の扱い:
  - `docs/index.md` に付録の見出しはあるが、リンクや本文ファイルが見当たらない（未作成なら目次から外す/「今後追加予定」と明記する等が必要）。
- ナビゲーションデータ:
  - `docs/_data/navigation.yml` の `path` が `docs/src/` のディレクトリ名と一致しない項目がある（例: `chapter-engineering-communication` 相当のパス表記が揺れている）。

## 4. 構成改善の提案（案）

- ナビゲーションの整合:
  - `docs/_data/navigation.yml` の `path` を `docs/src/` のディレクトリ名に合わせ、サイドバー/prev-next のリンク切れを防ぐ。
- 付録の方針確定:
  - 付録を作るなら、ページ作成とリンク追加までをセットで行う。作らないなら目次から外し、読者を迷わせない。
