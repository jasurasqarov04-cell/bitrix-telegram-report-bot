'use strict';

var Telegraf          = require('telegraf').Telegraf;
var axios             = require('axios');
var config            = require('../config/config');
var keyboards         = require('./keyboards');
var reportService     = require('../services/reportService');
var dealReportService = require('../services/dealReportService');

var bot = new Telegraf(config.bot.token);

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

var PIPE_NAMES = {
  '0':  '💼 Основная воронка',
  '32': '🤝 Региональные менеджеры',
  '54': '🌍 Экспорт',
};
var PIPE_IDS = ['0', '32', '54'];

// ─── Универсальный обработчик отчётов ────────────────────────────────────────
async function sendReport(ctx, generator, menuKeyboard) {
  try { await ctx.answerCbQuery(); } catch (e) {}
  menuKeyboard = menuKeyboard || keyboards.callCenterMenu;
  var placeholder = await ctx.reply('⏳ Загружаю данные из Bitrix24…');
  try {
    var text = await generator();
    if (text.length > 3800) {
      await ctx.telegram.deleteMessage(placeholder.chat.id, placeholder.message_id).catch(function(){});
      for (var pos = 0; pos < text.length; pos += 3800) {
        var isLast = pos + 3800 >= text.length;
        await ctx.telegram.sendMessage(
          placeholder.chat.id, text.slice(pos, pos + 3800),
          isLast ? Object.assign({ parse_mode: 'Markdown' }, menuKeyboard) : { parse_mode: 'Markdown' }
        );
      }
    } else {
      await ctx.telegram.editMessageText(
        placeholder.chat.id, placeholder.message_id, null,
        text, Object.assign({ parse_mode: 'Markdown' }, menuKeyboard)
      );
    }
  } catch (err) {
    console.error('[Бот] Ошибка:', err.message);
    try {
      await ctx.telegram.editMessageText(
        placeholder.chat.id, placeholder.message_id, null,
        '❌ *Ошибка*\n\n_' + err.message + '_',
        Object.assign({ parse_mode: 'Markdown' }, menuKeyboard)
      );
    } catch(e2) {}
  }
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.start(async function(ctx) {
  var name = (ctx.from && ctx.from.first_name) ? ctx.from.first_name : '';
  await ctx.reply(
    '👋 Привет, *' + name + '!*\n\nВыберите раздел:',
    Object.assign({ parse_mode: 'Markdown' }, keyboards.startMenu)
  );
});

bot.command('help', async function(ctx) {
  await ctx.reply(
    '*Команды:*\n\n/start — Главное меню\n/report — Лиды сегодня\n/live — Лиды в работе\n/statuses — Статусы лидов\n/calltest — Диагностика звонков\n/help — Помощь',
    { parse_mode: 'Markdown' }
  );
});

bot.command('report', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getTodayRange(), 'Сегодня');
  }, keyboards.callCenterMenu);
});

bot.command('live', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateLiveReport();
  }, keyboards.callCenterMenu);
});

