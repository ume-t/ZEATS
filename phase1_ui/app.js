'use strict';

// ──────────────────────────────────────────────
// 区分定義（Excelインポート時はJSONから上書きされる）
// ──────────────────────────────────────────────
let CATEGORIES = [
  { id: 'A',     name: 'A区分',   color: '#e74c3c' },
  { id: 'B',     name: 'B区分',   color: '#3498db' },
  { id: 'C',     name: 'C区分',   color: '#2ecc71' },
  { id: 'D',     name: 'D区分',   color: '#f39c12' },
  { id: 'VIP',   name: 'VIP',     color: '#9b59b6' },
  { id: 'STAFF', name: 'スタッフ', color: '#1abc9c' },
];

// ──────────────────────────────────────────────
// 初期座席レイアウト（手動モード用・仮データ）
// null = 通路, 文字列 = 座席ID
// ──────────────────────────────────────────────
function buildDefaultLayout() {
  const rowLabels = 'ABCDEFGHIJ'.split('');
  return rowLabels.map(r =>
    Array.from({ length: 12 }, (_, c) =>
      (c === 3 || c === 8) ? null : `${r}${c < 3 ? c + 1 : c < 8 ? c : c - 1}`
    )
  );
}

// ──────────────────────────────────────────────
// ドラッグ塗り状態
// ──────────────────────────────────────────────
const dragPaint = {
  active: false,
  action: null, // 'assign' | 'erase'
};

// Shift+クリック範囲選択のアンカー
let shiftAnchor = { seatId: null, action: null };

// Undo / Redo スタック
const undoStack = [];
const redoStack = [];
const UNDO_MAX  = 50;
let gestureSnapshot = null;

function takeSnapshot() {
  const src = state.mode === 'import' ? state.activeSeatsDirty : state.seats;
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, { ...v }]));
}

function pushUndo(before) {
  if (JSON.stringify(before) === JSON.stringify(takeSnapshot())) return;
  undoStack.push(before);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0; // 新しい操作で Redo 履歴をクリア
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const u = document.getElementById('btn-undo');
  const r = document.getElementById('btn-redo');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}

function restoreSnapshot(snapshot) {
  if (state.mode === 'import') {
    state.activeSeatsDirty = snapshot;
    renderBlockView(document.getElementById('block-search').value);
  } else {
    state.seats = snapshot;
    document.querySelectorAll('.seat[data-seat-id]').forEach(cell =>
      applyGridSeatStyle(cell, cell.dataset.seatId)
    );
  }
  renderSummary();
  updateHistoryButtons();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(takeSnapshot());
  restoreSnapshot(undoStack.pop());
  showToast('1つ戻りました');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(takeSnapshot());
  restoreSnapshot(redoStack.pop());
  showToast('1つ進みました');
}

// ──────────────────────────────────────────────
// アプリ状態
// ──────────────────────────────────────────────
const state = {
  // 表示モード: 'manual'（手動グリッド）| 'import'（Excelインポート）
  mode: 'manual',

  // --- 手動モード ---
  layout: buildDefaultLayout(),
  seats: {},

  // --- インポートモード ---
  sheetsData: {},        // { シート名: { name, shortName, seats, blocks } }
  activeSheetName: null,
  activeSeatsDirty: {},  // インポートモードでの変更 { seatId: { categoryId, ticketNo } }

  // --- 共通 ---
  activeCategoryId: CATEGORIES[0].id,
};

// ──────────────────────────────────────────────
// 初期化
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCategories();
  renderGrid();
  renderSummary();
  bindActions();
});

// ──────────────────────────────────────────────
// 区分ボタン
// ──────────────────────────────────────────────
function initCategories() {
  const container = document.getElementById('category-buttons');
  container.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.catId = cat.id;
    btn.textContent = cat.name;
    applyCatBtnColor(btn, cat.color);
    if (cat.id === state.activeCategoryId) btn.classList.add('active');
    btn.addEventListener('click', () => setActiveCategory(cat.id));
    btn.addEventListener('dblclick', e => { e.stopPropagation(); openColorPicker(cat.id, btn); });
    container.appendChild(btn);
  });

  const eraseBtn = document.createElement('button');
  eraseBtn.className = 'cat-btn';
  eraseBtn.dataset.catId = '__erase__';
  eraseBtn.textContent = '消去';
  eraseBtn.style.backgroundColor = '#555';
  eraseBtn.addEventListener('click', () => setActiveCategory('__erase__'));
  container.appendChild(eraseBtn);
}

