"""
ZEATSのJSONデータを座席表PDFに変換するモジュール。

入力: parse_excel()の戻り値（categories + sheets[].seats + sheets[].blocks）
出力: 座席ブロックごとに区分色で塗られた座席表PDF

レイアウト:
  - シートごとに1ページ以上
  - 上部に凡例（カテゴリ名・色）
  - ブロックを縦積みで配置
  - 各座席セル: 区分色の背景 + 座席番号またはチケット番号
"""

import re
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))

PAGE_W, PAGE_H = landscape(A4)
MARGIN        = 12 * mm
CELL_W        = 9 * mm
CELL_H        = 7 * mm
BLOCK_GAP     = 5 * mm   # ブロック間の縦余白
HEADER_H      = 7 * mm   # ブロック名ヘッダーの高さ
LEGEND_H      = 14 * mm  # 凡例エリアの高さ
TITLE_H       = 8 * mm   # シートタイトルの高さ
FONT_JP       = 'HeiseiKakuGo-W5'
FONT_SEAT     = 'Helvetica'


def _hex_to_color(hex_color: str) -> colors.Color:
    """'#RRGGBB' → reportlab Color"""
    h = hex_color.lstrip('#')
    return colors.Color(
        int(h[0:2], 16) / 255,
        int(h[2:4], 16) / 255,
        int(h[4:6], 16) / 255,
    )


def _seat_number(seat_id: str) -> str:
    m = re.search(r'_(\d+)番$', seat_id)
    return m.group(1) if m else seat_id


def _seat_label(seat_id: str, seat_info: dict) -> str:
    ticket = seat_info.get('ticketNo')
    return ticket if ticket else _seat_number(seat_id)


def _draw_legend(c: canvas.Canvas, categories: list[dict],
                 x: float, y: float) -> None:
    """凡例を横並びで描画する。y は凡例エリアの上端。"""
    swatch = 5 * mm
    gap    = 2 * mm
    text_w = 18 * mm
    item_w = swatch + gap + text_w + 4 * mm

    cx = x
    for cat in categories:
        if cx + item_w > PAGE_W - MARGIN:
            break
        col = _hex_to_color(cat['color']) if cat.get('color') else colors.white
        c.setFillColor(col)
        c.rect(cx, y - swatch, swatch, swatch, fill=1, stroke=0)
        c.setFillColor(colors.black)
        c.setFont(FONT_JP, 6)
        c.drawString(cx + swatch + gap, y - swatch + 1 * mm, cat['name'])
        cx += item_w


def _draw_block(c: canvas.Canvas, block: dict, seats: dict,
                cat_colors: dict, x: float, y: float) -> float:
    """
    1ブロックを描画し、描画後の y 座標（下端）を返す。
    y は描画開始位置の上端。
    """
    # ブロック名ヘッダー
    c.setFillColor(colors.Color(0.85, 0.85, 0.85))
    c.rect(x, y - HEADER_H, PAGE_W - 2 * MARGIN, HEADER_H, fill=1, stroke=0)
    c.setFillColor(colors.black)
    c.setFont(FONT_JP, 7)
    c.drawString(x + 2 * mm, y - HEADER_H + 2 * mm, block['name'])
    y -= HEADER_H

    # 座席行
    for row_seats in block['rows']:
        cx = x
        for seat_id in row_seats:
            if seat_id is None:
                # 空きセル（通路など）: 何も描画せず列位置だけ進める
                cx += CELL_W
                continue

            seat_info = seats.get(seat_id, {})
            cat_id    = seat_info.get('categoryId')
            label     = _seat_label(seat_id, seat_info)

            # セル背景
            if cat_id and cat_id in cat_colors:
                c.setFillColor(cat_colors[cat_id])
            else:
                c.setFillColor(colors.white)
            c.rect(cx, y - CELL_H, CELL_W, CELL_H, fill=1, stroke=1)

            # セルテキスト
            c.setFillColor(colors.black)
            c.setFont(FONT_SEAT, 5)
            text_x = cx + CELL_W / 2 - c.stringWidth(label, FONT_SEAT, 5) / 2
            c.drawString(text_x, y - CELL_H + 2 * mm, label)

            cx += CELL_W

        y -= CELL_H

    return y  # ブロック下端のy座標


def export_pdf(data: dict, output_path: str) -> None:
    """
    JSONデータを座席表PDFに出力する。

    Args:
        data: parse_excel()の戻り値。
              categories / sheets[].seats / sheets[].blocks を使用。
        output_path: 出力先ファイルパス（.pdf）
    """
    c = canvas.Canvas(output_path, pagesize=landscape(A4))

    cat_colors: dict[str, colors.Color] = {
        cat['id']: _hex_to_color(cat['color'])
        for cat in data.get('categories', [])
        if cat.get('color')
    }
    categories = data.get('categories', [])

    first_sheet = True
    for sheet_name, sheet_data in data.get('sheets', {}).items():
        if not first_sheet:
            c.showPage()
        first_sheet = False

        seats  = sheet_data['seats']
        blocks = sheet_data['blocks']

        # --- シートタイトル ---
        y = PAGE_H - MARGIN
        c.setFont(FONT_JP, 11)
        c.setFillColor(colors.black)
        c.drawString(MARGIN, y - TITLE_H + 2 * mm, sheet_name)
        y -= TITLE_H

        # --- 凡例 ---
        _draw_legend(c, categories, MARGIN, y)
        y -= LEGEND_H

        # --- ブロック ---
        x = MARGIN
        for block in blocks:
            rows      = block['rows']
            max_seats = max((len(r) for r in rows), default=0)
            block_h   = HEADER_H + CELL_H * len(rows)

            # 改ページ判定
            if y - block_h < MARGIN:
                c.showPage()
                y = PAGE_H - MARGIN

            y = _draw_block(c, block, seats, cat_colors, x, y)
            y -= BLOCK_GAP

    c.save()
    print(f"PDF出力: {output_path}")


if __name__ == '__main__':
    import sys
    from excel_importer import parse_excel

    if len(sys.argv) < 2:
        print("使い方: python pdf_exporter.py <input.xlsx> [output.pdf]")
        sys.exit(1)

    input_path  = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else 'output.pdf'

    print(f"インポート中: {input_path}")
    data = parse_excel(input_path)

    total = sum(len(s['seats']) for s in data['sheets'].values())
    print(f"シート数: {len(data['sheets'])}, 合計座席数: {total}")

    export_pdf(data, output_path)
