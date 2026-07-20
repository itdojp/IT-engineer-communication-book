---
title: "ADR 0001: canonical authoring source と公開docs"
layout: book
---

# ADR 0001: canonical authoring source と公開docs

- Status: accepted
- Date: 2026-07-15
- Full-content migration: 2026-07-20（Issue #149）

## Decision

chapter / appendix本文は`src/<path>/index.md`をauthoring source、同じ相対pathの`docs/<path>/index.md`をreader-facing generated outputとする。対象mappingの正本は`src/canonical-content.json`である。本文は`src/`だけを編集し、`npm run sync:content`で`docs/`へbyte-exactに同期する。

`docs/_config.yml`、`docs/_data/`、`docs/_includes/`、`docs/_layouts/`、`docs/assets/`、`docs/Gemfile`、`docs/book-config.json`、`docs/index.md`はsite implementationまたは公開入口であり、本文生成の対象外とする。これらは責務ごとのIssueで直接管理する。

## Contract

- canonical: manifestに列挙した`src/<path>`
- generated: 同じ相対pathの`docs/<path>`
- command: `npm run check:content-drift` / `npm run sync:content`
- `check:content-drift`はmanifest不正、canonical/generated contentの欠落・未登録、mapping重複、path逸脱、byte driftで非0終了する
- `sync:content`は全targetをpreflightし、途中のwrite/verification failureでは変更済みtargetを元のbyte列へrollbackする
- CIはbuild前後にdriftを確認し、buildがtracked `src` / `docs`を変更した場合も失敗する
- 手編集可能なのはcanonical `src`と、manifestで除外したsite implementationのみである
- front matter、relative link、本文を含むbyte-exact matchを原則とし、例外mappingはmanifestとmigration evidenceへ記録する

## Migration batches

1. `pilot-137`: 付録1、付録2、Quickstartの3ファイル。Issue #137 / PR #148で確定した。
2. `full-content-149`: 残るchapter / appendix 14ファイル。開始時点の11ファイルはexact match、3ファイルは現行公開`docs`の意図した修正を`src`へ取り込んだ。公開`docs`自体は変更しない。

batchとfile mapping、開始SHAは`src/canonical-content.json`、差分分類と検証手順は`decisions/0002-canonical-content-migration-evidence.md`を正本とする。

## Rollback and exceptions

生成結果に問題がある場合、merge前は`src`を修正して再同期する。merge後かつ後続のcanonical本文PRがない場合は、#149のmerge commitをrevertし、pilot契約へ戻したうえでmain CI、Pages、navigation routeを確認する。

#149後のcanonical本文PRがmerge済みの場合は、先に影響する下流PRを停止・revertし、`src`と`docs`がbyte-exactなcommitへ戻してからmigration commitをrevertする。`docs`だけを手編集して復旧しない。例外が必要な場合は、対象path、owner、期限、再同期条件をmanifestとIssueへ記録する。
