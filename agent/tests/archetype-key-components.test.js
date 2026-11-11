const test = require('node:test');
const assert = require('node:assert/strict');
const cards = require('../data/codex/cards.json');
const relics = require('../data/codex/relics.json');
const { IRONCLAD_ARCHETYPE_MATRIX } = require('../knowledge/ironclad-archetypes');
const {
  KEY_COMPONENTS,
  displayName,
  evaluateCardAlerts,
  evaluateShopAlerts
} = require('../knowledge/archetype-key-components');

const cardNames = new Map(cards.map(card => [card.id, card.name]));
const relicNames = new Map(relics.map(relic => [relic.id, relic.name]));

test('关键组件都来自矩阵或 Codex，痛击、纸钱和外卡钳不进入务必拿下', () => {
  assert.equal(KEY_COMPONENTS.some(item => item.id === 'PAPER_MONEY' || item.id === 'CALIPERS'), false);
  assert.equal(KEY_COMPONENTS.some(item => item.id === 'BASH'), false);
  for (const item of KEY_COMPONENTS) {
    if (item.kind === 'card') {
      assert.equal(IRONCLAD_ARCHETYPE_MATRIX[item.id][item.archetypeKey].group, item.functionId === 'block_growth' ? 'block_gate' : item.functionId);
      assert.ok(IRONCLAD_ARCHETYPE_MATRIX[item.id][item.archetypeKey].weight > 0);
      assert.equal(typeof cardNames.get(item.id), 'string');
    } else {
      assert.equal(typeof relicNames.get(item.id), 'string');
    }
  }
  for (const id of ['ANCHOR', 'ORICHALCUM']) {
    assert.equal(KEY_COMPONENTS.find(item => item.id === id).type, 'ordinary_support');
  }
  assert.equal(displayName('relic', 'ORICHALCUM', '山铜'), '奥利哈钢');
});

test('起始牌只有打击和防御时，地狱狂徒强推，壁垒只提示方向', () => {
  const deck = [
    ...Array.from({ length: 5 }, () => ({ id: 'STRIKE_IRONCLAD', name: '打击' })),
    ...Array.from({ length: 4 }, () => ({ id: 'DEFEND_IRONCLAD', name: '防御' })),
    { id: 'BASH', name: '痛击' }
  ];
  const alerts = evaluateCardAlerts({
    character: 'ironclad',
    deck,
    cards: [
      { id: 'HELLRAISER', name: '地狱狂徒' },
      { id: 'BARRICADE', name: '壁垒' },
      { id: 'BASH', name: '痛击' }
    ]
  });
  const hellraiser = alerts.find(item => item.offer.id === 'HELLRAISER');
  const barricade = alerts.find(item => item.offer.id === 'BARRICADE');
  assert.equal(hellraiser.level, 'must_take');
  assert.match(hellraiser.text, /务必拿下/);
  assert.equal(barricade.level, 'direction');
  assert.match(barricade.text, /可考虑这个方向/);
  assert.equal(alerts.some(item => item.offer.id === 'BASH'), false);
});

test('缺少自动打击启动时地狱狂徒务必拿下，痛击不播报', () => {
  const deck = [{ id: 'POMMEL_STRIKE', name: '剑柄打击' }, { id: 'STRIKE_IRONCLAD', name: '打击' }];
  const alerts = evaluateCardAlerts({
    character: 'ironclad',
    deck,
    cards: [
      { id: 'HELLRAISER', name: '地狱狂徒' },
      { id: 'BASH', name: '痛击' }
    ]
  });
  assert.deepEqual(alerts.map(item => item.text), [
    '自动打击流启动牌「地狱狂徒」出现了，能补上自动打击启动，务必拿下！'
  ]);
  assert.equal(evaluateCardAlerts({
    character: 'ironclad',
    deck,
    cards: [{ id: 'HELLRAISER', preview: true, name: '地狱狂徒' }, { name: '随机卡牌', random: true }]
  }).length, 0);
});

