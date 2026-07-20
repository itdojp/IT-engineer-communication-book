# Canonical content migration evidence

- Source Issue: #149
- Baseline main: `257ec443042f691ebe1741446fb8aca7f3ff1818`
- Contract: `src/<path>/index.md` → `docs/<path>/index.md`（byte-exact）
- Public route: path変更なし

## Batch inventory

| batch | source Issue | files | baseline result | migration action |
|---|---:|---:|---|---|
| `pilot-137` | #137 | 3 | exact 3 / drift 0 | PR #148の契約を維持 |
| `full-content-149` | #149 | 14 | exact 11 / drift 3 | 現行公開`docs`の3差分を`src`へ取り込み、全17 mappingをgate対象化 |

manifestの`files`は全17 mappingを列挙し、各fileは一つのmigration batchだけに所属する。site implementationの除外scopeもmanifestに列挙する。

## Baseline drift classification

| path | public `docs`の状態 | authoring sourceへの移行 |
|---|---|---|
| `chapter-communication-challenges/index.md` | code block内のtab/indent/fenceが修正済み | `docs`を`src`へbyte-exactに取り込み |
| `chapter-digital-communication/index.md` | YAML/code例の運用・security境界注記を追加済み | `docs`を`src`へbyte-exactに取り込み |
| `chapter-structured-communication/index.md` | T4/T1を選ぶ条件が明確 | `docs`を`src`へbyte-exactに取り込み |

このmigrationでは公開`docs`の本文、front matter、relative linkを変更しない。

## Verification contract

```bash
npm ci
npm run test:content-sync
npm run check:content-drift
npm test
npm run build
npm run check:content-drift
# 次の2行は変更をcommitした後のclean checkout / CIで実行する
git diff --exit-code -- src docs
test -z "$(git status --porcelain --untracked-files=all -- src docs)"
```

追加確認:

- manifest validationのnegative/convergence fixture
- pinned book-formatterのUnicode / textlint / links / layout / Markdown structure
- PR/main Book QA、Pages
- navigation全routeのHTTP 200、代表marker、asset

## Rollback evidence and gates

- merge前: canonical `src`を修正して`npm run sync:content`を再実行する。
- merge後・下流本文PRなし: #149 merge commitをrevertし、pilot manifest/toolingを復元する。
- merge後・下流本文PRあり: 下流PRを先に停止/revertし、byte-exact stateを確認してから#149をrevertする。
- rollback後: drift gate、Book QA、Pages、全navigation route、代表markerを再確認する。
- `docs`だけを直接修正する復旧は禁止する。
