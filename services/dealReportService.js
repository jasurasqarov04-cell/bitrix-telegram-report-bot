'use strict';

var axios         = require('axios');
var config        = require('../config/config');
var bitrixService = require('./bitrixService');
var reportRanges  = require('./reportService');
var pipelinesConf = require('../config/pipelinesConfig');

var PIPELINE_MAP = pipelinesConf.PIPELINE_MAP;
var api = axios.create({ baseURL: config.bitrix.webhook, timeout: 30000 });

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ─── Загрузка сделок ──────────────────────────────────────────────────────────

async function fetchDeals(filter, extraFields) {
  var select = ['ID', 'STAGE_ID', 'CATEGORY_ID', 'OPPORTUNITY', 'CURRENCY_ID',
                'ASSIGNED_BY_ID', 'DATE_CREATE', 'CLOSEDATE', 'DATE_MODIFY', 'LEAD_ID'];
  if (extraFields) select = select.concat(extraFields);

  var all = []; var start = 0;
  for (var page = 0; page < 100; page++) {
    var resp = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        resp = await api.get('crm.deal.list.json', {
          params: { FILTER: filter, SELECT: select, ORDER: { DATE_CREATE: 'DESC' }, start: start }
        });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await sleep(2000);
      }
    }
    var data = resp.data;
    if (!data || !Array.isArray(data.result)) break;
    all = all.concat(data.result);
    if (data.next !== undefined && data.next !== null) { start = data.next; await sleep(300); }
    else break;
  }
  return all;
}

// ─── Фильтр: только сделки из лида ───────────────────────────────────────────

function fromLead(deal) {
  var lid = deal.LEAD_ID;
  return lid !== null && lid !== undefined && lid !== '' && lid !== '0' && lid !== 0;
}

// ─── Получить ID региона (строка или массив) ──────────────────────────────────

function getRegionId(deal, fieldName) {
  var val = deal[fieldName];
  if (!val) return '';
  if (Array.isArray(val)) val = val[0];
  return String(val || '').trim();
}

// ─── Форматтеры ───────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function formatDateRange(from, to) {
  function fmt(d) { return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + '.' + d.getFullYear(); }
  var f = fmt(from); var t = fmt(to);
  return f === t ? f : f + ' \u2013 ' + t;
}

