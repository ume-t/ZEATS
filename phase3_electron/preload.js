'use strict';

const { contextBridge } = require('electron');

// レンダラープロセスに Python サーバーの URL を公開する
contextBridge.exposeInMainWorld('zeatsAPI', {
  serverUrl: 'http://127.0.0.1:5000',
});
