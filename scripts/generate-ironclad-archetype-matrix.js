const fs = require('node:fs');
const path = require('node:path');
const { generateMatrixMarkdown } = require('../agent/knowledge/ironclad-archetypes');

const target = path.join(__dirname, '..', 'docs', 'ironclad-four-archetype-matrix.md');
fs.writeFileSync(target, generateMatrixMarkdown(), 'utf8');
console.log(`wrote ${target}`);
