'use strict';

var Telegraf      = require('telegraf').Telegraf;
var axios         = require('axios');
var config        = require('../config/config');
var keyboards     = require('./keyboards');
var reportService = require('../services/reportService');

var bot = new Telegraf(config.bot.token);

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// ─── Общий обработчик отчётов ─────────────────────────────────────────────────

async function sendReport(ctx, generator) {
  try { await ctx.answerCbQuery(); } catch (e) {}

  var placeholder = await ctx.reply('⏳ Загружаю данные из Bitrix24…');

  try {
    var text = await generator();
    await ctx.telegram.editMessageText(
      placeholder.chat.id,
      placeholder.message_id,
      null,
      text,
      Object.assign({ parse_mode: 'Markdown' }, keyboards.mainMenu)
    );
  } catch (err) {
    console.error('[Бот] Ошибка:', err.message);
    await ctx.telegram.editMessageText(
      placeholder.chat.id,
      placeholder.message_id,
      null,
      '❌ *Ошибка получения отчёта*\n\n_' + err.message + '_',
      Object.assign({ parse_mode: 'Markdown' }, keyboards.mainMenu)
    );
  }
}

// ─── Команды ──────────────────────────────────────────────────────────────────

bot.start(async function(ctx) {
  var name = (ctx.from && ctx.from.first_name) ? ctx.from.first_name : '';
  await ctx.reply(
    '👋 Привет, *' + name + '!*\n\nФормирую отчёты по лидам и звонкам из Bitrix24.\n\nВыберите период:',
    Object.assign({ parse_mode: 'Markdown' }, keyboards.mainMenu)
  );
});

bot.command('help', async function(ctx) {
  await ctx.reply(
    '*Доступные команды:*\n\n' +
    '/start — Главное меню\n' +
    '/report — Отчёт за сегодня\n' +
    '/live — Лиды в работе сейчас\n' +
    '/statuses — Статусы лидов\n' +
    '/calltest — Диагностика звонков\n' +
    '/help — Это сообщение',
    { parse_mode: 'Markdown' }
  );
});

bot.command('report', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getTodayRange(), 'Сегодня');
  });
});

bot.command('live', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateLiveReport();
  });
});

// Диагностика статусов лидов
bot.command('statuses', async function(ctx) {
  try {
    var response = await axios.get(config.bitrix.webhook + 'crm.status.list.json', {
      params: { FILTER: { ENTITY_ID: 'STATUS' } }
    });
    var items = response.data.result || [];
    if (!items.length) return ctx.reply('Статусы не найдены.');
    var lines = ['*Статусы лидов в Bitrix24:*\n'];
    for (var i = 0; i < items.length; i++) {
      lines.push('`' + items[i].STATUS_ID + '` — ' + items[i].NAME);
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (e) {
    await ctx.reply('Ошибка: ' + e.message);
  }
});

// Диагностика звонков — показывает поля первого найденного звонка
bot.command('calltest', async function(ctx) {
  // Сначала пробуем voximplant
  try {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    function fmtV(d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    var r = await axios.get(config.bitrix.webhook + 'voximplant.statistic.get.json', {
      params: {
        FILTER: { '>=CALL_START_DATE': fmtV(today) },
        SELECT: ['*'],
        start: 0,
      }
    });
    var items = r.data.result || [];
    if (items.length > 0) {
      var first = items[0];
      var lines = ['*voximplant — поля первого звонка (' + items.length + ' всего):*\n'];
      Object.keys(first).forEach(function(k) {
        var v = first[k];
        if (v !== null && v !== '' && v !== undefined) {
          lines.push('`' + k + '` = ' + v);
        }
      });
      return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    }
    await ctx.reply('voximplant: звонков сегодня не найдено, пробую crm.activity.list...');
  } catch (e) {
    await ctx.reply('voximplant ошибка: ' + e.message + '\nПробую crm.activity.list...');
  }

  // Запасной — crm.activity.list
  try {
    var today2 = new Date(); today2.setHours(0, 0, 0, 0);
    var r2 = await axios.get(config.bitrix.webhook + 'crm.activity.list.json', {
      params: {
        FILTER: { '>=DATE_CREATE': fmtDate(today2), TYPE_ID: 2 },
        SELECT: ['*'],
        start: 0,
      }
    });
    var items2 = r2.data.result || [];
    if (!items2.length) return ctx.reply('crm.activity.list: звонков сегодня тоже не найдено.');
    var first2 = items2[0];
    var lines2 = ['*crm.activity.list — поля первого звонка (' + items2.length + ' всего):*\n'];
    Object.keys(first2).forEach(function(k) {
      var v = first2[k];
      if (v !== null && v !== '' && v !== undefined) {
        lines2.push('`' + k + '` = ' + v);
      }
    });
    await ctx.reply(lines2.join('\n'), { parse_mode: 'Markdown' });
  } catch (e2) {
    await ctx.reply('crm.activity.list ошибка: ' + e2.message);
  }
});

// ─── Кнопки ───────────────────────────────────────────────────────────────────

bot.action('REPORT_TODAY', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getTodayRange(), 'Сегодня');
  });
});

bot.action('REPORT_WEEK', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getWeekRange(), 'Последние 7 дней');
  });
});

bot.action('REPORT_MONTH', async function(ctx) {
  await sendReport(ctx, function() {
    var range = reportService.getThisMonthRange();
    var month = new Date().toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    return reportService.generateReport(range, 'Этот месяц — ' + month);
  });
});

bot.action('REPORT_LASTMONTH', async function(ctx) {
  await sendReport(ctx, function() {
    var range = reportService.getLastMonthRange();
    var prev  = new Date(); prev.setMonth(prev.getMonth() - 1);
    var month = prev.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    return reportService.generateReport(range, 'Прошлый месяц — ' + month);
  });
});

bot.action('REPORT_LIVE', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateLiveReport();
  });
});

bot.action('REPORT_REFRESH', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getTodayRange(), 'Сегодня (обновлено)');
  });
});

bot.action('MENU_MAIN', async function(ctx) {
  try { await ctx.answerCbQuery(); } catch (e) {}
  await ctx.reply('Выберите период:', keyboards.mainMenu);
});

bot.catch(function(err) {
  if (!err.message) return;
  if (err.message.indexOf('query is too old') !== -1) return;
  if (err.message.indexOf('query ID is invalid') !== -1) return;
  console.error('[Бот] Необработанная ошибка:', err.message);
});

// ─── Отправка в настроенный чат ───────────────────────────────────────────────

async function sendToConfiguredChat(text) {
  await bot.telegram.sendMessage(
    config.bot.chatId,
    text,
    Object.assign({ parse_mode: 'Markdown' }, keyboards.mainMenu)
  );
}

module.exports = { bot: bot, sendToConfiguredChat: sendToConfiguredChat };
