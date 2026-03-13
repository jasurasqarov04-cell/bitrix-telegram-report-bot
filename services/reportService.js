'use strict';

var bitrixService = require('./bitrixService');

// ─── Диапазоны дат ────────────────────────────────────────────────────────────

function getTodayRange() {
  var from = new Date(); from.setHours(0, 0, 0, 0);
  var to   = new Date(); to.setHours(23, 59, 59, 999);
  return { from: from, to: to };
}

function getWeekRange() {
  var from = new Date(); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
  var to   = new Date(); to.setHours(23, 59, 59, 999);
  return { from: from, to: to };
}

function getThisMonthRange() {
  var from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
  var to   = new Date(); to.setHours(23, 59, 59, 999);
  return { from: from, to: to };
}

function getLastMonthRange() {
  var from = new Date(); from.setDate(1); from.setMonth(from.getMonth() - 1); from.setHours(0, 0, 0, 0);
  var to   = new Date(); to.setDate(0); to.setHours(23, 59, 59, 999);
  return { from: from, to: to };
}

// Полный прошлый месяц (для автоотчёта)
function getLastFullMonthRange() {
  var now  = new Date();
  var from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  var to   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { from: from, to: to };
}

// Прошлая полная неделя (пн–вс) для автоотчёта
function getLastFullWeekRange() {
  var now     = new Date();
  var day     = now.getDay(); // 0=вс,1=пн,...
  var diffToMon = day === 0 ? -6 : 1 - day;
  var thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + diffToMon);
  thisMonday.setHours(0, 0, 0, 0);
  var lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  var lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  lastSunday.setHours(23, 59, 59, 999);
  return { from: lastMonday, to: lastSunday };
}

module.exports.getTodayRange       = getTodayRange;
module.exports.getWeekRange        = getWeekRange;
module.exports.getThisMonthRange   = getThisMonthRange;
module.exports.getLastMonthRange   = getLastMonthRange;
module.exports.getLastFullMonthRange = getLastFullMonthRange;
module.exports.getLastFullWeekRange  = getLastFullWeekRange;

// ─── Статусы лидов ────────────────────────────────────────────────────────────

var IN_PROGRESS_STATUSES = ['NEW', 'UC_W6L352', 'UC_W00485', 'UC_6IZ381', '3', 'UC_TLEV62'];
var CONVERTED_STATUS     = 'CONVERTED';
var CLOSED_STATUSES      = ['JUNK', '4'];