function parseBitrixDate(str) {
  if (!str) return null;
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatMs(ms) {
  var totalMin = Math.floor(ms / 60000);
  var days  = Math.floor(totalMin / 1440);
  var hours = Math.floor((totalMin % 1440) / 60);
  var mins  = totalMin % 60;
  if (days > 0)  return days + '\u0434 ' + hours + '\u0447';
  if (hours > 0) return hours + '\u0447 ' + mins + '\u043c';
  return mins + '\u043c';
}

function formatMoney(amount, currency) {
  var n = parseFloat(amount) || 0;
  if (n === 0) return null;
  return Math.round(n).toLocaleString('ru-RU') + ' ' + (currency || '');
}

// ─── Статистика ───────────────────────────────────────────────────────────────

function calcStat(pipeline, deals, userMap) {
  var wonSet  = {}; pipeline.wonStages.forEach(function(s)  { wonSet[s]  = true; });
  var loseSet = {}; pipeline.loseStages.forEach(function(s) { loseSet[s] = true; });

  var total    = deals.length;
  var won      = deals.filter(function(d) { return wonSet[d.STAGE_ID]; }).length;
  var lost     = deals.filter(function(d) { return loseSet[d.STAGE_ID]; }).length;
  var inWork   = total - won - lost;
  var convRate = total > 0 ? parseFloat(((won / total) * 100).toFixed(1)) : 0;
  var totalAmount = deals.filter(function(d) { return wonSet[d.STAGE_ID]; })
    .reduce(function(s, d) { return s + (parseFloat(d.OPPORTUNITY)||0); }, 0);

  var closed = deals.filter(function(d) { return wonSet[d.STAGE_ID] || loseSet[d.STAGE_ID]; });
  var avgCloseMs = null;
  if (closed.length > 0) {
    var totalMs = 0; var cnt = 0;
    closed.forEach(function(d) {
      var c = parseBitrixDate(d.DATE_CREATE);
      var e = parseBitrixDate(d.CLOSEDATE) || parseBitrixDate(d.DATE_MODIFY);
      if (c && e && e > c) { totalMs += e - c; cnt++; }
    });
    if (cnt > 0) avgCloseMs = totalMs / cnt;
  }

  var byStage = {};
  pipeline.stages.forEach(function(st) { byStage[st.id] = 0; });
  deals.forEach(function(d) {
    byStage[d.STAGE_ID] = (byStage[d.STAGE_ID] || 0) + 1;
  });

  var groups = [];
  var isRegionReport = !!(pipeline.groupByRegion && pipeline.regionField && pipeline.regionMap);

  if (isRegionReport) {
    var byRegion = {};
    deals.forEach(function(d) {
      var rid  = getRegionId(d, pipeline.regionField);
      var name = pipeline.regionMap[rid] || (rid ? 'Регион #' + rid : 'Не указан');
      if (!byRegion[name]) byRegion[name] = { total:0, won:0, lost:0, inWork:0, amount:0 };
      byRegion[name].total++;
      if (wonSet[d.STAGE_ID])        { byRegion[name].won++;  byRegion[name].amount += parseFloat(d.OPPORTUNITY)||0; }
      else if (loseSet[d.STAGE_ID])    byRegion[name].lost++;
      else                             byRegion[name].inWork++;
    });
    var regionOrder = Object.values(pipeline.regionMap);
    groups = Object.keys(byRegion).map(function(name) {
      var r = byRegion[name];
      return { name: name, total: r.total, won: r.won, lost: r.lost, inWork: r.inWork,
               convRate: r.total > 0 ? parseFloat(((r.won/r.total)*100).toFixed(1)) : 0,
               amount: r.amount };
    });
    groups.sort(function(a, b) {
      var ia = regionOrder.indexOf(a.name); var ib = regionOrder.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1; if (ib === -1) return -1;
      return ia - ib;
    });
  } else {
    var byMgr = {};
    deals.forEach(function(d) {
      var mid = d.ASSIGNED_BY_ID; if (!mid) return;
      if (!byMgr[mid]) byMgr[mid] = { total:0, won:0, lost:0, inWork:0, amount:0 };
      byMgr[mid].total++;
      if (wonSet[d.STAGE_ID])        { byMgr[mid].won++;  byMgr[mid].amount += parseFloat(d.OPPORTUNITY)||0; }
      else if (loseSet[d.STAGE_ID])    byMgr[mid].lost++;
      else                             byMgr[mid].inWork++;
    });
    groups = Object.keys(byMgr).map(function(mid) {
      var m = byMgr[mid];
      return { name: userMap[mid] || 'Менеджер #' + mid, total: m.total, won: m.won,
               lost: m.lost, inWork: m.inWork,
               convRate: m.total > 0 ? parseFloat(((m.won/m.total)*100).toFixed(1)) : 0,
               amount: m.amount };
    });
    groups.sort(function(a, b) { return b.convRate - a.convRate || b.total - a.total; });
  }

  return { pipeline: pipeline, total: total, won: won, lost: lost, inWork: inWork,
           convRate: convRate, totalAmount: totalAmount, avgCloseMs: avgCloseMs,
           byStage: byStage, groups: groups, isRegionReport: isRegionReport };
}

// ─── Рендер ───────────────────────────────────────────────────────────────────

function renderReport(stat, title, range) {
  var p     = stat.pipeline;
  var emoji = { 54:'\uD83C\uDF0D', 32:'\uD83E\uDD1D', 0:'\uD83D\uDCBC' }[p.id] || '\uD83D\uDCBC';
  var lines = [];

  lines.push(emoji + ' *' + p.name + ' \u2014 ' + title + '*');
  lines.push('\uD83D\uDCC5 ' + formatDateRange(range.from, range.to));
  if (!stat.isRegionReport) lines.push('_\u0423\u0447\u0438\u0442\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0434\u0435\u043B\u043A\u0438 \u0438\u0437 \u043B\u0438\u0434\u043E\u0432_');
  lines.push('');

  if (stat.total === 0) {
    lines.push('\u0421\u0434\u0435\u043B\u043E\u043A \u0437\u0430 \u044D\u0442\u043E\u0442 \u043F\u0435\u0440\u0438\u043E\u0434 \u043D\u0435\u0442.');
    return lines.join('\n');
  }

  lines.push('\uD83D\uDCE6 \u0412\u0441\u0435\u0433\u043E \u0441\u0434\u0435\u043B\u043E\u043A: *' + stat.total + '*');
  var amtStr = formatMoney(stat.totalAmount, p.currency);
  if (amtStr) lines.push('\uD83D\uDCB0 \u0421\u0443\u043C\u043C\u0430 \u0432\u044B\u0438\u0433\u0440\u0430\u043D\u043D\u044B\u0445: *' + amtStr + '*');
  lines.push('');

  for (var i = 0; i < stat.groups.length; i++) {
    var g = stat.groups[i];
    var prefix = stat.isRegionReport
      ? (i + 1) + '.'
      : (i === 0 ? '\uD83E\uDD47' : i === 1 ? '\uD83E\uDD48' : i === 2 ? '\uD83E\uDD49' : (i+1) + '.');

    lines.push(prefix + ' *' + g.name + '*');
    lines.push('   \uD83D\uDCE5 \u0412\u0441\u0435\u0433\u043E: ' + g.total + '  \uD83D\uDD04 \u0412 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435: ' + g.inWork);
    lines.push('   \u2705 \u0412\u044B\u0438\u0433\u0440\u0430\u043D\u043E: ' + g.won + '  \u274C \u041F\u0440\u043E\u0438\u0433\u0440\u0430\u043D\u043E: ' + g.lost);
    lines.push('   \uD83D\uDCC8 \u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F: ' + g.convRate + '%');
    var gAmt = formatMoney(g.amount, p.currency);
    if (gAmt) lines.push('   \uD83D\uDCB0 ' + gAmt);
    lines.push('');
  }

  lines.push('\uD83D\uDCC8 \u041E\u0431\u0449\u0430\u044F \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F: *' + stat.convRate + '%*  (' + stat.won + '/' + stat.total + ')');
  if (stat.avgCloseMs) lines.push('\u23F1 \u0421\u0440\u0435\u0434\u043D\u0435\u0435 \u0432\u0440\u0435\u043C\u044F \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F: *' + formatMs(stat.avgCloseMs) + '*');
  if (amtStr) lines.push('\uD83D\uDCB0 \u0418\u0442\u043E\u0433\u043E \u0432\u044B\u0440\u0443\u0447\u043A\u0430: *' + amtStr + '*');

  if (stat.groups.length > 0) {
    lines.push('');
    if (stat.isRegionReport) {
      var best = stat.groups.slice().sort(function(a,b) { return b.won - a.won; })[0];
      lines.push('\uD83C\uDFC6 *\u041B\u0443\u0447\u0448\u0438\u0439 \u0440\u0435\u0433\u0438\u043E\u043D: ' + best.name + '* (' + best.won + ' \u0432\u044B\u0438\u0433\u0440\u0430\u043D\u043E, ' + best.convRate + '%)');
    } else {
      lines.push('\uD83C\uDFC6 *\u041B\u0443\u0447\u0448\u0438\u0439 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440: ' + stat.groups[0].name + '* (' + stat.groups[0].convRate + '% \u043A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F)');
    }
  }

  return lines.join('\n');
}

// ─── Публичная функция ────────────────────────────────────────────────────────

async function generatePipelineReport(categoryId, range, title) {
  console.log('[DealReport] cat=' + categoryId + ' ' + title);

  var pipeline = PIPELINE_MAP[String(categoryId)];
  if (!pipeline) return 'Воронка CATEGORY_ID=' + categoryId + ' не найдена.';

  var extraFields = (pipeline.groupByRegion && pipeline.regionField) ? [pipeline.regionField] : null;

  var results = await Promise.all([
    bitrixService.getUsers(),
    fetchDeals({
      CATEGORY_ID:     categoryId,
      '>=DATE_CREATE': bitrixService.formatBitrixDate(range.from),
      '<=DATE_CREATE': bitrixService.formatBitrixDate(range.to),
    }, extraFields),
  ]);

  var users = results[0];
  var deals = results[1];
  var filtered = pipeline.groupByRegion ? deals : deals.filter(fromLead);

  console.log('[DealReport] всего: ' + deals.length + ', после фильтра: ' + filtered.length);

  var userMap = {};
  users.forEach(function(u) {
    userMap[u.ID] = ((u.NAME||'') + ' ' + (u.LAST_NAME||'')).trim() || '#' + u.ID;
  });

  var stat = calcStat(pipeline, filtered, userMap);
  return renderReport(stat, title, range);
}

module.exports = {
  generatePipelineReport: generatePipelineReport,
  getTodayRange:          reportRanges.getTodayRange,
  getWeekRange:           reportRanges.getWeekRange,
  getThisMonthRange:      reportRanges.getThisMonthRange,
  getLastMonthRange:      reportRanges.getLastMonthRange,
};
