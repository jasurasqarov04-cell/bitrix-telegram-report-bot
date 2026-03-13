'use strict';

var bitrixService = require('./bitrixService');

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

var IN_PROGRESS_STATUSES = ['NEW', 'UC_W6L352', 'UC_W00485', 'UC_6IZ381', '3', 'UC_TLEV62'];
var CONVERTED_STATUS     = 'CONVERTED';
var CLOSED_STATUSES      = ['JUNK', '4'];

function isConverted(lead) { return lead.STATUS_ID === CONVERTED_STATUS; }
function isInProgress(lead) { return IN_PROGRESS_STATUSES.indexOf(lead.STATUS_ID) !== -1; }
function isClosed(lead) { return CLOSED_STATUSES.indexOf(lead.STATUS_ID) !== -1; }

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

function calcAverageProcessingTime(leads) {
  if (!leads || leads.length === 0) return 'Н/Д';
  var finalLeads = leads.filter(function(l) { return isConverted(l) || isClosed(l); });
  if (finalLeads.length === 0) return 'Н/Д';
  var totalMs = 0, validCount = 0;
  for (var i = 0; i < finalLeads.length; i++) {
    var created  = parseBitrixDate(finalLeads[i].DATE_CREATE);
    var modified = parseBitrixDate(finalLeads[i].DATE_MODIFY);
    if (created && modified && modified > created) {
      totalMs += modified.getTime() - created.getTime();
      validCount++;
    }
  }
  if (validCount === 0) return 'Н/Д';
  return formatMs(totalMs / validCount);
}

function formatDateRange(from, to) {
  var opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
  var f = from.toLocaleDateString('ru-RU', opts);
  var t = to.toLocaleDateString('ru-RU', opts);
  return f === t ? f : f + ' – ' + t;
}

// ─── Основной отчёт ───────────────────────────────────────────────────────────

