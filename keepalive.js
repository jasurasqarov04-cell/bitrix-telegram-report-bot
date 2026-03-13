'use strict';

// ─── Пинг самого себя чтобы не засыпать на Render ────────────────────────────
// Render усыпляет бесплатные сервисы после 15 минут неактивности.
// Этот модуль пингует сам себя каждые 10 минут.

var https = require('https');
var http  = require('http');

function keepAlive(url) {
  if (!url) {
    console.log('[KeepAlive] URL не задан, пропускаю.');
    return;
  }

  setInterval(function() {
    var lib = url.startsWith('https') ? https : http;
    var req = lib.get(url + '/health', function(res) {
      console.log('[KeepAlive] Пинг ' + url + '/health — статус: ' + res.statusCode);
    });
    req.on('error', function(err) {
      console.error('[KeepAlive] Ошибка пинга:', err.message);
    });
    req.end();
  }, 10 * 60 * 1000); // каждые 10 минут

  console.log('[KeepAlive] ✅ Запущен, пингую каждые 10 минут: ' + url);
}

module.exports = keepAlive;
