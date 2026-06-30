'use strict';

// ──────────────────────────────────────────────
// 区分定義（確定後に変更してください）
// ──────────────────────────────────────────────
const CATEGORIES = [
  { id: 'A',     name: 'A区分',   color: '#e74c3c' },
  { id: 'B',     name: 'B区分',   color: '#3498db' },
  { id: 'C',     name: 'C区分',   color: '#2ecc71' },
  { id: 'D',     name: 'D区分',   color: '#f39c12' },
  { id: 'VIP',   name: 'VIP',     color: '#9b59b6' },
  { id: 'STAFF', name: 'スタッフ', color: '#1abc9c' },
];

// ──────────────────────────────────────────────
// 初期座席レイアウト（仮データ: 10行 × 12列）
// null = 通路（空セル）, 文字列 = 座席ID
// ──────────────────────────────────────────────
function buildDefaultLayout() {
  const rows = 10;
  const cols = 12;
  const layout = [];
  const rowLabels = 'ABCDEFGHIJ'.split('');
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      // 列3と列8を通路にする
      if (c === 3 || c === 8) {
        row.push(null);
      } else {
        const colNum = c < 3 ? c + 1 : c < 8 ? c : c - 1;
        row.push(`${rowLabels[r]}${colNum}`);
      }
    }
    layout.push(row);
  }
  return layout;
}

// ──────────────────────────────────────────────
// アプリ状態
// ──────────────────────────────────────────────
const state = {
  layout: buildDefaultLayout(),   // 2D配列: null or 座席ID
  seats: {},                       // { 座席ID: { categoryId, ticketNo } }
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
// 区分ボタン生成
// ──────────────────────────────────────────────
function initCategories() {
  const container = document.getElementById('category-buttons');
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.dataset.catId = cat.id;
    btn.textContent = cat.name;
    btn.style.backgroundColor = cat.color;
    if (cat.id === state.activeCategoryId) btn.classList.add('active');
    btn.addEventListener('click', () => setActiveCategory(cat.id));
    container.appendChild(btn);
  });

  // 「選択解除」ボタン
  const eraseBtn = document.createElement('button');
  eraseBtn.className = 'cat-btn';
  eraseBtn.dataset.catId = '__erase__';
  eraseBtn.textContent = '消去';
  eraseBtn.style.backgroundColor = '#555';
  eraseBtn.addEventListener('click', () => setActiveCategory('__erase__'));
  container.appendChild(eraseBtn);
}

function setActiveCategory(id) {
  state.activeCategoryId = id;
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.catId === id);
  });
}

// ──────────────────────────────────────────────
// グリッド描画
// ──────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('seat-grid');
  const cols = state.layout[0].length;
  grid.style.gridTemplateColumns = `20px repeat(${cols}, 36px)`;
  grid.innerHTML = '';

  state.layout.forEach((row, rIdx) => {
    // 行ラベル
    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rIdx];
    grid.appendChild(label);

    row.forEach((seatId, cIdx) => {
      const cell = document.createElement('div');
      if (seatId === null) {
        cell.className = 'seat aisle';
      } else {
        cell.className = 'seat';
        cell.dataset.seatId = seatId;
        applySeatStyle(cell, seatId);
        cell.addEventListener('click', () => onSeatClick(seatId, cell));
        cell.addEventListener('contextmenu', (e) => onSeatRightClick(e, seatId));
      }
      grid.appendChild(cell);
    });
  });
}

function applySeatStyle(cell, seatId) {
  const seat = state.seats[seatId];
  if (seat && seat.categoryId) {
    const cat = CATEGORIES.find(c => c.id === seat.categoryId);
    cell.style.backgroundColor = cat ? cat.color : '#2a2a4a';
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

// ──────────────────────────────────────────────
// 座席クリック
// ──────────────────────────────────────────────
function onSeatClick(seatId, cell) {
  hideContextMenu();
  if (state.activeCategoryId === '__erase__') {
    delete state.seats[seatId];
  } else {
    if (!state.seats[seatId]) state.seats[seatId] = {};
    state.seats[seatId].categoryId = state.activeCategoryId;
    state.seats[seatId].ticketNo = null;
  }
  applySeatStyle(cell, seatId);
  renderSummary();
}

// ──────────────────────────────────────────────
// 右クリックメニュー
// ──────────────────────────────────────────────
function onSeatRightClick(e, seatId) {
  e.preventDefault();
  showContextMenu(e.clientX, e.clientY, seatId);
}

function showContextMenu(x, y, seatId) {
  const menu = document.getElementById('context-menu');
  const list = document.getElementById('context-menu-list');
  list.innerHTML = '';

  // 区分変更オプション
  CATEGORIES.forEach(cat => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'ctx-color-dot';
    dot.style.backgroundColor = cat.color;
    li.appendChild(dot);
    li.appendChild(document.createTextNode(cat.name));
    li.addEventListener('click', () => {
      if (!state.seats[seatId]) state.seats[seatId] = {};
      state.seats[seatId].categoryId = cat.id;
      state.seats[seatId].ticketNo = null;
      const cell = document.querySelector(`[data-seat-id="${seatId}"]`);
      if (cell) applySeatStyle(cell, seatId);
      renderSummary();
      hideContextMenu();
    });
    list.appendChild(li);
  });

  // 消去オプション
  const eraseItem = document.createElement('li');
  eraseItem.style.borderTop = '1px solid #0f3460';
  eraseItem.textContent = '区分を消去';
  eraseItem.addEventListener('click', () => {
    delete state.seats[seatId];
    const cell = document.querySelector(`[data-seat-id="${seatId}"]`);
    if (cell) applySeatStyle(cell, seatId);
    renderSummary();
    hideContextMenu();
  });
  list.appendChild(eraseItem);

  menu.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
  menu.classList.remove('hidden');
}

function hideContextMenu() {
  document.getElementById('context-menu').classList.add('hidden');
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });

