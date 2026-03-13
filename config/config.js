'use strict';

require('dotenv').config();

var REQUIRED_VARS = ['BOT_TOKEN', 'BITRIX_WEBHOOK', 'TELEGRAM_CHAT_ID'];

for (var i = 0; i < REQUIRED_VARS.length; i++) {
  var varName = REQUIRED_VARS[i];
  if (!process.env[varName]) {
    console.error('❌ Не найдена переменная: ' + varName);
    console.error('Создайте файл .env на основе .env.example');
    process.exit(1);
  }
}

var rawWebhook = process.env.BITRIX_WEBHOOK;
var bitrixWebhook = rawWebhook.endsWith('/') ? rawWebhook : rawWebhook + '/';

var config = {
  bot: {
    token: process.env.BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  bitrix: {
    webhook: bitrixWebhook,
    pageSize: 50,
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
  },
  schedule: {
    hour:     parseInt(process.env.REPORT_HOUR,   10) || 9,
    minute:   parseInt(process.env.REPORT_MINUTE, 10) || 0,
    timezone: process.env.TIMEZONE || 'Asia/Tashkent',
  },
};

module.exports = config;
