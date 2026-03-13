'use strict';

var Telegraf = require('telegraf');
var Markup = Telegraf.Markup;

var mainMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('📊 Сегодня',  'REPORT_TODAY'),
    Markup.button.callback('📊 Неделя',   'REPORT_WEEK'),
  ],
  [
    Markup.button.callback('📊 Этот месяц',    'REPORT_MONTH'),
    Markup.button.callback('📊 Прошлый месяц', 'REPORT_LASTMONTH'),
  ],
  [
    Markup.button.callback('🔴 В работе сейчас', 'REPORT_LIVE'),
  ],
  [
    Markup.button.callback('🔄 Обновить отчёт', 'REPORT_REFRESH'),
  ],
]);

var backToMenu = Markup.inlineKeyboard([
  [Markup.button.callback('⬅️ Главное меню', 'MENU_MAIN')],
]);

module.exports = { mainMenu: mainMenu, backToMenu: backToMenu };
