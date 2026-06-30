# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 設計ドキュメント

詳細は `docs/` を参照。

- [`docs/01_全体設計.md`](docs/01_全体設計.md) — フェーズ構成・技術スタック・データフロー・JSONスキーマ
- [`docs/02_詳細設計.md`](docs/02_詳細設計.md) — 各フェーズの実装詳細・関数仕様・未実装部分の設計
- [`docs/03_Excelフォーマット解析.md`](docs/03_Excelフォーマット解析.md) — 入力Excelの構造・チャネル色コード・パース方針

## ブランチ運用

| ブランチ | 用途 |
|---------|------|
| `main` | 安定版。動作確認済みのものだけ置く |
| `dev` | 普段の作業・試行錯誤はここ |

**Claude は常に `dev` ブランチで作業すること。**
`main` へのマージはユーザーが「main にマージして」と指示したときにPRを作成する。
マージ方法は通常マージ（fast-forward なし）を使用する。

### マージ提案のタイミング

以下のいずれかに該当したら、Claude から「そろそろ main にマージしませんか？」と提案すること：

- GitHub Issue が1つCloseされた（機能単位で動作確認済み）
- `dev` に意味のあるコミットが5件以上溜まった
- セッション終了前に、今回の作業が一段落したと判断できるとき

## 進捗管理

### GitHub Issues — タスクの完了/未完了管理
https://github.com/ume-t/ZEATS/issues

作業開始時にIssueをOpenのまま着手し、完了したらCloseする。
未完了タスクの一覧・優先順位・依存関係はIssueを参照すること。

### trial_log.md — セッション日誌（文脈の引き継ぎ）

**セッション終了前に必ず `trial_log.md` を更新すること。**

フォーマット（最新エントリを先頭に追記）:

```markdown
## YYYY-MM-DD — セッションN

### やったこと
- 試したこと・変更内容の箇条書き

### 結果
- 成功/失敗・気づいた問題点

### 次のアクション
- 次のセッションで最初にやること（具体的に）
```

Stop フック（`.claude/settings.json`）がセッション終了時に自動で `git commit & push` する。
更新を忘れると次のセッションで文脈が失われるため、必ず記録すること。

## 開発フェーズと現状

| フェーズ | ディレクトリ | 状態 |
|---------|------------|------|
| 1 ブラウザUI | `phase1_ui/` | 実装済み |
| 2 Python処理（Excel/PDF） | `phase2_python/` | 一部実装済み（`excel_importer.py` のみ） |
| 3 Electron化 | `phase3_electron/` | 未着手 |

未完了タスクの詳細は Issues #1〜#4 を参照。

`phase1_ui/` はビルドなし・依存なし。`index.html` をブラウザで直接開ける。

## 区分・採番を変更するとき

**座席区分を変更**: `phase1_ui/app.js` 冒頭の `CATEGORIES` 配列を編集する。
`id` はJSONキーになるため、既存データがある状態で変えると互換性が壊れる。

**チケット採番ロジック**: `app.js` の `assignTickets()` を変更する。
現状は `{prefix}{3桁ゼロ埋め連番}` 固定（例: `A001`）。

## Python環境

conda仮想環境 `zeats` を使用する。

```bash
conda run -n zeats python phase2_python/xxx.py
```

依存パッケージ：`openpyxl`、`reportlab`（zeats環境にインストール済み）

## 未確定事項

- チケット番号フォーマットルール → `assignTickets()` に反映（現状 `{prefix}{3桁連番}` 固定）
