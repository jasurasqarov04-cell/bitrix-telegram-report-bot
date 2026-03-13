'use strict';

var axios  = require('axios');
var config = require('../config/config');

var api = axios.create({
  baseURL: config.bitrix.webhook,
  timeout: 30000,
});

// ─── Базовый пагинатор ────────────────────────────────────────────────────────

async function fetchAll(method, params) {
  params = params || {};
  var allItems = [];
  var start    = 0;
  var MAX_PAGES = 100; // 100 × 50 = 5000 max — достаточно для любого реального объёма

  for (var page = 0; page < MAX_PAGES; page++) {
    var reqParams = Object.assign({}, params, { start: start });
    var response  = null;

    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await api.get(method + '.json', { params: reqParams });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        console.log('[Bitrix] Попытка ' + attempt + ' (' + method + '), повтор через 2 сек...');
        await sleep(2000);
      }
    }

    var data = response.data;
    if (!data || !Array.isArray(data.result)) break;

    allItems = allItems.concat(data.result);

    if (data.next !== undefined && data.next !== null) {
      start = data.next;
      await sleep(300);
    } else {
      break;
    }
  }

  return allItems;
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// ─── Форматирование дат ───────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function formatBitrixDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function formatVoxDate(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function buildDateFilter(dateFrom, dateTo) {
  return {
    '>=DATE_CREATE': formatBitrixDate(dateFrom),
    '<=DATE_CREATE': formatBitrixDate(dateTo),
  };
}

// ─── Пользователи ─────────────────────────────────────────────────────────────

async function getUsers() {
  return fetchAll('user.get', {
    FILTER: { ACTIVE: true },
    SELECT: ['ID', 'NAME', 'LAST_NAME'],
  });
}

// ─── Лиды ─────────────────────────────────────────────────────────────────────

async function getLeads(dateFrom, dateTo) {
  return fetchAll('crm.lead.list', {
    FILTER: buildDateFilter(dateFrom, dateTo),
    SELECT: ['ID', 'TITLE', 'STATUS_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY'],
  });
}

async function getDeals(dateFrom, dateTo) {
  return fetchAll('crm.deal.list', {
    FILTER: buildDateFilter(dateFrom, dateTo),
    SELECT: ['ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'LEAD_ID'],
  });
}

async function getLeadsCurrentlyInProgress() {
  return fetchAll('crm.lead.list', {
    FILTER: { '!STATUS_ID': ['CONVERTED', 'JUNK', '4'] },
    SELECT: ['ID', 'STATUS_ID', 'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'TITLE'],
  });
}

// ─── Звонки ───────────────────────────────────────────────────────────────────
// Основная стратегия: voximplant.statistic.get — самый точный источник для звонков.
// Запасной вариант: crm.activity.list с TYPE_ID=2, но ТОЛЬКО если voximplant не дал результат.

async function getAllCalls(dateFrom, dateTo) {
  var diffDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000);
  console.log('[Bitrix] Загружаю звонки за ' + diffDays + ' дн.');

  // ── 1. Пробуем voximplant (самый точный, содержит CALL_DURATION) ──
  try {
    var vox = await fetchAll('voximplant.statistic.get', {
      FILTER: {
        '>=CALL_START_DATE': formatVoxDate(dateFrom),
        '<=CALL_START_DATE': formatVoxDate(dateTo),
      },
      ORDER:  { CALL_START_DATE: 'DESC' },
      SELECT: ['ID', 'PORTAL_USER_ID', 'CALL_START_DATE', 'CALL_TYPE', 'CALL_DURATION', 'CALL_FAILED_CODE'],
    });

    if (vox.length > 0) {
      console.log('[Bitrix] ✅ voximplant звонков: ' + vox.length);
      return vox.map(function(c) {
        var dur = parseInt(c.CALL_DURATION, 10) || 0;
        // CALL_TYPE: 1=входящий, 2=исходящий, 3=входящий с переадресацией, 4=обратный звонок
        // Завершённый = длительность > 0 И код не означает отказ (0 или 200 = успех)
        var failCode = parseInt(c.CALL_FAILED_CODE, 10) || 0;
        var completed = dur > 0 && (failCode === 0 || failCode === 200);
        return {
          ID:             c.ID,
          RESPONSIBLE_ID: c.PORTAL_USER_ID,
          DATE_CREATE:    c.CALL_START_DATE,
          DIRECTION:      String(c.CALL_TYPE || '2'),
          COMPLETED:      completed ? 'Y' : 'N',
          DURATION:       dur,
        };
      });
    }

    console.log('[Bitrix] voximplant вернул 0 записей, пробую crm.activity.list...');
  } catch (e) {
    console.log('[Bitrix] voximplant ошибка: ' + e.message + ', пробую crm.activity.list...');
  }

  // ── 2. Запасной: crm.activity.list (TYPE_ID=2 — звонки) ──
  // ВАЖНО: фильтрация по дате здесь ненадёжна в некоторых версиях Bitrix,
  // поэтому после загрузки фильтруем вручную по DATE_CREATE.
  try {
    var raw = await fetchAll('crm.activity.list', {
      FILTER: {
        '>=DATE_CREATE': formatBitrixDate(dateFrom),
        '<=DATE_CREATE': formatBitrixDate(dateTo),
        TYPE_ID: 2,
      },
      ORDER:  { DATE_CREATE: 'DESC' },
      SELECT: ['ID', 'RESPONSIBLE_ID', 'DATE_CREATE', 'DIRECTION', 'COMPLETED',
               'DURATION_MINUTES', 'STARTTIME', 'ENDTIME'],
    });

    // Ручная фильтрация по дате (на случай если Bitrix не применил фильтр)
    var fromTs = dateFrom.getTime();
    var toTs   = dateTo.getTime();

    var calls = raw.filter(function(c) {
      var d = new Date(c.DATE_CREATE);
      return !isNaN(d.getTime()) && d.getTime() >= fromTs && d.getTime() <= toTs;
    });

    console.log('[Bitrix] ✅ crm.activity.list звонков (после фильтра): ' + calls.length + ' из ' + raw.length);

    return calls.map(function(c) {
      // Пробуем вычислить длительность из STARTTIME/ENDTIME, иначе DURATION_MINUTES
      var dur = 0;
      if (c.STARTTIME && c.ENDTIME) {
        var s = new Date(c.STARTTIME);
        var e = new Date(c.ENDTIME);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e > s) {
          dur = Math.floor((e.getTime() - s.getTime()) / 1000);
        }
      }
      if (dur === 0 && c.DURATION_MINUTES) {
        dur = parseInt(c.DURATION_MINUTES, 10) * 60 || 0;
      }
      return {
        ID:             c.ID,
        RESPONSIBLE_ID: c.RESPONSIBLE_ID,
        DATE_CREATE:    c.DATE_CREATE,
        DIRECTION:      String(c.DIRECTION || '2'),
        COMPLETED:      c.COMPLETED === 'Y' || c.COMPLETED === true ? 'Y' : 'N',
        DURATION:       dur,
      };
    });
  } catch (e2) {
    console.log('[Bitrix] crm.activity.list ошибка: ' + e2.message);
  }

  return [];
}

module.exports = {
  getUsers:                    getUsers,
  getLeads:                    getLeads,
  getDeals:                    getDeals,
  getAllCalls:                  getAllCalls,
  getLeadsCurrentlyInProgress: getLeadsCurrentlyInProgress,
  formatBitrixDate:            formatBitrixDate,
};
