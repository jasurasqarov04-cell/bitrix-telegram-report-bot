'use strict';
var Telegraf = require('telegraf');
var Markup   = Telegraf.Markup;

// ─── Стартовое меню ───────────────────────────────────────────────────────────
var startMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('📞 Колл-центр',   'MENU_CALLCENTER'),
    Markup.button.callback('💼 Отдел продаж', 'MENU_SALES'),
  ],
]);

// ─── Колл-центр ───────────────────────────────────────────────────────────────
var callCenterMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('📊 Сегодня',         'REPORT_TODAY'),
    Markup.button.callback('📊 Неделя',          'REPORT_WEEK'),
  ],
  [
    Markup.button.callback('📊 Этот месяц',      'REPORT_MONTH'),
    Markup.button.callback('📊 Прошлый месяц',   'REPORT_LASTMONTH'),
  ],
  [
    Markup.button.callback('🔴 В работе сейчас', 'REPORT_LIVE'),
    Markup.button.callback('🔄 Обновить',        'REPORT_REFRESH'),
  ],
  [
    Markup.button.callback('⬅️ Назад',           'MENU_START'),
  ],
]);

// ─── Отдел продаж — выбор воронки ────────────────────────────────────────────
var salesMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('💼 Осн. воронка',   'MENU_PIPE_0'),
    Markup.button.callback('🌍 Экспорт',        'MENU_PIPE_54'),
  ],
  [
    Markup.button.callback('🤝 Рег. менеджеры', 'MENU_PIPE_32'),
  ],
  [
    Markup.button.callback('⬅️ Назад',          'MENU_START'),
  ],
]);

// ─── Меню периодов воронки ────────────────────────────────────────────────────
function pipelineMenu(catId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📊 Сегодня',       'PIPE_' + catId + '_TODAY'),
      Markup.button.callback('📊 Неделя',        'PIPE_' + catId + '_WEEK'),
    ],
    [
      Markup.button.callback('📊 Этот месяц',    'PIPE_' + catId + '_MONTH'),
      Markup.button.callback('📊 Прошлый месяц', 'PIPE_' + catId + '_LASTMONTH'),
    ],
    [
      Markup.button.callback('🔄 Обновить',      'PIPE_' + catId + '_TODAY'),
    ],
    [
      Markup.button.callback('⬅️ К воронкам',    'MENU_SALES'),
    ],
  ]);
}

module.exports = {
  startMenu:      startMenu,
  callCenterMenu: callCenterMenu,
  salesMenu:      salesMenu,
  pipelineMenu:   pipelineMenu,
};