function applyCatBtnColor(btn, color) {
  if (color) {
    btn.style.backgroundColor = color;
    btn.classList.remove('cat-btn--no-color');
  } else {
    btn.style.backgroundColor = '#555';
    btn.classList.add('cat-btn--no-color');
  }
}

function openColorPicker(catId, anchorBtn) {
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) return;

  const input = document.createElement('input');
  input.type = 'color';
  input.value = cat.color || '#888888';
  Object.assign(input.style, { position: 'fixed', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(input);

  input.addEventListener('input', e => updateCategoryColor(catId, e.target.value));
  input.addEventListener('change', e => {
    updateCategoryColor(catId, e.target.value);
    document.body.removeChild(input);
  });
  // キャンセル（ESCなど）でも要素を除去
  input.addEventListener('cancel', () => document.body.removeChild(input));
  input.click();
}

function updateCategoryColor(catId, color) {
  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) return;
  cat.color = color;

  const btn = document.querySelector(`.cat-btn[data-cat-id="${CSS.escape(catId)}"]`);
  if (btn) applyCatBtnColor(btn, color);

  renderSummary();

  if (state.mode === 'import') {
    renderBlockView(document.getElementById('block-search').value);
  } else {
    document.querySelectorAll('.seat[data-seat-id]').forEach(cell =>
      applyGridSeatStyle(cell, cell.dataset.seatId)
    );
  }
}

function setActiveCategory(id) {
  state.activeCategoryId = id;
  document.querySelectorAll('.cat-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.catId === id)
  );
}

// ──────────────────────────────────────────────
// 現在のシートの seats を返すヘルパー
// ──────────────────────────────────────────────
function currentSeats() {
  if (state.mode === 'import') {
    const base = state.sheetsData[state.activeSheetName]?.seats || {};
    return { ...base, ...state.activeSeatsDirty };
  }
  return state.seats;
}

// ──────────────────────────────────────────────
// 座席割当を書き込む（モード共通）
// ──────────────────────────────────────────────
function setSeat(seatId, categoryId) {
  if (state.mode === 'import') {
    if (!state.activeSeatsDirty[seatId]) {
      // ベースからコピーして上書き
      const base = state.sheetsData[state.activeSheetName]?.seats?.[seatId] || {};
      state.activeSeatsDirty[seatId] = { ...base };
    }
    state.activeSeatsDirty[seatId].categoryId = categoryId;
    state.activeSeatsDirty[seatId].ticketNo   = null;
  } else {
    if (!state.seats[seatId]) state.seats[seatId] = {};
    state.seats[seatId].categoryId = categoryId;
    state.seats[seatId].ticketNo   = null;
  }
}

function eraseSeat(seatId) {
  if (state.mode === 'import') {
    state.activeSeatsDirty[seatId] = { categoryId: null, ticketNo: null };
  } else {
    delete state.seats[seatId];
  }
}

// ──────────────────────────────────────────────
// モード切り替え
// ──────────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  document.getElementById('grid-mode').classList.toggle('hidden', mode === 'import');
  document.getElementById('block-mode').classList.toggle('hidden', mode === 'manual');
  document.getElementById('block-mode').style.display = mode === 'import' ? 'flex' : 'none';
  document.getElementById('sheet-tabs').classList.toggle('hidden', mode === 'manual');
}

// ──────────────────────────────────────────────
// シートタブ描画
// ──────────────────────────────────────────────
function renderSheetTabs() {
  const tabs = document.getElementById('sheet-tabs');
  tabs.innerHTML = '';
  Object.keys(state.sheetsData).forEach(name => {
    const tab = document.createElement('button');
    tab.className = 'sheet-tab' + (name === state.activeSheetName ? ' active' : '');
    tab.textContent = name;
    tab.addEventListener('click', () => switchSheet(name));
    tabs.appendChild(tab);
  });
}

function switchSheet(name) {
  state.activeSheetName = name;
  state.activeSeatsDirty = {};
  undoStack.length = 0;
  redoStack.length = 0;
  updateHistoryButtons();
  renderSheetTabs();
  renderBlockView();
  renderSummary();
  document.getElementById('ticket-preview').textContent = '';
}

