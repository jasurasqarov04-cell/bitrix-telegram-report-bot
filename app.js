'use strict';
require('dotenv').config();
var express     = require('express');
var config      = require('./config/config');
var botModule   = require('./telegram/bot');
var bot         = botModule.bot;
var dailyReport = require('./jobs/dailyReport');
var keepAlive   = require('./keepalive');

var app = express();
app.use(express.json());

app.get('/health', function(req, res) {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    timezone: config.schedule.timezone,
    reportSchedule:
      String(config.schedule.hour).padStart(2, '0') + ':' +
      String(config.schedule.minute).padStart(2, '0'),
  });
});

app.get('/', function(req, res) {
  res.send('Бот работает. Статус: /health');
});

function start() {
  app.listen(config.server.port, function() {
    console.log('[Сервер] ✅ HTTP сервер запущен на порту ' + config.server.port);
  });

  bot.launch().then(function() {
    console.log('[Бот] ✅ Telegram бот запущен');
    dailyReport.scheduleAll();

    // Пингуем себя чтобы не засыпать на Render
    var selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '';
    if (selfUrl) keepAlive(selfUrl);
    else console.log('[KeepAlive] Переменная RENDER_EXTERNAL_URL не задана, пинг отключён.');

    console.log('\n🚀 Бот полностью работает. Ctrl+C для остановки.\n');
  }).catch(function(err) {
    console.error('[Бот] ❌ Ошибка запуска:', err.message);
    process.exit(1);
  });
}

process.once('SIGINT',  function() { bot.stop('SIGINT');  });
process.once('SIGTERM', function() { bot.stop('SIGTERM'); });

start();
