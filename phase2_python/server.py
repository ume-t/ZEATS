"""
Electron向けローカルHTTPサーバー。

エンドポイント:
  POST /import-excel  multipart file → JSON (layout + seats + categories)
  POST /export-excel  JSON body      → .xlsx ファイル
  POST /export-pdf    JSON body      → .pdf  ファイル
  POST /save-colors   JSON body      → 区分色適用済み .xlsx ファイル

起動:
  python server.py          # ポート5000（デフォルト）
  python server.py 8080     # ポート指定

Electron の main.js から子プロセスとして起動する想定。
"""

import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, request

# server.py と同じディレクトリにある各モジュールを import
_HERE = Path(__file__).parent
sys.path.insert(0, str(_HERE))

from color_saver import apply_colors_to_excel
from excel_exporter import export_excel
from excel_importer import parse_excel
from pdf_exporter import export_pdf
from seat_colorizer import apply_seat_and_legend_colors

app = Flask(__name__)

# 最後にインポートされた Excel ファイルの情報（セッション中に保持）
_last_imported: dict = {'path': None, 'original_name': 'import.xlsx'}


@app.after_request
def _cors(response: Response) -> Response:
    """Electron レンダラーからのリクエストを許可する。"""
    response.headers['Access-Control-Allow-Origin']  = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


@app.route('/import-excel', methods=['OPTIONS'])
def import_excel_preflight() -> Response:
    return _cors(Response(status=204))


@app.route('/import-excel', methods=['POST'])
def import_excel_endpoint() -> Response:
    """
    multipart/form-data で Excel ファイルを受け取り、JSONを返す。

    フォームキー: file
    """
    if 'file' not in request.files:
        return jsonify({'error': 'file フィールドが見つかりません'}), 400

    uploaded = request.files['file']
    suffix = Path(uploaded.filename or 'upload.xlsx').suffix or '.xlsx'

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        uploaded.save(tmp_path)

    try:
        data = parse_excel(tmp_path)
    except Exception:
        os.unlink(tmp_path)
        raise

    # インポートファイルをセッション中保持（/save-colors で使用）
    if _last_imported['path'] and os.path.exists(_last_imported['path']):
        os.unlink(_last_imported['path'])
    _last_imported['path'] = tmp_path
    _last_imported['original_name'] = Path(uploaded.filename or 'import.xlsx').stem

    return jsonify(data)


@app.route('/export-excel', methods=['OPTIONS'])
def export_excel_preflight() -> Response:
    return _cors(Response(status=204))


@app.route('/export-excel', methods=['POST'])
def export_excel_endpoint() -> Response:
    """
    JSON ボディを受け取り、色付き Excel ファイルを返す。
    元ファイルが保持されている場合はそれをベースに座席色を適用する。
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'JSON ボディが不正です'}), 400

    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
        tmp_path = tmp.name

    try:
        src = _last_imported['path']
        if src and os.path.exists(src):
            apply_seat_and_legend_colors(src, tmp_path, data)
        else:
            export_excel(data, tmp_path)
        with open(tmp_path, 'rb') as f:
            xlsx_bytes = f.read()
    finally:
        os.unlink(tmp_path)

    return Response(
        xlsx_bytes,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename=seat-layout.xlsx'},
    )


@app.route('/export-pdf', methods=['OPTIONS'])
def export_pdf_preflight() -> Response:
    return _cors(Response(status=204))


@app.route('/export-pdf', methods=['POST'])
def export_pdf_endpoint() -> Response:
    """
    JSON ボディを受け取り、座席表 PDF ファイルを返す。
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'JSON ボディが不正です'}), 400

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
        tmp_path = tmp.name

    try:
        export_pdf(data, tmp_path)
        with open(tmp_path, 'rb') as f:
            pdf_bytes = f.read()
    finally:
        os.unlink(tmp_path)

    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': 'attachment; filename=seat-layout.pdf'},
    )


@app.route('/save-colors', methods=['OPTIONS'])
def save_colors_preflight() -> Response:
    return _cors(Response(status=204))


@app.route('/save-colors', methods=['POST'])
def save_colors_endpoint() -> Response:
    """
    JSON ボディ {"colors": {"区分名": "#RRGGBB", ...}} を受け取り、
    最後にインポートした Excel の凡例セルに色を適用して返す。
    ファイル名: {元ファイル名}_{YYYYMMDDHHMMSS}.xlsx
    """
    if not _last_imported['path'] or not os.path.exists(_last_imported['path']):
        return jsonify({'error': 'インポート済みのExcelファイルがありません'}), 400

    body = request.get_json(silent=True)
    if body is None or 'colors' not in body:
        return jsonify({'error': 'JSON ボディに "colors" が必要です'}), 400

    color_map: dict = body['colors']
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    out_name = f"colors_{timestamp}.xlsx"

    with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
        out_path = tmp.name

    try:
        apply_colors_to_excel(_last_imported['path'], out_path, color_map)
        with open(out_path, 'rb') as f:
            xlsx_bytes = f.read()
    finally:
        os.unlink(out_path)

    return Response(
        xlsx_bytes,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename="{out_name}"'},
    )


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    print(f'ZEATS server starting on http://localhost:{port}')
    app.run(host='127.0.0.1', port=port, debug=False)