// ──────────────────────────────────────────────
// ブロックビュー描画（インポートモード）
// ──────────────────────────────────────────────
function renderBlockView(filterText = '') {
  const sheet = state.sheetsData[state.activeSheetName];
  if (!sheet) return;

  const seats = currentSeats();
  const query = filterText.toLowerCase();
  const filtered = sheet.blocks.filter(b =>
    !query || b.name.toLowerCase().includes(query)
  );

  document.getElementById('block-count-label').textContent =
    `${filtered.length} / ${sheet.blocks.length} ブロック`;

  const container = document.getElementById('block-cards');
  container.innerHTML = '';

  filtered.forEach(block => {
    const card = document.createElement('div');
    card.className = 'block-card';

    const nameEl = document.createElement('div');
    nameEl.className = 'block-card-name';
    nameEl.textContent = block.name;
    card.appendChild(nameEl);

    block.rows.forEach((rowSeats, rIdx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'block-row';

      const lbl = document.createElement('span');
      lbl.className = 'block-row-label';
      lbl.textContent = `${rIdx + 1}列`;
      rowEl.appendChild(lbl);

      rowSeats.forEach(seatId => {
        const seatEl = document.createElement('div');
        seatEl.className = 'block-seat';
        seatEl.dataset.seatId = seatId;

        // 座席番号だけ表示（末尾の番号を抽出）
        const num = seatId.match(/_(\d+)番$/)?.[1] || '';
        seatEl.textContent = num;
        seatEl.title = seatId;

        applyBlockSeatStyle(seatEl, seatId, seats);

        seatEl.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
          hideContextMenu();
          gestureSnapshot = takeSnapshot();
          if (e.shiftKey && shiftAnchor.seatId) {
            applyShiftRangeBlock(shiftAnchor.seatId, seatId, shiftAnchor.action);
            pushUndo(gestureSnapshot);
            return;
          }
          const s = currentSeats();
          const action = (state.activeCategoryId === '__erase__' || s[seatId]?.categoryId)
            ? 'erase' : 'assign';
          dragPaint.action = action;
          dragPaint.active = true;
          shiftAnchor = { seatId, action };
          applyDragBlock(seatId, seatEl);
        });
        seatEl.addEventListener('mouseover', () => {
          if (!dragPaint.active) return;
          applyDragBlock(seatId, seatEl);
        });
        seatEl.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, seatId, seatEl, true); });
        rowEl.appendChild(seatEl);
      });

      card.appendChild(rowEl);
    });

    container.appendChild(card);
  });
}

function applyBlockSeatStyle(el, seatId, seats) {
  const seat = seats[seatId];
  if (seat && seat.categoryId) {
    const cat = CATEGORIES.find(c => c.id === seat.categoryId);
    const color = cat?.color || '#888';
    el.style.backgroundColor = color;
    el.style.borderColor = 'transparent';
    el.style.color = 'rgba(0,0,0,0.75)';
  } else {
    el.style.backgroundColor = '#2a2a4a';
    el.style.borderColor = 'rgba(255,255,255,0.12)';
    el.style.color = '#555';
  }
}

function applyDragBlock(seatId, el) {
  if (dragPaint.action === 'erase') {
    eraseSeat(seatId);
  } else {
    setSeat(seatId, state.activeCategoryId);
  }
  applyBlockSeatStyle(el, seatId, currentSeats());
}

function applyShiftRangeBlock(fromId, toId, action) {
  const all = [...document.querySelectorAll('#block-cards .block-seat[data-seat-id]')];
  const fi = all.findIndex(el => el.dataset.seatId === fromId);
  const ti = all.findIndex(el => el.dataset.seatId === toId);
  if (fi === -1 || ti === -1) return;
  const [lo, hi] = [Math.min(fi, ti), Math.max(fi, ti)];
  all.slice(lo, hi + 1).forEach(el => {
    const sid = el.dataset.seatId;
    if (action === 'erase') eraseSeat(sid); else setSeat(sid, state.activeCategoryId);
    applyBlockSeatStyle(el, sid, currentSeats());
  });
  renderSummary();
}

