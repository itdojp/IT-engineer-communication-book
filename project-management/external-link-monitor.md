# 外部リンク監視 Runbook

## 目的と実行契約

外部HTTP(S)参照は、PRの決定的な内部リンク検査から分離し、`.github/workflows/external-link-monitor.yml`で毎週水曜日と手動実行時に監視する。外部サービスの一時障害をPR mergeの条件にはしない。

監視対象はcanonical `src/**/*.md`のMarkdown link、autolink、HTML `a[href]`から抽出する。URLは正規化・重複排除し、source fileとline、重複回数をJSON artifactへ記録する。SVGの`xmlns`やcode block内のURLはlinkではないため対象外とする。

主要な「次に読む」導線は`.external-link-monitor.json`の`requiredUrls`に固定する。canonical本文からURLが消えた場合は、ネットワークprobe前のconfiguration/infrastructure errorとして検出する。

## 分類と通知

| 分類 | 条件 | scheduled workflow |
|---|---|---|
| `success` / `redirect` | 最終応答が2xx | 成功 |
| `permanent` | 404 / 410 | finding（exit 1） |
| `policy-error` | redirect上限、Location欠落、HTTPS downgrade等 | finding（exit 1） |
| `transient` | timeout、network error、408 / 425 / 429 / 5xx | 証跡を残して成功。次回再確認 |
| `restricted` | 404 / 410以外の4xx | bot制限候補として証跡を残して成功 |
| infrastructure/configuration | source/config/report生成などmonitor自体の失敗 | exit 2 |

workflowはJSONとMarkdownをartifactへ常に保存し、MarkdownをStep Summaryへ追加する。exit 1とexit 2は区別してjob logへ表示する。`schedule` / `workflow_dispatch`専用であり、pull request eventやrequired checkには接続しない。

HTTPSからHTTPへのdowngrade redirectは既定で拒否する。resolverがlegacy HTTPの中間hopを返した後にHTTPSへ復帰する既知URLだけ、`request.httpsToHttpAllowlist`へexact URLと理由を記録する。この例外はredirectの追跡だけを許可し、最終statusの分類や証跡を免除しない。

`localhost`、loopback、link-local、private IP literal等は`allowPrivateTargets: false`でprobe前に拒否する。self-testのlocal HTTP serverだけがin-memory configで例外を使用し、tracked production configでは有効化しない。

## 手動確認

```bash
npm run test:external-links
npm run check:external-links
gh workflow run external-link-monitor.yml --repo itdojp/IT-engineer-communication-book --ref main
```

`test:external-links`はlocal HTTP serverだけを使い、required URLの存在/欠落、重複排除、redirect、retry後の復旧、404、410、継続的503、findingなしを検証する。`check:external-links`は実ネットワークへ接続するため、PR required QAには含めない。

## false positiveの抑制

bot accessだけが拒否され、ブラウザまたは一次情報の代替確認で参照先が有効な場合に限り、`.external-link-monitor.json`の`ignore`へexact URL、理由、期限を追加する。

```json
{
  "url": "https://example.com/reference",
  "reason": "Provider blocks automated requests; manually verified on YYYY-MM-DD",
  "expires": "YYYY-MM-DD"
}
```

- wildcard、domain全体、無期限ignoreは使用しない。
- ignore URLがcanonical本文に存在しない、重複する、期限切れの場合はmonitor infrastructure/configuration failureとする。
- 期限到来前にブラウザ、公式の移転案内、代替一次URLを再確認する。移転済みなら本文を修正し、ignoreを削除する。
- 404 / 410はignoreせず、移転先確認または参照削除をsource Issueで処理する。
- transient/restrictedが3回連続した場合はartifactを比較し、手動確認日と判断をIssueへ記録する。
