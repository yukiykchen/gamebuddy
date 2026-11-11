'use strict';
// 开发期同步静态图片；应用运行时仅使用打包资源，不发送对局记录。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..', 'src', 'assets', 'run-details');
const requests = new Map();
const cardFallbacks = new Map();
function add(relative, source) { requests.set(relative, source); }
for (const family of ['relics', 'potions']) {
  for (const item of require(`../agent/data/codex/${family}.json`)) {
    if (/^\/static\/images\/[a-z0-9_/.-]+\.(webp|png)$/.test(item.image_url || '')) {
      add(`${family}/${item.id.toLowerCase()}.webp`, `https://spire-codex.com${item.image_url}`);
    }
  }
}
for (const name of ['monster', 'elite', 'event', 'shop', 'rest_site', 'treasure', 'neow', 'the_kin_boss', 'knowledge_demon_boss', 'queen_boss', 'test_subject_boss']) {
  add(`rooms/${name}.webp`, `https://cdn.spire-codex.com/ui/run_history/${name}.webp`);
}
for (const name of ['top_bar_heart', 'top_bar_gold', 'top_bar_map', 'timer_icon', 'top_bar_ascension']) {
  add(`stats/${name}.webp`, `https://cdn.spire-codex.com/ui/top_bar/${name}.webp`);
}
add('characters/ironclad.webp', 'https://cdn.spire-codex.com/characters/character_icon_ironclad.webp');
for (const name of ['card_back', 'desc_box', 'attack_portrait', 'attack_portrait_shadow', 'skill_portrait', 'skill_portrait_shadow', 'power_portrait', 'power_portrait_shadow', 'banner_shadow', 'banner']) {
  add(`cards/${name}.png`, `https://spire-codex.com/static/images/ui/run_history_card/${name}.png`);
}
async function main() {
  const localCards = new Set(require('../agent/data/codex/cards.json').map(card => card.id));
  const response = await fetch('https://spire-codex.com/api/cards?lang=zhs', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Card catalog HTTP ${response.status}`);
  const catalog = await response.json();
  for (const card of catalog) {
    if (!localCards.has(card.id)) continue;
    const portrait = /^\/static\/images\/cards\/[a-z0-9_]+\.webp$/.test(card.image_url || '')
      ? [`cards/portraits/${card.id.toLowerCase()}.webp`, `https://spire-codex.com${card.image_url}`] : null;
    for (const [field, suffix] of [['image_url_card', ''], ['image_url_card_upg', '_upg']]) {
      if (!card[field]) continue;
      const url = new URL(card[field], 'https://spire-codex.com');
      if (url.origin !== 'https://cdn.spire-codex.com' || !url.pathname.startsWith('/cards-full/stable/')) continue;
      url.pathname = url.pathname.replace('/stable/', '/stable/zhs/');
      const relative = `cards/faces/${card.id.toLowerCase()}${suffix}.webp`;
      add(relative, url.href);
      if (portrait) cardFallbacks.set(relative, portrait);
    }
    if ((!card.image_url_card || !card.image_url_card_upg) && portrait) add(...portrait);
  }
  const queue = [...requests], assets = {}, failures = [], unavailable = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const [relative, source] = queue.shift(), file = path.join(root, relative);
      try {
        if (!fs.existsSync(file)) {
          const response = await fetch(source, { signal: AbortSignal.timeout(25000) });
          if (!response.ok || !/^image\//.test(response.headers.get('content-type') || '')) throw new Error(`HTTP ${response.status}`);
          const bytes = Buffer.from(await response.arrayBuffer());
          fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
        }
        const bytes = fs.readFileSync(file);
        assets[relative] = { source, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
        if (Object.keys(assets).length % 200 === 0) console.log(`Synced ${Object.keys(assets).length}/${requests.size} assets`);
      } catch (error) {
        const fallback = cardFallbacks.get(relative);
        if (fallback) {
          unavailable.push({ relative, source, error: error.message, fallback: fallback[0] });
          if (!requests.has(fallback[0])) { add(...fallback); queue.push(fallback); }
        } else failures.push({ relative, source, error: error.message });
      }
    }
  }));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ source: 'https://spire-codex.com/zhs/developers', assets: Object.fromEntries(Object.entries(assets).sort()), unavailable, failures }, null, 2) + '\n');
  console.log(JSON.stringify({ downloaded: Object.keys(assets).length, bytes: Object.values(assets).reduce((n, a) => n + a.bytes, 0), unavailable, failures }));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
