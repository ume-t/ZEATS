# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 設計ドキュメント

詳細は `docs/` を参照。

- [`docs/01_全体設計.md`](docs/01_全体設計.md) — フェーズ構成・技術スタック・データフロー・JSONスキーマ
- [`docs/02_詳細設計.md`](docs/02_詳細設計.md) — 各フェーズの実装詳細・関数仕様・未実装部分の設計

## 開発フェーズと現状

| フェーズ | ディレクトリ | 状態 |
|---------|------------|------|
| 1 ブラウザUI | `phase1_ui/` | 実装済み |
| 2 Python処理（Excel/PDF） | `phase2_python/` | 未着手 |
| 3 Electron化 | `phase3_electron/` | 未着手 |

`phase1_ui/` はビルドなし・依存なし。`index.html` をブラウザで直接開ける。

## 区分・採番を変更するとき

**座席区分を変更**: `phase1_ui/app.js` 冒頭の `CATEGORIES` 配列を編集する。
`id` はJSONキーになるため、既存データがある状態で変えると互換性が壊れる。

**チケット採番ロジック**: `app.js` の `assignTickets()` を変更する。
現状は `{prefix}{3桁ゼロ埋め連番}` 固定（例: `A001`）。

## 未確定事項

- Excelフォーマット → `phase2_python/excel_importer.py` の実装に必要
- チケット番号フォーマットルール → `assignTickets()` に反映
- 座席区分の種類・数 → `CATEGORIES` 配列を更新