// ──────────────────────────────────────────────
// 手動グリッド描画
// ──────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('seat-grid');
  const cols = state.layout[0].length;
  grid.style.gridTemplateColumns = `20px repeat(${cols}, 36px)`;
  grid.innerHTML = '';

  state.layout.forEach((row, rIdx) => {
    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rIdx];
    grid.appendChild(label);

    row.forEach(seatId => {
      const cell = document.createElement('div');
      if (seatId === null) {
        cell.className = 'seat aisle';
      } else {
        cell.className = 'seat';
        cell.dataset.seatId = seatId;
        applyGridSeatStyle(cell, seatId);
        cell.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
          hideContextMenu();
          gestureSnapshot = takeSnapshot();
          if (e.shiftKey && shiftAnchor.seatId) {
            applyShiftRangeGrid(shiftAnchor.seatId, seatId, shiftAnchor.action);
            pushUndo(gestureSnapshot);
            return;
          }
          const action = (state.activeCategoryId === '__erase__' || state.seats[seatId]?.categoryId)
            ? 'erase' : 'assign';
          dragPaint.action = action;
          dragPaint.active = true;
          shiftAnchor = { seatId, action };
          applyDragGrid(seatId, cell);
        });
        cell.addEventListener('mouseover', () => {
          if (!dragPaint.active) return;
          applyDragGrid(seatId, cell);
        });
        cell.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e.clientX, e.clientY, seatId, cell, false); });
      }
      grid.appendChild(cell);
    });
  });
}

function applyGridSeatStyle(cell, seatId) {
  const seat = state.seats[seatId];
  if (seat && seat.categoryId) {
    const cat = CATEGORIES.find(c => c.id === seat.categoryId);
    const color = cat?.color || '#888';
    cell.style.backgroundColor = color;
    cell.style.borderColor = 'transparent';
    cell.textContent = seat.ticketNo || seatId;
    cell.style.color = 'rgba(0,0,0,0.75)';
  } else {
    cell.style.backgroundColor = '#2a2a4a';
    cell.style.borderColor = 'rgba(255,255,255,0.15)';
    cell.textContent = seatId;
    cell.style.color = '#555';
  }
}

function applyDragGrid(seatId, cell) {
  if (dragPaint.action === 'erase') {
    eraseSeat(seatId);
  } else {
    setSeat(seatId, state.activeCategoryId);
  }
  applyGridSeatStyle(cell, seatId);
}

function applyShiftRangeGrid(fromId, toId, action) {
  const all = [...document.querySelectorAll('#seat-grid .seat[data-seat-id]')];
  const fi = all.findIndex(el => el.dataset.seatId === fromId);
  const ti = all.findIndex(el => el.dataset.seatId === toId);
  if (fi === -1 || ti === -1) return;
  const [lo, hi] = [Math.min(fi, ti), Math.max(fi, ti)];
  all.slice(lo, hi + 1).forEach(el => {
    const sid = el.dataset.seatId;
    if (action === 'erase') eraseSeat(sid); else setSeat(sid, state.activeCategoryId);
    applyGridSeatStyle(el, sid);
  });
  renderSummary();
}

// ──────────────────────────────────────────────
// コンテキストメニュー
// ──────────────────────────────────────────────
function showContextMenu(x, y, seatId, el, isBlock) {
  const menu = document.getElementById('context-menu');
  const list = document.getElementById('context-menu-list');
  list.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'ctx-color-dot';
    dot.style.backgroundColor = cat.color || '#888';
    li.appendChild(dot);
    li.appendChild(document.createTextNode(cat.name));
    li.addEventListener('click', () => {
      setSeat(seatId, cat.id);
      if (isBlock) applyBlockSeatStyle(el, seatId, currentSeats());
      else applyGridSeatStyle(el, seatId);
      renderSummary();
      hideContextMenu();
    });
    list.appendChild(li);
  });

  const eraseItem = document.createElement('li');
  eraseItem.style.borderTop = '1px solid #0f3460';
  eraseItem.textContent = '区分を消去';
  eraseItem.addEventListener('click', () => {
    eraseSeat(seatId);
    if (isBlock) applyBlockSeatStyle(el, seatId, currentSeats());
    else applyGridSeatStyle(el, seatId);
    renderSummary();
    hideContextMenu();
  });
  list.appendChild(eraseItem);

  menu.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight - 200)}px`;
  menu.classList.remove('hidden');
}

function hideContextMenu() {
  document.getElementById('context-menu').classList.add('hidden');
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideContextMenu();
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// ──────────────────────────────────────────────
// 集計パネル
// ──────────────────────────────────────────────
function renderSummary() {
  const seats = currentSeats();
  const counts = {};
  CATEGORIES.forEach(c => { counts[c.id] = 0; });
  let assigned = 0;
  let total = 0;

  if (state.mode === 'import') {
    Object.values(seats).forEach(s => {
      if (s.categoryId) {
        counts[s.categoryId] = (counts[s.categoryId] || 0) + 1;
        assigned++;
      }
      total++;
    });
  } else {
    Object.values(state.seats).forEach(s => {
      if (s.categoryId) {
        counts[s.categoryId] = (counts[s.categoryId] || 0) + 1;
        assigned++;
      }
    });
    state.layout.forEach(row => row.forEach(cell => { if (cell !== null) total++; }));
  }

  const list = document.getElementById('summary-list');
  list.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <div class="summary-color-dot" style="background:${cat.color || '#888'}"></div>
      <span class="summary-name">${cat.name}</span>
      <span class="summary-count">${counts[cat.id] || 0}</span>
    `;
    list.appendChild(row);
  });

  document.getElementById('total-count').textContent =
    `割当済：${assigned} / 総座席：${total}`;
}

