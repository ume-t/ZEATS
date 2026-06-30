"""
ExcelファイルをZEATSのJSONデータに変換するモジュール。

対応フォーマット: 大阪フォーマット.xlsx
  - シートごとに座席ブロックが横方向に展開
  - セルの値=座席番号(整数)、背景色=販売チャネル
  - C列に行ラベル('N列')、'ブロック'含む文字列セルがブロックヘッダー

色マッチング戦略:
  1. 凡例A列の色と座席色が完全一致 → そのまま使用
  2. 不一致の場合（アウトレットサイドの事務局など）→ 凡例の枚数と
     座席色の出現数が一致するカウントベースマッチングで補完
  3. 凡例に存在しない独自色（テーブル席など）→ EXTRA_COLOR_MAPPINGS で補完
"""

import json
import re
from collections import Counter
import openpyxl

SKIP_SHEETS = {'全体図'}

# 凡例に記載のない独自色とチャネルIDの対応（シートをまたいで適用）
# テーブル席では標準凡例と異なる色で事務局・ふるさと納税が使われている
EXTRA_COLOR_MAPPINGS: dict[str, str] = {
    'FFFAE2D5': '事務局',       # テーブル席の事務局色
    'FFFBE2D5': 'ふるさと納税',  # テーブル席のふるさと納税色
}

SHEET_SHORT_NAMES = {
    'マーブルビーチサイド': 'マーブル',
    'アウトレットサイド':   'アウトレット',
    'テーブル席':           'テーブル',
    'テーブル席（追加）':   'テーブル追加',
}


def _rgb(cell) -> str | None:
    """セルの背景色をARGB文字列で返す。塗りなし・透明はNone。"""
    if cell.fill and cell.fill.patternType not in (None, 'none'):
        rgb = cell.fill.fgColor.rgb
        if rgb and rgb not in ('00000000', ''):
            return rgb
    return None


def _parse_count(value) -> int | None:
    """凡例B列の値を整数に変換。数式文字列は評価せずNoneを返す。"""
    if isinstance(value, (int, float)):
        return int(value)
    return None  # 数式文字列('=...')はカウントなし扱い


def _find_legend(ws) -> tuple[list[dict], dict[str, str]]:
    """
    凡例行（A列に文字+色、B列に数値or数式）を走査しチャネル情報を返す。
    戻り値: (categories_list, {legend_rgb: channel_id})
    """
    categories = []
    color_to_id: dict[str, str] = {}

    for row in ws.iter_rows(max_col=3):
        a = row[0]
        b = row[1] if len(row) > 1 else None
        if not (a.value and isinstance(a.value, str)):
            continue
        rgb = _rgb(a)
        if not rgb:
            continue
        # B列が数値か数式文字列なら凡例行とみなす
        b_val = b.value if b else None
        b_is_count = (isinstance(b_val, (int, float)) or
                      (isinstance(b_val, str) and b_val.startswith('=')))
        if not b_is_count:
            continue

        channel_id = a.value.strip()
        if channel_id in color_to_id.values():
            continue  # 重複スキップ

        count = _parse_count(b_val)  # 数式の場合はNone
        hex_color = '#' + rgb[2:]    # ARGBのAA部分を除去
        categories.append({
            'id':    channel_id,
            'name':  channel_id,
            'color': hex_color,
            '_rgb':  rgb,
            '_count': count,
        })
        color_to_id[rgb] = channel_id

    return categories, color_to_id


def _build_color_map(ws, categories: list[dict],
                     legend_color_to_id: dict[str, str]) -> dict[str, str]:
    """
    座席セルの色と凡例を突き合わせて完全なcolor→idマップを返す。

    1次: 凡例A列の色と座席色が完全一致
    2次（フォールバック）: 凡例A列の色が座席に存在しない場合、
                           凡例の枚数と座席色の出現数が完全一致するものを照合
                           ※アウトレットサイドの事務局色ズレへの対処
    """
    # 全座席セルの色をカウント
    seat_color_counts: Counter = Counter()
    for row in ws.iter_rows():
        for cell in row:
            if cell.value is not None and isinstance(cell.value, int):
                rgb = _rgb(cell)
                if rgb:
                    seat_color_counts[rgb] += 1

    color_to_id = dict(legend_color_to_id)

    # 凡例色が実際の座席に存在するかチェック
    legend_colors_in_seats = set(seat_color_counts.keys()) & set(legend_color_to_id.keys())

    # 未マッチの座席色（凡例にない色）
    unmatched_seat_colors = {c: n for c, n in seat_color_counts.items()
                             if c not in color_to_id}

    # フォールバック: 凡例色が座席に存在しないチャネルをカウントで補完
    for cat in categories:
        if cat['_rgb'] in legend_colors_in_seats:
            continue  # 色で既にマッチ済み
        count = cat['_count']
        if count is None:
            continue
        exact = [c for c, n in unmatched_seat_colors.items() if n == count]
        if len(exact) == 1:
            color_to_id[exact[0]] = cat['id']
            del unmatched_seat_colors[exact[0]]

    # 3次: EXTRA_COLOR_MAPPINGS で残った未マッチ色を補完
    for rgb, channel_id in EXTRA_COLOR_MAPPINGS.items():
        if rgb not in color_to_id:
            color_to_id[rgb] = channel_id

    return color_to_id


