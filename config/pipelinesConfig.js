'use strict';

var PIPELINES = [
  {
    id:       0,
    name:     'Основная воронка',
    currency: 'UZS',
    wonStages:  ['WON'],
    loseStages: ['LOSE'],
    stages: [
      { id: 'NEW',           name: 'Согласование' },
      { id: 'EXECUTING',     name: 'Ожидание оплаты' },
      { id: 'FINAL_INVOICE', name: 'Отгрузка' },
      { id: 'WON',           name: 'Сделка успешна',   won:  true },
      { id: 'LOSE',          name: 'Сделка провалена', lose: true },
    ],
  },
  {
    id:            32,
    name:          'Региональные менеджеры и дилеры',
    currency:      'UZS',
    wonStages:     ['C32:WON'],
    loseStages:    ['C32:LOSE'],
    groupByRegion: true,
    regionField:   'UF_CRM_6750379924C59',
    regionMap: {
      '12428': 'Ташкент',
      '12430': 'Андижан',
      '12432': 'Наманган',
      '12434': 'Фергана',
      '12436': 'Самарканд',
      '12438': 'Бухара',
      '12440': 'Хоразм',
      '12592': 'Джизак',
      '12636': 'Нукус',
      '12722': 'Кашкадарья',
      '13372': 'Навоий',
    },
    stages: [
      { id: 'C32:NEW',       name: 'Лид передан' },
      { id: 'C32:UC_XPNSAK', name: 'Обратная связь 1' },
      { id: 'C32:UC_MW9MVA', name: 'Обратная связь 2' },
      { id: 'C32:UC_GU5SQN', name: 'Отложенная продажа' },
      { id: 'C32:UC_VM3PNJ', name: 'Повторная продажа' },
      { id: 'C32:WON',       name: 'Продажа',  won:  true },
      { id: 'C32:LOSE',      name: 'Отказ',    lose: true },
    ],
  },
  {
    id:       54,
    name:     'Экспорт',
    currency: 'USD',
    wonStages:  ['C54:WON'],
    loseStages: ['C54:LOSE'],
    stages: [
      { id: 'C54:UC_8K9PRJ',        name: 'Лид передан' },
      { id: 'C54:UC_BG6RJG',        name: 'Первичный контакт' },
      { id: 'C54:UC_HW4SLC',        name: 'Недозвон' },
      { id: 'C54:UC_76K89S',        name: 'Повторный звонок' },
      { id: 'C54:UC_D7S72M',        name: 'Подготовка предложения' },
      { id: 'C54:UC_1DX19I',        name: 'Отложенная продажа' },
      { id: 'C54:UC_9JTMSE',        name: 'Идут переговоры' },
      { id: 'C54:UC_PCY0JS',        name: 'Продажа' },
      { id: 'C54:UC_F3AT8F',        name: 'Дилер' },
      { id: 'C54:NEW',              name: 'Согласование' },
      { id: 'C54:PREPAYMENT_INVOIC', name: 'Ожидание оплаты' },
      { id: 'C54:UC_3YJIF7',        name: 'Отгрузка' },
      { id: 'C54:WON',              name: 'Сделка успешна',   won:  true },
      { id: 'C54:LOSE',             name: 'Сделка провалена', lose: true },
    ],
  },
];

var PIPELINE_MAP = {};
for (var i = 0; i < PIPELINES.length; i++) {
  PIPELINE_MAP[String(PIPELINES[i].id)] = PIPELINES[i];
}

module.exports = { PIPELINES: PIPELINES, PIPELINE_MAP: PIPELINE_MAP };