bot.command('statuses', async function(ctx) {
  try {
    var r = await axios.get(config.bitrix.webhook + 'crm.status.list.json', {
      params: { FILTER: { ENTITY_ID: 'STATUS' } }
    });
    var items = r.data.result || [];
    if (!items.length) return ctx.reply('Статусы не найдены.');
    var lines = ['*Статусы лидов:*\n'];
    items.forEach(function(s) { lines.push('`' + s.STATUS_ID + '` — ' + s.NAME); });
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (e) { await ctx.reply('Ошибка: ' + e.message); }
});

bot.command('calltest', async function(ctx) {
  try {
    var today = new Date(); today.setHours(0,0,0,0);
    var r = await axios.get(config.bitrix.webhook + 'crm.activity.list.json', {
      params: { FILTER: { '>=DATE_CREATE': fmtDate(today), TYPE_ID: 2 }, SELECT: ['*'], start: 0 }
    });
    var items = r.data.result || [];
    if (!items.length) return ctx.reply('Звонков сегодня не найдено.');
    var first = items[0];
    var lines = ['*Первый звонок (' + items.length + ' всего):*\n'];
    Object.keys(first).forEach(function(k) {
      if (first[k] !== null && first[k] !== '' && first[k] !== undefined)
        lines.push('`' + k + '` = ' + first[k]);
    });
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (e) { await ctx.reply('Ошибка: ' + e.message); }
});

// ─── Навигация ────────────────────────────────────────────────────────────────
bot.action('MENU_START', async function(ctx) {
  try { await ctx.answerCbQuery(); } catch(e) {}
  await ctx.reply('Выберите раздел:', keyboards.startMenu);
});

bot.action('MENU_CALLCENTER', async function(ctx) {
  try { await ctx.answerCbQuery(); } catch(e) {}
  await ctx.reply(
    '📞 *Колл-центр* — лиды и звонки\nВыберите период:',
    Object.assign({ parse_mode: 'Markdown' }, keyboards.callCenterMenu)
  );
});

bot.action('MENU_SALES', async function(ctx) {
  try { await ctx.answerCbQuery(); } catch(e) {}
  await ctx.reply(
    '💼 *Отдел продаж* — сделки\nВыберите воронку:',
    Object.assign({ parse_mode: 'Markdown' }, keyboards.salesMenu)
  );
});

// ─── Воронки ─────────────────────────────────────────────────────────────────
PIPE_IDS.forEach(function(catId) {
  bot.action('MENU_PIPE_' + catId, async function(ctx) {
    try { await ctx.answerCbQuery(); } catch(e) {}
    var name = PIPE_NAMES[catId] || 'Воронка ' + catId;
    await ctx.reply(
      name + '\nВыберите период:',
      Object.assign({ parse_mode: 'Markdown' }, keyboards.pipelineMenu(catId))
    );
  });
});

// ─── Колл-центр кнопки ───────────────────────────────────────────────────────
bot.action('REPORT_TODAY', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getTodayRange(), 'Сегодня');
  }, keyboards.callCenterMenu);
});
bot.action('REPORT_WEEK', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getWeekRange(), 'Последние 7 дней');
  }, keyboards.callCenterMenu);
});
bot.action('REPORT_MONTH', async function(ctx) {
  await sendReport(ctx, function() {
    var range = reportService.getThisMonthRange();
    var month = new Date().toLocaleString('ru-RU', { month:'long', year:'numeric' });
    return reportService.generateReport(range, 'Этот месяц — ' + month);
  }, keyboards.callCenterMenu);
});
bot.action('REPORT_LASTMONTH', async function(ctx) {
  await sendReport(ctx, function() {
    var range = reportService.getLastMonthRange();
    var prev  = new Date(); prev.setMonth(prev.getMonth()-1);
    return reportService.generateReport(range, 'Прошлый месяц — ' + prev.toLocaleString('ru-RU',{month:'long',year:'numeric'}));
  }, keyboards.callCenterMenu);
});
bot.action('REPORT_LIVE', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateLiveReport();
  }, keyboards.callCenterMenu);
});
bot.action('REPORT_REFRESH', async function(ctx) {
  await sendReport(ctx, function() {
    return reportService.generateReport(reportService.getTodayRange(), 'Сегодня (обновлено)');
  }, keyboards.callCenterMenu);
});

// ─── Отдел продаж кнопки ─────────────────────────────────────────────────────
var PERIODS = {
  TODAY:     function() { return { range: dealReportService.getTodayRange(),     label: 'Сегодня' }; },
  WEEK:      function() { return { range: dealReportService.getWeekRange(),      label: 'Последние 7 дней' }; },
  MONTH:     function() {
    return { range: dealReportService.getThisMonthRange(),
             label: 'Этот месяц — ' + new Date().toLocaleString('ru-RU', { month:'long', year:'numeric' }) };
  },
  LASTMONTH: function() {
    var prev = new Date(); prev.setMonth(prev.getMonth()-1);
    return { range: dealReportService.getLastMonthRange(),
             label: 'Прошлый месяц — ' + prev.toLocaleString('ru-RU', { month:'long', year:'numeric' }) };
  },
};

PIPE_IDS.forEach(function(catId) {
  Object.keys(PERIODS).forEach(function(period) {
    bot.action('PIPE_' + catId + '_' + period, async function(ctx) {
      var p = PERIODS[period]();
      await sendReport(ctx, function() {
        return dealReportService.generatePipelineReport(parseInt(catId, 10), p.range, p.label);
      }, keyboards.pipelineMenu(catId));
    });
  });
});

// ─── Ошибки ───────────────────────────────────────────────────────────────────
bot.catch(function(err) {
  if (!err.message) return;
  if (err.message.indexOf('query is too old') !== -1) return;
  if (err.message.indexOf('query ID is invalid') !== -1) return;
  console.error('[Бот] Необработанная ошибка:', err.message);
});

async function sendToConfiguredChat(text) {
  await bot.telegram.sendMessage(config.bot.chatId, text,
    Object.assign({ parse_mode: 'Markdown' }, keyboards.startMenu));
}

module.exports = { bot: bot, sendToConfiguredChat: sendToConfiguredChat };