def _find_block_headers(ws) -> list[tuple[int, int, str]]:
    """'ブロック'を含む文字列セルを走査して (row, col, name) のリストを返す。"""
    headers = []
    for row in ws.iter_rows():
        for cell in row:
            if (cell.value and isinstance(cell.value, str)
                    and 'ブロック' in cell.value):
                headers.append((cell.row, cell.column, cell.value.strip()))
    return headers


def _find_row_labels(ws) -> dict[int, int]:
    """C列の 'N列' パターンセルから {excel_row: 列番号} を返す。"""
    labels: dict[int, int] = {}
    for cell in ws['C']:
        if cell.value and isinstance(cell.value, str):
            m = re.fullmatch(r'(\d+)列', cell.value.strip())
            if m:
                labels[cell.row] = int(m.group(1))
    return labels


def _find_section_headers(ws) -> list[tuple[int, str]]:
    """
    A列のテキストセルから (row, section_name) を返す。
    凡例行（B列に数値/式あり）は除外。
    """
    headers = []
    for row in ws.iter_rows(max_col=2):
        a = row[0]
        b = row[1] if len(row) > 1 else None
        if not (a.value and isinstance(a.value, str)):
            continue
        b_val = b.value if b else None
        b_is_count = (isinstance(b_val, (int, float)) or
                      (isinstance(b_val, str) and b_val.startswith('=')))
        if b_is_count:
            continue
        headers.append((a.row, a.value.strip()))
    return headers


def _resolve_block(cell_row: int, cell_col: int,
                   block_headers: list[tuple[int, int, str]],
                   section_headers: list[tuple[int, str]]) -> str | None:
    """座席セルに対して最も近い上・左のブロック名を返す。"""
    # ブロックヘッダー優先: col ≤ cell_col AND row ≤ cell_row で最近傍
    candidates = [(r, c, n) for r, c, n in block_headers
                  if c <= cell_col and r <= cell_row]
    if candidates:
        max_r = max(x[0] for x in candidates)
        same_r = [x for x in candidates if x[0] == max_r]
        return max(same_r, key=lambda x: x[1])[2]

    # セクションヘッダーで代替: row ≤ cell_row で最近傍
    candidates_s = [(r, n) for r, n in section_headers if r <= cell_row]
    if candidates_s:
        return max(candidates_s, key=lambda x: x[0])[1]

    return None


def _parse_sheet(ws, short_name: str,
                 color_to_id: dict[str, str]) -> dict[str, dict]:
    """1シートを走査して seats 辞書を返す。{seat_id: {categoryId, ticketNo}}"""
    block_headers   = _find_block_headers(ws)
    row_labels      = _find_row_labels(ws)
    section_headers = _find_section_headers(ws)
    seats: dict[str, dict] = {}

    for row in ws.iter_rows():
        for cell in row:
            if cell.column <= 3:
                continue  # A列=セクション名, B列=凡例枚数, C列=行ラベル → 座席対象外
            if not (cell.value is not None and isinstance(cell.value, int)):
                continue
            row_num = row_labels.get(cell.row)
            if row_num is None:
                continue
            block = _resolve_block(cell.row, cell.column,
                                   block_headers, section_headers)
            if block is None:
                continue

            seat_id = f"{short_name}_{block}_{row_num}列_{cell.value}番"
            rgb = _rgb(cell)
            channel_id = color_to_id.get(rgb) if rgb else None

            seats[seat_id] = {
                'categoryId': channel_id,
                'ticketNo':   None,
            }

    return seats