// ──────────────────────────────────────────────
// 集計パネル
// ──────────────────────────────────────────────
function renderSummary() {
  const counts = {};
  CATEGORIES.forEach(c => { counts[c.id] = 0; });
  let assigned = 0;
  Object.values(state.seats).forEach(s => {
    if (s.categoryId) {
      counts[s.categoryId] = (counts[s.categoryId] || 0) + 1;
      assigned++;
    }
  });

  // 総座席数
  let total = 0;
  state.layout.forEach(row => row.forEach(cell => { if (cell !== null) total++; }));

  const list = document.getElementById('summary-list');
  list.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <div class="summary-color-dot" style="background:${cat.color}"></div>
      <span class="summary-name">${cat.name}</span>
      <span class="summary-count">${counts[cat.id] || 0}</span>
    `;
    list.appendChild(row);
  });

  document.getElementById('total-count').textContent =
    `割当済：${assigned} / 総座席：${total}`;
}

// ──────────────────────────────────────────────
// チケット番号割り振り
// ──────────────────────────────────────────────
function assignTickets() {
  const prefix = document.getElementById('ticket-prefix').value.trim();
  const startNum = parseInt(document.getElementById('ticket-start').value, 10) || 1;

  let num = startNum;
  const preview = [];

  // 座席を行列順に並べて採番
  state.layout.forEach(row => {
    row.forEach(seatId => {
      if (seatId && state.seats[seatId] && state.seats[seatId].categoryId) {
        const ticketNo = `${prefix}${String(num).padStart(3, '0')}`;
        state.seats[seatId].ticketNo = ticketNo;
        preview.push(`${seatId} → ${ticketNo}`);
        num++;
      }
    });
  });

  // グリッド再描画
  document.querySelectorAll('.seat[data-seat-id]').forEach(cell => {
    applySeatStyle(cell, cell.dataset.seatId);
  });

  document.getElementById('ticket-preview').textContent = preview.slice(0, 20).join('\n') +
    (preview.length > 20 ? `\n... 他${preview.length - 20}席` : '');

  showToast(`${preview.length}席にチケット番号を割り振りました`);
}

// ──────────────────────────────────────────────
// JSON エクスポート / インポート
// ──────────────────────────────────────────────
function exportJSON() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: CATEGORIES,
    layout: state.layout,
    seats: state.seats,
    ticketConfig: {
      prefix: document.getElementById('ticket-prefix').value,
      startNum: parseInt(document.getElementById('ticket-start').value, 10),
    },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `seat-layout-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSONをエクスポートしました');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version || !data.seats || !data.layout) throw new Error('フォーマット不正');
      state.layout = data.layout;
      state.seats = data.seats;
      if (data.ticketConfig) {
        document.getElementById('ticket-prefix').value = data.ticketConfig.prefix || 'A';
        document.getElementById('ticket-start').value = data.ticketConfig.startNum || 1;
      }
      renderGrid();
      renderSummary();
      showToast('JSONを読み込みました');
    } catch (err) {
      alert('JSONの読み込みに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ──────────────────────────────────────────────
// ボタンバインド
// ──────────────────────────────────────────────
function bindActions() {
  document.getElementById('btn-clear-selection').addEventListener('click', () => {
    setActiveCategory(CATEGORIES[0].id);
  });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (!confirm('全ての区分・チケット番号をリセットしますか？')) return;
    state.seats = {};
    renderGrid();
    renderSummary();
    document.getElementById('ticket-preview').textContent = '';
    showToast('リセットしました');
  });

  document.getElementById('btn-export').addEventListener('click', exportJSON);

  document.getElementById('btn-import-json').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });

  document.getElementById('import-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });

  document.getElementById('btn-assign-tickets').addEventListener('click', assignTickets);
}

// ──────────────────────────────────────────────
// トースト通知
// ──────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}