test('核心协同用重点关注，已有启动不再强推副本，无配套的壁垒只提示方向', () => {
  const focus = evaluateCardAlerts({
    character: 'ironclad',
    deck: [{ id: 'HELLRAISER', name: '地狱狂徒' }],
    cards: [{ id: 'POMMEL_STRIKE', name: '剑柄打击' }]
  });
  assert.equal(focus[0].text, '「剑柄打击」能补齐自动打击流的抽牌循环，重点关注！');
  assert.equal(focus[0].level, 'focus');

  const duplicate = evaluateCardAlerts({
    character: 'ironclad',
    deck: [{ id: 'HELLRAISER', name: '地狱狂徒' }, { id: 'POMMEL_STRIKE', name: '剑柄打击' }],
    cards: [{ id: 'HELLRAISER', name: '地狱狂徒' }]
  });
  assert.equal(duplicate.some(item => item.level === 'must_take'), false);
  assert.equal(duplicate.length, 0);

  const extraLoop = evaluateCardAlerts({
    character: 'ironclad',
    deck: [{ id: 'HELLRAISER', name: '地狱狂徒' }, { id: 'POMMEL_STRIKE', name: '剑柄打击' }],
    cards: [{ id: 'PILLAGE', name: '劫掠' }]
  });
  assert.equal(extraLoop[0].level, 'focus');
  assert.doesNotMatch(extraLoop[0].text, /务必拿下/);

  const direction = evaluateCardAlerts({
    character: 'ironclad',
    deck: [{ id: 'POMMEL_STRIKE', name: '剑柄打击' }],
    cards: [{ id: 'BARRICADE', name: '壁垒' }, { id: 'UNMOVABLE', name: '坚定不移' }]
  });
  assert.ok(direction.every(item => item.level === 'direction'));
  assert.match(direction[0].text, /格挡壁垒启动牌「壁垒」出现，可考虑这个方向/);
  assert.equal(direction.some(item => /务必拿下/.test(item.text)), false);

  const exhaust = evaluateCardAlerts({
    character: 'ironclad',
    deck: [{ id: 'FEEL_NO_PAIN', name: '无惧疼痛' }],
    cards: [{ id: 'BURNING_PACT', name: '燃烧契约' }]
  });
  assert.equal(exhaust[0].level, 'focus');
  assert.match(exhaust[0].text, /重点关注/);
  const otherStarter = evaluateCardAlerts({
    character: 'ironclad',
    deck: [{ id: 'FEEL_NO_PAIN', name: '无惧疼痛' }],
    cards: [{ id: 'DARK_EMBRACE', name: '黑暗之拥' }]
  });
  assert.equal(otherStarter[0].level, 'must_take');
});