// ──────────────────────────────────────────────
// チケット採番
// ──────────────────────────────────────────────
function assignTickets() {
  const prefix   = document.getElementById('ticket-prefix').value.trim();
  const startNum = parseInt(document.getElementById('ticket-start').value, 10) || 1;
  let num = startNum;
  const preview = [];

  if (state.mode === 'import') {
    const sheet = state.sheetsData[state.activeSheetName];
    if (!sheet) return;
    const seats = currentSeats();
    sheet.blocks.forEach(block => {
      block.rows.forEach(rowSeats => {
        rowSeats.forEach(seatId => {
          if (seats[seatId]?.categoryId) {
            const ticketNo = `${prefix}${String(num).padStart(3, '0')}`;
            if (!state.activeSeatsDirty[seatId]) {
              state.activeSeatsDirty[seatId] = { ...seats[seatId] };
            }
            state.activeSeatsDirty[seatId].ticketNo = ticketNo;
            preview.push(`${seatId} → ${ticketNo}`);
            num++;
          }
        });
      });
    });
    renderBlockView(document.getElementById('block-search').value);
  } else {
    state.layout.forEach(row => {
      row.forEach(seatId => {
        if (seatId && state.seats[seatId]?.categoryId) {
          const ticketNo = `${prefix}${String(num).padStart(3, '0')}`;
          state.seats[seatId].ticketNo = ticketNo;
          preview.push(`${seatId} → ${ticketNo}`);
          num++;
        }
      });
    });
    document.querySelectorAll('.seat[data-seat-id]').forEach(cell =>
      applyGridSeatStyle(cell, cell.dataset.seatId)
    );
  }

  document.getElementById('ticket-preview').textContent =
    preview.slice(0, 20).join('\n') +
    (preview.length > 20 ? `\n... 他${preview.length - 20}席` : '');

  showToast(`${preview.length}席にチケット番号を割り振りました`);
}

// ──────────────────────────────────────────────
// ボタンバインド
// ──────────────────────────────────────────────
function bindActions() {
  // ドラッグ塗りの終了（どこでマウスを離しても集計を更新）
  document.addEventListener('mouseup', () => {
    if (!dragPaint.active) return;
    dragPaint.active = false;
    dragPaint.action = null;
    pushUndo(gestureSnapshot);
    gestureSnapshot = null;
    renderSummary();
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (!confirm('座席と区分の色をすべて白図面（無色）に戻しますか？')) return;
    // 区分の色をすべてクリア
    CATEGORIES.forEach(cat => { cat.color = null; });
    initCategories();
    // 座席の区分割り当てをすべてクリア
    if (state.mode === 'import') {
      // ベースの全座席に categoryId: null を上書きするdirtyを作成
      const allSeats = state.sheetsData[state.activeSheetName]?.seats || {};
      state.activeSeatsDirty = Object.fromEntries(
        Object.keys(allSeats).map(id => [id, { categoryId: null, ticketNo: null }])
      );
      renderBlockView(document.getElementById('block-search').value);
    } else {
      state.seats = {};
      renderGrid();
    }
    renderSummary();
    document.getElementById('ticket-preview').textContent = '';
    showToast('白図面にしました');
  });

  document.getElementById('btn-assign-tickets').addEventListener('click', assignTickets);

  // ブロック検索
  document.getElementById('block-search').addEventListener('input', e =>
    renderBlockView(e.target.value)
  );

  // Electron環境のみ: Python サーバー連携ボタンを表示
  if (window.zeatsAPI) {
    document.getElementById('electron-buttons').style.display = '';
    bindElectronButtons(window.zeatsAPI.serverUrl);
  }
}

