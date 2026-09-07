const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const checks = [
  ['syntax', [path.join(__dirname, '..', 'main.js')]],
  ['preload syntax', [path.join(__dirname, '..', 'preload.js')]],
  ['renderer syntax', [path.join(__dirname, '..', 'src', 'renderer.js')]],
  ['pet syntax', [path.join(__dirname, '..', 'src', 'pet.js')]],
  ['protocol syntax', [path.join(__dirname, 'protocol.js')]],
  ['observation syntax', [path.join(__dirname, 'observation-store.js')]],
  ['replay syntax', [path.join(__dirname, 'replay-bridge.js')]],
  ['record syntax', [path.join(__dirname, 'record-bridge.js')]],
  ['event fixture', [path.join(__dirname, 'validate-events.js'), path.join(__dirname, 'fixtures', 'recorded-smoke.events.json')]],
  ['inspect syntax', [path.join(__dirname, 'inspect-bridge.js')]],
  ['protocol cases', [path.join(__dirname, 'validate-protocol.js')]],
  ['observation cases', [path.join(__dirname, 'validate-observation.js')]],
  ['fixture validation', [path.join(__dirname, 'validate-replay.js')]],
  ['recorded fixture', [path.join(__dirname, 'validate-replay.js'), path.join(__dirname, 'fixtures', 'recorded-smoke.json')]],
  ['lifecycle fixture', [path.join(__dirname, 'validate-replay.js'), path.join(__dirname, 'fixtures', 'lifecycle.json')]],
  ['agent syntax', [path.join(__dirname, '..', 'agent', 'orchestrator.js')]],
  ['recommendation syntax', [path.join(__dirname, '..', 'agent', 'recommendation.js')]],
  ['route task syntax', [path.join(__dirname, '..', 'agent', 'tasks', 'route.js')]],
  ['rest task syntax', [path.join(__dirname, '..', 'agent', 'tasks', 'rest.js')]],
  ['smith syntax', [path.join(__dirname, '..', 'agent', 'knowledge', 'smith.js')]],
  ['llm syntax', [path.join(__dirname, '..', 'agent', 'llm', 'openai.js')]],
  ['load-env syntax', [path.join(__dirname, '..', 'agent', 'llm', 'load-env.js')]],
  ['agent cases', [path.join(__dirname, 'validate-agent.js')]],
  ['Mod shape', [path.join(__dirname, 'validate-mod.js')]]
];

for (const [name, args] of checks) {
  const command = name.endsWith('syntax') || ['syntax', 'preload syntax', 'renderer syntax', 'pet syntax', 'protocol syntax', 'replay syntax', 'record syntax', 'inspect syntax', 'agent syntax', 'recommendation syntax', 'route task syntax', 'llm syntax'].includes(name)
    ? [process.execPath, '--check', ...args]
    : [process.execPath, ...args];
  const result = spawnSync(command[0], command.slice(1), { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Harness validation failed at: ${name}`);
    process.exit(result.status || 1);
  }
}

console.log(`Harness validation passed: ${checks.length} checks`);
