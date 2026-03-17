const https = require('https');

const URL = 'https://bitrix-telegram-report-bot.onrender.com/webhook/health';

// Пингуем каждые 14 минут (Render засыпает через 15)
setInterval(() => {
  https.get(URL, (res) => {
    console.log(`[Ping] ${new Date().toLocaleTimeString('ru-RU')} — статус: ${res.statusCode}`);
  }).on('error', (err) => {
    console.error(`[Ping] Ошибка:`, err.message);
  });
}, 14 * 60 * 1000);

console.log('[Ping] Запущен — пингую каждые 14 минут');
