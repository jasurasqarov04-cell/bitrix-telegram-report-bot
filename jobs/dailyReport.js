'use strict';

var cron          = require('node-cron');
var config        = require('../config/config');
var reportService = require('../services/reportService');
var botModule     = require('../telegram/bot');

async function runDailyReport() {
  console.log('[Автоотчёт] Запуск в ' + new Date().toISOString());
  try {
    var range  = reportService.getTodayRange();
    var report = await reportService.generateReport(range, 'Сегодня (Автоотчёт)');
    var time   = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    var message =
      '🕘 *Ежедневный автоматический отчёт*\n' +
      '_Отправлен в ' + time + ' (' + config.schedule.timezone + ')_\n\n' +
      report;

    await botModule.sendToConfiguredChat(message);
    console.log('[Автоотчёт] Успешно отправлен.');
  } catch (err) {
    console.error('[Автоотчёт] Ошибка:', err.message);
    try {
      await botModule.sendToConfiguredChat(
        '⚠️ *Ошибка автоотчёта*\n\n_' + err.message + '_\n\nЗапустите отчёт вручную через меню.'
      );
    } catch (e) {
      console.error('[Автоотчёт] Не удалось отправить уведомление:', e.message);
    }
  }
}

function scheduleDailyReport() {
  var hour     = config.schedule.hour;
  var minute   = config.schedule.minute;
  var timezone = config.schedule.timezone;
  var expression = minute + ' ' + hour + ' * * *';

  if (!cron.validate(expression)) {
    console.error('[Автоотчёт] Неверное cron-выражение: ' + expression);
    return;
  }

  cron.schedule(expression, runDailyReport, { scheduled: true, timezone: timezone });
  console.log(
    '[Автоотчёт] ✅ Запланирован на ' +
    String(hour).padStart(2, '0') + ':' +
    String(minute).padStart(2, '0') + ' ' + timezone
  );
}

module.exports = { scheduleDailyReport: scheduleDailyReport, runDailyReport: runDailyReport };