async function generateReport(range, title) {
  var results = await Promise.all([
    bitrixService.getUsers(),
    bitrixService.getLeads(range.from, range.to),
    bitrixService.getDeals(range.from, range.to),
    bitrixService.getAllCalls(range.from, range.to),
  ]);

  var users = results[0];
  var leads = results[1];
  var calls = results[3];

  if (!users.length) return '⚠️ Пользователи не найдены в Bitrix24.';

  // Карта пользователей
  var userMap = {};
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    userMap[u.ID] = ((u.NAME || '') + ' ' + (u.LAST_NAME || '')).trim() || 'Пользователь #' + u.ID;
  }

  // Группируем лиды по менеджерам
  var leadsByManager = {};
  for (var j = 0; j < leads.length; j++) {
    var lead = leads[j];
    var mid = lead.ASSIGNED_BY_ID;
    if (!mid) continue;
    if (!leadsByManager[mid]) leadsByManager[mid] = [];
    leadsByManager[mid].push(lead);
  }

  // Группируем звонки по менеджерам
  var callsByManager = {};
  for (var c = 0; c < calls.length; c++) {
    var call = calls[c];
    var cid = call.RESPONSIBLE_ID;
    if (!cid) continue;
    if (!callsByManager[cid]) callsByManager[cid] = [];
    callsByManager[cid].push(call);
  }

  // Объединяем всех менеджеров: у кого есть лиды ИЛИ звонки
  var allManagerIds = {};
  Object.keys(leadsByManager).forEach(function(id) { allManagerIds[id] = true; });
  Object.keys(callsByManager).forEach(function(id) { allManagerIds[id] = true; });

  // Исключаем менеджеров которых нет в списке активных пользователей
  var managerIds = Object.keys(allManagerIds).filter(function(id) { return userMap[id]; });

  if (managerIds.length === 0) return '📊 *' + title + '*\n\nАктивность не найдена за этот период.';

  var stats = [];
  for (var k = 0; k < managerIds.length; k++) {
    var managerId    = managerIds[k];
    var managerLeads = leadsByManager[managerId] || [];
    var managerCalls = callsByManager[managerId] || [];

    var name           = userMap[managerId];
    var total          = managerLeads.length;
    var converted      = managerLeads.filter(isConverted).length;
    var inProgress     = managerLeads.filter(isInProgress).length;
    var conversionRate = total > 0 ? parseFloat(((converted / total) * 100).toFixed(1)) : 0;
    var avgTime        = calcAverageProcessingTime(managerLeads);

    var totalCalls     = managerCalls.length;
    var incomingCalls  = managerCalls.filter(function(c) { return c.DIRECTION === '1' || c.DIRECTION === 1; }).length;
    var outgoingCalls  = managerCalls.filter(function(c) { return c.DIRECTION === '2' || c.DIRECTION === 2; }).length;
    var completedCalls = managerCalls.filter(function(c) { return c.COMPLETED === 'Y' || c.COMPLETED === true; }).length;

    // Пропускаем если нет ни лидов ни звонков
    if (total === 0 && totalCalls === 0) continue;

    stats.push({
      name: name,
      total: total,
      converted: converted,
      inProgress: inProgress,
      conversionRate: conversionRate,
      avgTime: avgTime,
      totalCalls: totalCalls,
      incomingCalls: incomingCalls,
      outgoingCalls: outgoingCalls,
      completedCalls: completedCalls,
    });
  }

  if (stats.length === 0) return '📊 *' + title + '*\n\nАктивность не найдена за этот период.';

  // Сортируем: у кого есть лиды — по конверсии, у кого нет лидов — в конец по звонкам
  stats.sort(function(a, b) {
    if (a.total > 0 && b.total > 0) return b.conversionRate - a.conversionRate;
    if (a.total > 0) return -1;
    if (b.total > 0) return 1;
    return b.totalCalls - a.totalCalls;
  });

  var lines = [];
  lines.push('📊 *Отчёт по лидам — ' + title + '*');
  lines.push('📅 ' + formatDateRange(range.from, range.to));
  lines.push('👥 Всего лидов: *' + leads.length + '*');
  lines.push('📞 Всего звонков: *' + calls.length + '*\n');

  for (var m = 0; m < stats.length; m++) {
    var s = stats[m];
    var medal = m === 0 ? '🥇' : m === 1 ? '🥈' : m === 2 ? '🥉' : (m + 1) + '.';
    lines.push(medal + ' *' + s.name + '*');

    if (s.total > 0) {
      lines.push('   📥 Лидов: ' + s.total);
      lines.push('   🔄 В обработке: ' + s.inProgress);
      lines.push('   ✅ Конвертировано в сделку: ' + s.converted);
      lines.push('   📈 Конверсия: ' + s.conversionRate + '%');
      lines.push('   ⏱ Среднее время обработки: ' + s.avgTime);
    } else {
      lines.push('   📥 Лидов: 0');
    }

    lines.push('   📞 Звонков всего: ' + s.totalCalls);
    if (s.totalCalls > 0) {
      lines.push('   ☎️ Входящих: ' + s.incomingCalls + '  |  Исходящих: ' + s.outgoingCalls);
      lines.push('   ✔️ Завершённых звонков: ' + s.completedCalls);
    }
    lines.push('');
  }

  // Лучший менеджер — только среди тех у кого есть лиды
  var withLeads = stats.filter(function(s) { return s.total > 0; });
  if (withLeads.length > 0) {
    lines.push('🏆 *Лучший менеджер: ' + withLeads[0].name + '* (' + withLeads[0].conversionRate + '% конверсия)');
  }

  return lines.join('\n');
}

// ─── Лиды в работе прямо сейчас ──────────────────────────────────────────────