function isConverted(lead)  { return lead.STATUS_ID === CONVERTED_STATUS; }
function isInProgress(lead) { return IN_PROGRESS_STATUSES.indexOf(lead.STATUS_ID) !== -1; }
function isClosed(lead)     { return CLOSED_STATUSES.indexOf(lead.STATUS_ID) !== -1; }

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function parseBitrixDate(str) {
  if (!str) return null;
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatMs(ms) {
  var totalMinutes = Math.floor(ms / 60000);
  var days    = Math.floor(totalMinutes / 1440);
  var hours   = Math.floor((totalMinutes % 1440) / 60);
  var minutes = totalMinutes % 60;
  if (days > 0)  return days + 'д ' + hours + 'ч';
  if (hours > 0) return hours + 'ч ' + minutes + 'м';
  return minutes + 'м';
}

function formatDateRange(from, to) {
  var opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
  var f = from.toLocaleDateString('ru-RU', opts);
  var t = to.toLocaleDateString('ru-RU', opts);
  return f === t ? f : f + ' – ' + t;
}

// Среднее время обработки — только для финальных лидов (конверт. или закрытых)
function calcAverageProcessingTime(leads) {
  if (!leads || leads.length === 0) return null;
  var finalLeads = leads.filter(function(l) { return isConverted(l) || isClosed(l); });
  if (finalLeads.length === 0) return null;

  var totalMs = 0, validCount = 0;
  for (var i = 0; i < finalLeads.length; i++) {
    var created  = parseBitrixDate(finalLeads[i].DATE_CREATE);
    var modified = parseBitrixDate(finalLeads[i].DATE_MODIFY);
    if (created && modified && modified > created) {
      totalMs += modified.getTime() - created.getTime();
      validCount++;
    }
  }
  if (validCount === 0) return null;
  return formatMs(totalMs / validCount);
}

// Среднее время звонка — только из звонков с DURATION > 0
function calcAvgCallDuration(calls) {
  if (!calls || calls.length === 0) return null;
  var withDur = calls.filter(function(c) { return parseInt(c.DURATION, 10) > 0; });
  if (withDur.length === 0) return null;

  var totalSec = 0;
  for (var i = 0; i < withDur.length; i++) {
    totalSec += parseInt(withDur[i].DURATION, 10);
  }
  var avg     = Math.floor(totalSec / withDur.length);
  var minutes = Math.floor(avg / 60);
  var seconds = avg % 60;
  if (minutes === 0) return seconds + 'с';
  return minutes + 'м ' + seconds + 'с';
}

// ─── Статистика по менеджеру ──────────────────────────────────────────────────

function buildManagerStat(managerId, managerLeads, managerCalls, userMap) {
  var name      = userMap[managerId] || 'Менеджер #' + managerId;
  var total     = managerLeads.length;
  var converted = managerLeads.filter(isConverted).length;
  var inProgress = managerLeads.filter(isInProgress).length;
  var closed    = managerLeads.filter(isClosed).length;
  var convRate  = total > 0 ? parseFloat(((converted / total) * 100).toFixed(1)) : 0;

  var avgProc   = calcAverageProcessingTime(managerLeads);

  var totalCalls     = managerCalls.length;
  var incomingCalls  = managerCalls.filter(function(c) { return c.DIRECTION === '1'; }).length;
  var outgoingCalls  = managerCalls.filter(function(c) { return c.DIRECTION === '2' || c.DIRECTION === '4'; }).length;
  var completedCalls = managerCalls.filter(function(c) { return c.COMPLETED === 'Y'; }).length;
  var avgCallDur     = calcAvgCallDuration(managerCalls);

  return {
    name: name, total: total, converted: converted,
    inProgress: inProgress, closed: closed, convRate: convRate,
    avgProc: avgProc,
    totalCalls: totalCalls, incomingCalls: incomingCalls,
    outgoingCalls: outgoingCalls, completedCalls: completedCalls,
    avgCallDur: avgCallDur,
  };
}

function groupByManager(items, idField) {
  var map = {};
  for (var i = 0; i < items.length; i++) {
    var id = items[i][idField];
    if (!id) continue;
    if (!map[id]) map[id] = [];
    map[id].push(items[i]);
  }
  return map;
}

// ─── Форматирование строк отчёта ──────────────────────────────────────────────

function renderManagerBlock(s, index) {
  var medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1) + '.';
  var lines = [];
  lines.push(medal + ' *' + s.name + '*');
  lines.push('   📥 Всего лидов: ' + s.total);
  lines.push('   🔄 В обработке: ' + s.inProgress);
  lines.push('   ✅ Качественных лидов: ' + s.converted);
  lines.push('   ❌ Закрыто (отказ/некачественный): ' + s.closed);
  lines.push('   📈 Конверсия: ' + s.convRate + '%');
  if (s.avgProc) {
    lines.push('   ⏱ Среднее время обработки: ' + s.avgProc);
  }
  lines.push('   📞 Звонков: ' + s.totalCalls +
    ' (вх: ' + s.incomingCalls + ' / исх: ' + s.outgoingCalls + ')');
  lines.push('   ✔️ Завершённых: ' + s.completedCalls);
  if (s.avgCallDur) {
    lines.push('   ⏳ Среднее время звонка: ' + s.avgCallDur);
  }
  lines.push('');
  return lines;
}

// ─── Основной отчёт ───────────────────────────────────────────────────────────

async function generateReport(range, title) {
  console.log('[Report] Генерирую отчёт: ' + title);

  var results = await Promise.all([
    bitrixService.getUsers(),
    bitrixService.getLeads(range.from, range.to),
    bitrixService.getAllCalls(range.from, range.to),
  ]);

  var users = results[0];
  var leads = results[1];
  var calls = results[2];

  if (!users.length) return '⚠️ Пользователи не найдены в Bitrix24.';
  if (!leads.length) return '📊 *' + title + '*\n\nЛиды за этот период не найдены.';

  var userMap       = {};
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    userMap[u.ID] = ((u.NAME || '') + ' ' + (u.LAST_NAME || '')).trim() || 'Пользователь #' + u.ID;
  }

  var leadsByMgr = groupByManager(leads, 'ASSIGNED_BY_ID');
  var callsByMgr = groupByManager(calls,  'RESPONSIBLE_ID');

  // Подсчёт реальных звонков за период (дедупликация по ID)
  var uniqueCallIds = {};
  var realCallCount = 0;
  for (var c = 0; c < calls.length; c++) {
    if (!uniqueCallIds[calls[c].ID]) {
      uniqueCallIds[calls[c].ID] = true;
      realCallCount++;
    }
  }

  var stats = [];
  var mgrIds = Object.keys(leadsByMgr);
  for (var k = 0; k < mgrIds.length; k++) {
    stats.push(buildManagerStat(mgrIds[k], leadsByMgr[mgrIds[k]], callsByMgr[mgrIds[k]] || [], userMap));
  }

  if (!stats.length) return '📊 *' + title + '*\n\nАктивность менеджеров не найдена.';
  stats.sort(function(a, b) { return b.convRate - a.convRate; });

  var lines = [];
  lines.push('📊 *Отчёт по лидам — ' + title + '*');
  lines.push('📅 ' + formatDateRange(range.from, range.to));
  lines.push('👥 Всего лидов: *' + leads.length + '*');
  lines.push('📞 Всего звонков: *' + realCallCount + '*\n');

  for (var m = 0; m < stats.length; m++) {
    var block = renderManagerBlock(stats[m], m);
    for (var b = 0; b < block.length; b++) lines.push(block[b]);
  }

  lines.push('🏆 *Лучший менеджер: ' + stats[0].name + '* (' + stats[0].convRate + '% конверсия)');
  return lines.join('\n');
}