// ──────────────────────────────────────────────
// Electron: Python サーバー連携
// ──────────────────────────────────────────────
function bindElectronButtons(serverUrl) {
  document.getElementById('btn-import-excel-direct').addEventListener('click', () =>
    document.getElementById('import-excel-direct-input').click()
  );
  document.getElementById('import-excel-direct-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await importExcelFromServer(file, serverUrl);
  });

  document.getElementById('btn-save-colors').addEventListener('click', () =>
    saveColorsToExcel(serverUrl)
  );
  document.getElementById('btn-export-excel').addEventListener('click', () =>
    exportFromServer(serverUrl, 'excel')
  );
  document.getElementById('btn-export-pdf').addEventListener('click', () =>
    exportFromServer(serverUrl, 'pdf')
  );
}

async function importExcelFromServer(file, serverUrl) {
  try {
    showToast('Excelをインポート中...');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${serverUrl}/import-excel`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data.version || !data.sheets || !data.categories) throw new Error('フォーマット不正');

    CATEGORIES = data.categories;
    initCategories();
    if (!CATEGORIES.find(c => c.id === state.activeCategoryId)) {
      state.activeCategoryId = CATEGORIES[0]?.id || null;
      setActiveCategory(state.activeCategoryId);
    }
    state.sheetsData       = data.sheets;
    state.activeSheetName  = Object.keys(data.sheets)[0];
    state.activeSeatsDirty = {};
    if (data.ticketConfig) {
      document.getElementById('ticket-prefix').value = data.ticketConfig.prefix || 'A';
      document.getElementById('ticket-start').value  = data.ticketConfig.startNum || 1;
    }
    setMode('import');
    renderSheetTabs();
    renderBlockView();
    renderSummary();
    document.getElementById('ticket-preview').textContent = '';
    showToast(`Excelをインポートしました（${Object.keys(data.sheets).length}シート）`);
  } catch (err) {
    alert('Excelインポートに失敗しました: ' + err.message);
  }
}

async function exportFromServer(serverUrl, type) {
  if (state.mode !== 'import') {
    alert('Excel/PDF出力はExcelインポートモードでのみ使用できます。\nまず「Excelを直接インポート」でファイルを読み込んでください。');
    return;
  }
  try {
    const label    = type === 'excel' ? 'Excel' : 'PDF';
    const endpoint = type === 'excel' ? '/export-excel' : '/export-pdf';
    const filename = type === 'excel' ? 'seat-layout.xlsx' : 'seat-layout.pdf';
    showToast(`${label}を出力中...`);

    const mergedSheets = {};
    Object.entries(state.sheetsData).forEach(([name, sheet]) => {
      const mergedSeats = name === state.activeSheetName
        ? { ...sheet.seats, ...state.activeSeatsDirty }
        : { ...sheet.seats };
      mergedSheets[name] = { ...sheet, seats: mergedSeats };
    });
    const payload = { version: 1, categories: CATEGORIES, sheets: mergedSheets };

    const res = await fetch(`${serverUrl}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${label}を出力しました`);
  } catch (err) {
    alert(`出力に失敗しました: ${err.message}`);
  }
}

async function saveColorsToExcel(serverUrl) {
  if (state.mode !== 'import') {
    alert('区分色のExcel保存はExcelインポートモードでのみ使用できます。\nまず「Excelを直接インポート」でファイルを読み込んでください。');
    return;
  }
  const colors = {};
  CATEGORIES.forEach(cat => {
    if (cat.color) colors[cat.id] = cat.color;
  });
  if (Object.keys(colors).length === 0) {
    alert('色が設定されている区分がありません。\n区分ボタンをダブルクリックして色を設定してください。');
    return;
  }
  try {
    showToast('区分色をExcelに保存中...');
    const res = await fetch(`${serverUrl}/save-colors`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ colors }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const blob        = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match       = disposition.match(/filename="?([^"]+)"?/);
    const filename    = match ? match[1] : 'colors.xlsx';
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('区分色をExcelに保存しました');
  } catch (err) {
    showToast('保存失敗: ' + err.message, 5000);
    console.error('saveColorsToExcel error:', err);
  }
}

// ──────────────────────────────────────────────
// トースト
// ──────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
}