async function generateLiveReport() {
  var results = await Promise.all([
    bitrixService.getUsers(),
    bitrixService.getLeadsCurrentlyInProgress(),
  ]);

  var users = results[0];
  var leads = results[1];

  var activeLeads = leads.filter(function(l) {
    return !isClosed(l) && l.STATUS_ID !== CONVERTED_STATUS;
  });

  if (!activeLeads.length) return '🔴 *В работе сейчас*\n\nАктивных лидов нет.';

  var userMap = {};
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    userMap[u.ID] = ((u.NAME || '') + ' ' + (u.LAST_NAME || '')).trim() || 'Пользователь #' + u.ID;
  }

  var leadsByManager = {};
  for (var j = 0; j < activeLeads.length; j++) {
    var lead = activeLeads[j];
    var mid = lead.ASSIGNED_BY_ID;
    if (!mid) continue;
    if (!leadsByManager[mid]) leadsByManager[mid] = [];
    leadsByManager[mid].push(lead);
  }

  var stats = [];
  var managerIds = Object.keys(leadsByManager);
  for (var k = 0; k < managerIds.length; k++) {
    var managerId    = managerIds[k];
    var managerLeads = leadsByManager[managerId];
    var name      = userMap[managerId] || 'Менеджер #' + managerId;
    var total     = managerLeads.length;
    var stNew     = managerLeads.filter(function(l) { return l.STATUS_ID === 'NEW'; }).length;
    var stContact = managerLeads.filter(function(l) { return l.STATUS_ID === 'UC_W6L352'; }).length;
    var stMissed  = managerLeads.filter(function(l) { return l.STATUS_ID === 'UC_W00485'; }).length;
    var stRepeat  = managerLeads.filter(function(l) { return l.STATUS_ID === 'UC_6IZ381'; }).length;
    var stPrepare = managerLeads.filter(function(l) { return l.STATUS_ID === '3'; }).length;
    var stDelayed = managerLeads.filter(function(l) { return l.STATUS_ID === 'UC_TLEV62'; }).length;

    stats.push({
      name: name, total: total,
      stNew: stNew, stContact: stContact, stMissed: stMissed,
      stRepeat: stRepeat, stPrepare: stPrepare, stDelayed: stDelayed,
    });
  }

  stats.sort(function(a, b) { return b.total - a.total; });

  var now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  var lines = [];
  lines.push('🔴 *Лиды в работе — прямо сейчас*');
  lines.push('🕐 Обновлено: ' + now);
  lines.push('👥 Всего активных лидов: *' + activeLeads.length + '*\n');

  for (var m = 0; m < stats.length; m++) {
    var s = stats[m];
    var load = s.total >= 15 ? '🔴' : s.total >= 8 ? '🟡' : '🟢';
    lines.push((m + 1) + '. *' + s.name + '* ' + load);
    lines.push('   📥 Всего в работе: *' + s.total + '*');
    if (s.stNew > 0)     lines.push('   🆕 Необработанные: ' + s.stNew);
    if (s.stContact > 0) lines.push('   📞 Первичный контакт: ' + s.stContact);
    if (s.stMissed > 0)  lines.push('   📵 Недозвон: ' + s.stMissed);
    if (s.stRepeat > 0)  lines.push('   🔁 Повторный звонок: ' + s.stRepeat);
    if (s.stPrepare > 0) lines.push('   📋 Подготовка предложения: ' + s.stPrepare);
    if (s.stDelayed > 0) lines.push('   ⏸ Отложенная продажа: ' + s.stDelayed);
    lines.push('');
  }

  var overloaded = stats.filter(function(s) { return s.total >= 15; });
  if (overloaded.length > 0) {
    lines.push('⚠️ *Перегрузка у: ' + overloaded.map(function(s) { return s.name; }).join(', ') + '*');
  }

  return lines.join('\n');
}

module.exports = {
  getTodayRange: getTodayRange,
  getWeekRange: getWeekRange,
  getThisMonthRange: getThisMonthRange,
  getLastMonthRange: getLastMonthRange,
  generateReport: generateReport,
  generateLiveReport: generateLiveReport,
};