// ─── Отчёт «В работе сейчас» ──────────────────────────────────────────────────

async function generateLiveReport() {
  var todayRange = getTodayRange();

  var results = await Promise.all([
    bitrixService.getUsers(),
    bitrixService.getLeadsCurrentlyInProgress(),
    bitrixService.getAllCalls(todayRange.from, todayRange.to),
  ]);

  var users      = results[0];
  var leads      = results[1];
  var todayCalls = results[2];

  var activeLeads = leads.filter(function(l) {
    return !isClosed(l) && l.STATUS_ID !== CONVERTED_STATUS;
  });

  if (!activeLeads.length) return '🔴 *В работе сейчас*\n\nАктивных лидов нет.';

  var userMap = {};
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    userMap[u.ID] = ((u.NAME || '') + ' ' + (u.LAST_NAME || '')).trim() || 'Пользователь #' + u.ID;
  }

  var leadsByMgr = groupByManager(activeLeads, 'ASSIGNED_BY_ID');
  var callsByMgr = groupByManager(todayCalls,  'RESPONSIBLE_ID');

  var stats = [];
  var mgrIds = Object.keys(leadsByMgr);
  for (var k = 0; k < mgrIds.length; k++) {
    var mid          = mgrIds[k];
    var mgrLeads     = leadsByMgr[mid];
    var mgrCalls     = callsByMgr[mid] || [];
    var name         = userMap[mid] || 'Менеджер #' + mid;
    var total        = mgrLeads.length;
    var avgCallDur   = calcAvgCallDuration(mgrCalls);

    stats.push({
      name: name, total: total,
      stNew:     mgrLeads.filter(function(l) { return l.STATUS_ID === 'NEW'; }).length,
      stContact: mgrLeads.filter(function(l) { return l.STATUS_ID === 'UC_W6L352'; }).length,
      stMissed:  mgrLeads.filter(function(l) { return l.STATUS_ID === 'UC_W00485'; }).length,
      stRepeat:  mgrLeads.filter(function(l) { return l.STATUS_ID === 'UC_6IZ381'; }).length,
      stPrepare: mgrLeads.filter(function(l) { return l.STATUS_ID === '3'; }).length,
      stDelayed: mgrLeads.filter(function(l) { return l.STATUS_ID === 'UC_TLEV62'; }).length,
      callsToday: mgrCalls.length,
      avgCallDur: avgCallDur,
    });
  }

  stats.sort(function(a, b) { return b.total - a.total; });

  var now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  var lines = [];
  lines.push('🔴 *Лиды в работе — прямо сейчас*');
  lines.push('🕐 Обновлено: ' + now);
  lines.push('👥 Всего активных лидов: *' + activeLeads.length + '*\n');

  for (var m = 0; m < stats.length; m++) {
    var s    = stats[m];
    var load = s.total >= 15 ? '🔴' : s.total >= 8 ? '🟡' : '🟢';
    lines.push((m + 1) + '. *' + s.name + '* ' + load);
    lines.push('   📥 Всего в работе: *' + s.total + '*');
    if (s.stNew > 0)     lines.push('   🆕 Необработанные: '         + s.stNew);
    if (s.stContact > 0) lines.push('   📞 Первичный контакт: '      + s.stContact);
    if (s.stMissed > 0)  lines.push('   📵 Недозвон: '               + s.stMissed);
    if (s.stRepeat > 0)  lines.push('   🔁 Повторный звонок: '       + s.stRepeat);
    if (s.stPrepare > 0) lines.push('   📋 Подготовка предложения: ' + s.stPrepare);
    if (s.stDelayed > 0) lines.push('   ⏸ Отложенная продажа: '      + s.stDelayed);
    lines.push('   📞 Звонков сегодня: ' + s.callsToday);
    if (s.avgCallDur) {
      lines.push('   ⏳ Среднее время звонка: ' + s.avgCallDur);
    }
    lines.push('');
  }

  var overloaded = stats.filter(function(s) { return s.total >= 15; });
  if (overloaded.length > 0) {
    lines.push('⚠️ *Перегрузка у: ' + overloaded.map(function(s) { return s.name; }).join(', ') + '*');
  }

  return lines.join('\n');
}

module.exports.generateReport      = generateReport;
module.exports.generateLiveReport  = generateLiveReport;
