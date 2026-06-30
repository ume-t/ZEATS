# Trial Log

セッションごとに「何を試したか・結果・次のアクション」を記録する。
最新のエントリが先頭に来るよう追記すること。

---

## 2026-06-30 — セッション4

### やったこと
- `phase2_python/server.py` を実装（Issue #3）
  - Flask を使用（requirements.txt に追加）
  - `POST /import-excel`：multipart Excel → JSON
  - `POST /export-excel`：JSON → .xlsx バイナリ
  - `POST /export-pdf`：JSON → .pdf バイナリ
  - CORS ヘッダー（`Access-Control-Allow-Origin: *`）
  - エラー処理（file なし・JSON 不正 → 400）
  - 一時ファイルを使い finally で確実に削除
- Flask test client で全エンドポイント + エラー系テスト通過
- Issue #3 Close、`dev` にプッシュ

### 結果
- 3エンドポイントすべて正常動作（xlsx/pdf のマジックバイトも確認）
- `after_this_request` が Flask 3.x で廃止されていたため、
  メモリ読み込み方式（bytes で返す）に切り替えて解決

### 次のアクション
- Issue #1〜#3 完了済み → dev → main マージ（ユーザーの指示待ち）
- Issue #4 Electron 化の実装

---

## 2026-06-30 — セッション3

### やったこと
- `phase2_python/pdf_exporter.py` を実装（Issue #2）
  - `export_pdf(data, output_path)` 関数
  - reportlab canvas API でA4横置きグリッド描画
  - 日本語フォント（HeiseiKakuGo-W5）で block 名・シート名を表示
  - 凡例（カテゴリ名・色スウォッチ）を各シート上部に描画
  - 区分色で座席セルを塗りつぶし、チケット番号 or 座席番号を表示
  - 改ページ処理（ブロックが収まらない場合は次ページへ）
- ダミーデータ・複数シートでテスト通過
- Issue #2 Close、`dev` にプッシュ

### 結果
- PDF生成・フォント描画・改ページいずれも正常動作
- `大阪フォーマット.xlsx` での実動作確認はローカルで行う

### 次のアクション
- Issue #1・#2 の dev → main マージ（ユーザーが「マージして」と指示次第）
- Issue #3 `server.py` の実装を開始

---

## 2026-06-30 — セッション2

### やったこと
- `phase2_python/excel_exporter.py` を実装（Issue #1）
  - `export_excel(data, output_path)` 関数
  - `#RRGGBB` → `FFRRGGBB` ARGB変換 + `PatternFill` 適用
  - チケット番号採番済みならセル値に表示、未採番は座席番号を表示
  - ブロックを縦積みで配置するレイアウト
- ダミーデータでユニットテスト全通過
- Issue #1 Close、`dev` にプッシュ

### 結果
- 色・値ともに正しく出力されることをテストで確認
- `大阪フォーマット.xlsx` での実動作確認はローカル環境でユーザーが行う

### 次のアクション
- Issue #2 `pdf_exporter.py` の実装を開始
  - reportlab の canvas API でグリッド描画
  - `export_pdf(data, output_path)` 関数から着手

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
