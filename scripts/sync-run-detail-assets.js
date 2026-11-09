'use strict';
// 开发期同步静态图片；应用运行时仅使用打包资源，不发送对局记录。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..', 'src', 'assets', 'run-details');
const requests = new Map();
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
  const queue = [...requests], assets = {}, failures = [];
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
      } catch (error) { failures.push({ relative, source, error: error.message }); }
    }
  }));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ source: 'https://spire-codex.com/zhs/developers', assets: Object.fromEntries(Object.entries(assets).sort()), failures }, null, 2) + '\n');
  console.log(JSON.stringify({ downloaded: Object.keys(assets).length, bytes: Object.values(assets).reduce((n, a) => n + a.bytes, 0), failures }));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