def _generate_blocks(seats: dict, short_name: str) -> list[dict]:
    """
    seats辞書からブロック別の表示構造を生成する。

    戻り値:
      [ { "name": block_name,
          "rows": [ [seat_id, ...], ... ]  # 行順・座席番号降順
        }, ... ]
    """
    prefix = short_name + '_'
    block_rows: dict[str, dict[int, list]] = {}

    for seat_id in seats:
        rest = seat_id[len(prefix):]
        m = re.search(r'^(.+)_(\d+)列_(\d+)番$', rest)
        if not m:
            continue
        block, row_num, seat_num = m.group(1), int(m.group(2)), int(m.group(3))
        block_rows.setdefault(block, {}).setdefault(row_num, []).append(
            (seat_num, seat_id)
        )

    def _natural_key(s: str):
        return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]

    blocks = []
    for block_name in sorted(block_rows, key=_natural_key):
        rows_dict = block_rows[block_name]
        rows = [
            [sid for _, sid in sorted(rows_dict[r], reverse=True)]
            for r in sorted(rows_dict)
        ]
        blocks.append({'name': block_name, 'rows': rows})

    return blocks


def parse_excel(filepath: str) -> dict:
    """
    ExcelファイルをZEATSのJSONデータに変換する。

    戻り値:
    {
      "version": 1,
      "categories": [{id, name, color}, ...],
      "sheets": {
        "シート名": {
          "name": str,
          "shortName": str,
          "seats": {seat_id: {categoryId, ticketNo}}
        }
      }
    }
    """
    # data_only=Falseで読み込み（数式文字列として取得し凡例検出を安定化）
    wb = openpyxl.load_workbook(filepath, data_only=False)

    # 凡例は最初の座席シートから取得（全シート共通の色→チャネルマップのベース）
    first_seat = next(n for n in wb.sheetnames if n not in SKIP_SHEETS)
    global_categories, global_legend_color_to_id = _find_legend(wb[first_seat])

    # _countなどの内部フィールドを除いた公開用categories
    public_categories = [
        {'id': c['id'], 'name': c['name'], 'color': c['color']}
        for c in global_categories
    ]

    result: dict = {
        'version':    1,
        'categories': public_categories,
        'sheets':     {},
    }

    for sheet_name in wb.sheetnames:
        if sheet_name in SKIP_SHEETS:
            continue

        ws = wb[sheet_name]
        short_name = SHEET_SHORT_NAMES.get(sheet_name, sheet_name)

        # シート固有の凡例を試みる
        sheet_cats, legend_color_to_id = _find_legend(ws)
        if sheet_cats:
            # 凡例あり: シート固有のフォールバックマッチを適用
            color_to_id = _build_color_map(ws, sheet_cats, legend_color_to_id)
        else:
            # 凡例なし（テーブル席など）: グローバルマップ + EXTRA_COLOR_MAPPINGS を使用
            color_to_id = {**global_legend_color_to_id, **EXTRA_COLOR_MAPPINGS}

        seats = _parse_sheet(ws, short_name, color_to_id)
        blocks = _generate_blocks(seats, short_name)

        result['sheets'][sheet_name] = {
            'name':      sheet_name,
            'shortName': short_name,
            'seats':     seats,
            'blocks':    blocks,
        }

    return result


if __name__ == '__main__':
    import sys

    filepath   = sys.argv[1] if len(sys.argv) > 1 else '../tmp/大阪フォーマット.xlsx'
    output     = sys.argv[2] if len(sys.argv) > 2 else None
    data = parse_excel(filepath)

    print(f"チャネル数: {len(data['categories'])}")
    for cat in data['categories']:
        print(f"  {cat['name']} ({cat['color']})")

    total_seats = 0
    for sheet_name, sheet in data['sheets'].items():
        seats = sheet['seats']
        total_seats += len(seats)
        channel_counts: dict[str, int] = {}
        for s in seats.values():
            key = s['categoryId'] or '未割当'
            channel_counts[key] = channel_counts.get(key, 0) + 1
        print(f"\n{sheet_name}: {len(seats)}席")
        for ch, cnt in sorted(channel_counts.items(), key=lambda x: -x[1]):
            print(f"  {ch}: {cnt}席")

    print(f"\n合計: {total_seats}席")

    out = output or 'output.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nJSON出力: {out}")