test('商店区分买得起、买不起、价格未知、售出后缺口和合计买不起', () => {
  const deck = [{ id: 'POMMEL_STRIKE', name: '剑柄打击' }, { id: 'STRIKE_IRONCLAD', name: '打击' }];
  const affordable = evaluateShopAlerts({
    character: 'ironclad',
    deck,
    gold: 200,
    items: [{ itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: 80, stocked: true, stockKey: 'card:1', card: { upgraded: false } }]
  });
  assert.match(affordable.text, /商店发现自动打击流关键牌「地狱狂徒」，能补上启动，务必拿下！/);

  const poor = evaluateShopAlerts({
    character: 'ironclad',
    deck,
    gold: 10,
    items: [{ itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: 80, stocked: true, stockKey: 'card:1', card: { upgraded: false } }]
  });
  assert.equal(poor.text, '发现自动打击流关键牌「地狱狂徒」，但目前金币不足。');
  assert.doesNotMatch(poor.text, /务必拿下/);

  const unknown = evaluateShopAlerts({
    character: 'ironclad',
    deck,
    gold: 200,
    items: [{ itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: null, stocked: true, stockKey: 'card:1', card: { upgraded: false } }]
  });
  assert.match(unknown.text, /价格尚未确认/);
  assert.doesNotMatch(unknown.text, /务必拿下/);

  const relic = evaluateShopAlerts({
    character: 'ironclad',
    deck: [{ id: 'HELLRAISER' }, { id: 'PERFECTED_STRIKE' }, { id: 'STRIKE_IRONCLAD' }],
    gold: 300,
    items: [{ itemType: 'relic', id: 'STRIKE_DUMMY', name: '打击木偶', price: 100, stocked: true, stockKey: 'relic:0' }]
  });
  assert.equal(relic.text, '关键遗物「打击木偶」在售，能改善自动打击流的打击兑现，重点关注！');

  const ordinary = evaluateShopAlerts({
    character: 'ironclad',
    deck,
    gold: 300,
    items: [
      { itemType: 'relic', id: 'ANCHOR', name: '锚', price: 100, stocked: true, stockKey: 'relic:1' },
      { itemType: 'relic', id: 'ORICHALCUM', name: '奥利哈钢', price: 100, stocked: true, stockKey: 'relic:2' },
      { itemType: 'relic', id: 'PAPER_MONEY', name: '纸钱', price: 50, stocked: true, stockKey: 'relic:3' },
      { itemType: 'relic', id: 'CALIPERS', name: '外卡钳', price: 50, stocked: true, stockKey: 'relic:4' }
    ]
  });
  assert.equal(ordinary, null);

  const both = evaluateShopAlerts({
    character: 'ironclad',
    deck: [{ id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, { id: 'STRIKE_IRONCLAD' }],
    gold: 90,
    items: [
      { itemType: 'card', id: 'PERFECTED_STRIKE', name: '完美打击', price: 50, stocked: true, stockKey: 'card:0', card: { upgraded: false } },
      { itemType: 'relic', id: 'STRIKE_DUMMY', name: '打击木偶', price: 60, stocked: true, stockKey: 'relic:0' }
    ]
  });
  assert.equal((both.text.match(/务必拿下/g) || []).length <= 1, true);
  assert.match(both.text, /只能优先其一/);
  assert.equal(both.alerts.length <= 2, true);

  const owned = evaluateShopAlerts({
    character: 'ironclad',
    deck: [...deck, { id: 'HELLRAISER', name: '地狱狂徒' }],
    gold: 200,
    items: [{ itemType: 'card', id: 'HELLRAISER', name: '地狱狂徒', price: 80, stocked: true, stockKey: 'card:1', card: { upgraded: false } }]
  });
  assert.equal(owned, null);
});

test('格挡放大不替代留存，单消耗收益也能提示批量消耗配合', () => {
  const retention = evaluateCardAlerts({ character: 'ironclad', deck: [{ id: 'UNMOVABLE' }, { id: 'BODY_SLAM' }, { id: 'BLOOD_WALL' }], cards: [{ id: 'BARRICADE', name: '壁垒' }] });
  assert.ok(retention.some(item => item.offer.id === 'BARRICADE' && item.level === 'must_take'));
  const growth = evaluateCardAlerts({ character: 'ironclad', deck: [{ id: 'BARRICADE' }, { id: 'BODY_SLAM' }, { id: 'BLOOD_WALL' }], cards: [{ id: 'UNMOVABLE', name: '坚定不移' }] });
  assert.ok(growth.some(item => item.offer.id === 'UNMOVABLE'));
  const exhaust = evaluateCardAlerts({ character: 'ironclad', deck: [{ id: 'FEEL_NO_PAIN' }], cards: [{ id: 'FIEND_FIRE', name: '恶魔之焰' }] });
  assert.ok(exhaust.some(item => item.offer.id === 'FIEND_FIRE' && item.level === 'focus'));
});


test('已有痛击填满放大槽不代表打击木偶无用，关键遗物仍可提示但持有后不重复', () => {
  const deck = [{ id: 'STRIKE_IRONCLAD', name: '打击' }, { id: 'BASH', name: '痛击' }];
  const items = [{ itemType: 'relic', id: 'STRIKE_DUMMY', name: '打击木偶', price: 150, stocked: true, stockKey: 'relic:0' }];
  const result = evaluateShopAlerts({ character: 'ironclad', deck, gold: 200, items });
  assert.match(result.text, /打击木偶/);
  assert.equal(evaluateShopAlerts({ character: 'ironclad', deck, relics: [{ id: 'STRIKE_DUMMY' }], gold: 200, items }), null);
});
