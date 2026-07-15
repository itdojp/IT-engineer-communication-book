---
title: "ADR 0001: canonical authoring source と公開docs"
layout: book
---

# ADR 0001: canonical authoring source と公開docs

- Status: accepted
- Date: 2026-07-15

## Decision

`src/`をauthoring source、`docs/`をreader-facing generated outputとする。初回pilotは付録1、付録2、第1章Quickstartの3ファイルに限定する。`docs/`のpilot対象は手編集せず、`node scripts/sync-pilot.js --write`で`src/`から生成する。

`docs/_config.yml`、layout、asset、navigationなどのsite implementationはgenerated contentの対象外であり、維持管理する。

## Contract

- canonical: `src/<pilot-path>`
- generated: `docs/<pilot-path>`
- command: `node scripts/sync-pilot.js --check` / `--write`
- `--check`は差分があれば非0終了し、CIで実行する
- buildはcanonical sourceを削除・上書きしない
- 手編集可能なのは`src/`とsite implementation。pilotの`docs/`は手編集禁止
- migrationはpilot成功後に別Issueで段階的に行う

## Rollback and exceptions

生成結果に問題がある場合は、merge前なら`src/`を修正して再生成する。merge後は直前のmerge commitへrevertし、公開URLとnavigationを確認する。front matter・relative linkを含むexact matchを原則とし、例外はこのADRとmanifestへ明記する。legacyのpilot外`src/`は当面維持し、後続移行Issueで扱う。
