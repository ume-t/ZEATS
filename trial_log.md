# Trial Log

セッションごとに「何を試したか・結果・次のアクション」を記録する。
最新のエントリが先頭に来るよう追記すること。

---

## 2026-06-30 — セッション1

### やったこと
- GitHub Issues でタスク管理を構築
  - #1 `excel_exporter.py`（色付きExcel出力）
  - #2 `pdf_exporter.py`（座席表PDF出力）
  - #3 `server.py`（ローカルHTTPサーバー）
  - #4 Electron化
- `trial_log.md` + Stop フックを追加設定
- `CLAUDE.md` に進捗管理の方針を追記

### 結果
- Issues #1〜#4 作成完了
- `.claude/settings.json` に Stop フックを追加（セッション終了時に trial_log.md を自動 commit & push）
- 進捗管理の仕組みが整った

### 次のアクション
- Issue #1 `excel_exporter.py` の実装を開始
  - `export_excel(data: dict, output_path: str)` 関数を実装
  - `#RRGGBB` → `FFRRGGBB`（ARGB）変換と `PatternFill` の適用から着手
