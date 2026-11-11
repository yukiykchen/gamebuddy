const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const files = ['agent/data/codex/cards.json', 'agent/data/codex/relics.json',
  'agent/knowledge/card-guidance.js', 'agent/knowledge/build-strategies.js', 'agent/knowledge/build-mechanics.js'];
let signature, revision;
function knowledgeRevision() {
  const paths = files.map(file => path.join(__dirname, '../..', file));
  const next = paths.map(file => { try { const s = fs.statSync(file); return `${s.size}:${s.mtimeMs}`; } catch { return 'missing'; } }).join('|');
  if (next !== signature) {
    const hash = crypto.createHash('sha256');
    for (const file of paths) { hash.update(path.basename(file)); try { hash.update(fs.readFileSync(file)); } catch { hash.update('unavailable'); } }
    signature = next; revision = hash.digest('hex').slice(0, 24);
  }
  return revision;
}
module.exports = { knowledgeRevision };
