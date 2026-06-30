'use strict';

const { app, BrowserWindow } = require('electron');
const { spawn }              = require('child_process');
const net                    = require('net');
const path                   = require('path');

const SERVER_PORT = 5000;
let pyProcess    = null;
let mainWindow   = null;

// ──────────────────────────────────────────────
// Python サーバー起動
// ──────────────────────────────────────────────
function startPythonServer() {
  const serverScript = path.join(__dirname, '..', 'phase2_python', 'server.py');

  // conda run -n zeats python server.py PORT
  // conda が PATH にない場合は CONDA_EXE 環境変数を参照
  const conda = process.env.CONDA_EXE || 'conda';

  pyProcess = spawn(conda, ['run', '-n', 'zeats', 'python', serverScript, String(SERVER_PORT)], {
    stdio: 'pipe',
  });

  pyProcess.stdout.on('data', d => console.log('[Python]', d.toString().trim()));
  pyProcess.stderr.on('data', d => console.error('[Python]', d.toString().trim()));
  pyProcess.on('error', err => console.error('[Python] 起動エラー:', err.message));
  pyProcess.on('exit', (code, signal) => {
    console.log(`[Python] 終了 code=${code} signal=${signal}`);
    pyProcess = null;
  });
}

// ──────────────────────────────────────────────
// ポートが開くまで待つ（TCPポーリング）
// ──────────────────────────────────────────────
function waitForPort(port, maxRetries = 40, intervalMs = 250) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const attempt = () => {
      const sock = new net.Socket();
      sock.setTimeout(200);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error',   () => { sock.destroy(); retry(); });
      sock.on('timeout', () => { sock.destroy(); retry(); });
      sock.connect(port, '127.0.0.1');
    };
    const retry = () => {
      retries++;
      if (retries >= maxRetries) reject(new Error(`ポート ${port} が ${maxRetries * intervalMs}ms 以内に開きませんでした`));
      else setTimeout(attempt, intervalMs);
    };
    attempt();
  });
}

// ──────────────────────────────────────────────
// ウィンドウ生成
// ──────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    title:  'ZEATS',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      // file:// → http://localhost へのfetchを許可（ローカル専用アプリ）
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'phase1_ui', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ──────────────────────────────────────────────
// 起動フロー
// ──────────────────────────────────────────────
app.whenReady().then(async () => {
  startPythonServer();

  try {
    await waitForPort(SERVER_PORT);
    console.log(`[Main] サーバー起動確認 port=${SERVER_PORT}`);
  } catch (err) {
    console.error('[Main]', err.message);
    // サーバー起動に失敗してもウィンドウは開く（Electron機能のみ無効）
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (pyProcess) {
    pyProcess.kill();
    pyProcess = null;
  }
});
