// Explicit real-run evaluation. Source files are read through fs, never through the
// fact store's recovery getters, which can rewrite or delete historical records.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { makeTimeline } = require('../review/recap/facts');
const { storyKeys, localStories, groundedStory, candidateDiagnostics } = require('../review/recap/stories');
const { sanitize } = require('../review/recap/tools');
const { buildRecap, PROMPT_VERSION, TOOL_VERSION } = require('../review/recap/runner');
const { knowledgeRevision } = require('../review/recap/versions');
const { validateFactEvent } = require('./fact-protocol');
const { createOpenAiClient, readLlmConfig } = require('../agent/llm/openai');

const ROOT = path.resolve(__dirname, '..');
const DERIVED = path.join(ROOT, '.runtime', 'recap-real');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
// Mirrors the filename encoding in facts/local-fact-store without constructing a store.
const safeId = value => `${String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown'}-${hash(String(value)).slice(0, 12)}`;
const LONG_RUN = '309ec1038c6a49749de3274851d738a1';
const REGENT_RUN = '0da9bfa177a841a7bbf1091c61af0334';
const SHORT_RUN = 'ee6faa4a03e6494a9f86c032e9c91208';
const LONG_SOURCE = 'a4f659024e12401cb2c85096f95762f3:';
const REGENT_SOURCE = 'df89d6aa28704e0c9a4d7bf4e03629be:';
// Frozen before story changes, from the independent real-source audit. New input
// bytes never inherit these labels merely because their runId happens to match.
const REAL_EXPECTATIONS = {
  [REGENT_RUN]: '9dbbc87e24e1017ff1aeded675d1414cad30b80c8d205510f5268f1a5b30ddab',
  [LONG_RUN]: '2cb1b0498bf2ea866818709b2d6dbf1c9b19bd0193c2fb9e55d28b0e1063c128',
  '88ac80b42b3349e995acd36ddde04b67': '601b81f80645fe6a8904651d9982d7a9699279f33c8c21b0260d7bc481192693',
  [SHORT_RUN]: 'da805c3fdbc0be4ebc78d7ca0d39b0ba8fd49e614d78be0e49b065a893708a26'
};
const REST_TRIPLES = [[359, 363, 364], [770, 774, 775], [1167, 1187, 1188], [2095, 2099, 2100], [2360, 2364, 2365], [2730, 2734, 2735]];
const RELATIONS = {
  [LONG_RUN]: [
    { id: 'zero_hp_recovery', groups: [[3006], [3007, 3008]], kind: 'health_recovery', fields: { hpBefore: 0, hpAfter: 37 } },
    { id: 'rest_max_hp_growth', groups: REST_TRIPLES.flat().map(id => [id]), kind: 'rest_max_hp_growth', fields: { restCount: 6, perRestGain: 5, totalGain: 30 } }
  ],
  [REGENT_RUN]: [{ id: 'ending_potions_low_hp', groups: [[445, 466], [467]], kind: 'low_hp_inventory', fields: { hp: 8, potionCount: 2, potionNames: '速度药水、火焰药水' } }]
};
const metricIds = ['turn_damage', 'lethal_hit', 'absorbed', 'reloads'];
const metricLabels = ['最高回合实际爆发', '最高斩杀', '实际抗伤', 'SL次数'];
const cardSignature = card => hash(JSON.stringify({ title: card?.title, body: card?.body, evidence: [...(card?.evidenceIds || [])].sort() }));
const inputSize = value => { const json = JSON.stringify(value); return { characters: [...json].length, bytes: Buffer.byteLength(json) }; };

function normalizeUsage(usage) {
  const number = value => Number.isFinite(value) && value >= 0 ? value : null;
  return {
    inputTokens: number(usage?.prompt_tokens ?? usage?.input_tokens),
    outputTokens: number(usage?.completion_tokens ?? usage?.output_tokens),
    totalTokens: number(usage?.total_tokens),
    cachedInputTokens: number(usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens)
  };
}

function summarizeCalls(calls) {
  const phases = {};
  for (const call of calls) {
    const row = phases[call.stage] ||= { calls: 0, succeeded: 0, failed: 0, elapsedMs: 0, inputBytes: 0, maxInputBytes: 0,
      usageAvailableCalls: 0, inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null };
    row.calls++; row[call.error ? 'failed' : 'succeeded']++;
    row.elapsedMs += call.elapsedMs; row.inputBytes += call.payloadSize.bytes + call.systemSize.bytes;
    row.maxInputBytes = Math.max(row.maxInputBytes, call.payloadSize.bytes + call.systemSize.bytes);
    if (call.usage?.totalTokens != null || call.usage?.inputTokens != null) row.usageAvailableCalls++;
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens']) {
      if (call.usage?.[key] != null) row[key] = (row[key] ?? 0) + call.usage[key];
    }
  }
  return { logicalCalls: calls.length, phases,
    usageCoverage: { available: calls.filter(call => call.usage?.totalTokens != null || call.usage?.inputTokens != null).length, total: calls.length },
    totalProviderTokens: calls.some(call => call.usage?.totalTokens != null) ? calls.reduce((sum, call) => sum + (call.usage?.totalTokens ?? 0), 0) : null,
    caveat: 'provider token只累计独立逻辑调用的onUsage一次；缓存是输入子集，不重复加到total；缺用量保持null。尺寸为逻辑system与payload，非HTTP报文或token估算。' };
}

function prepareModelInput(input, leadVisibility = 'visible') {
  if (!['visible', 'hidden'].includes(leadVisibility)) throw Error('lead visibility must be visible or hidden');
  if (leadVisibility === 'visible') return { payload: input, removedPaths: [], boundary: input.stage === 'validate' ? 'post_submission_validation' : input.stage === 'closing' ? 'post_selection_closing' : 'discovery_or_repair' };
  const removedPaths = [];
  const dropKeys = new Set(['relationleadcount', 'relationleadscount', 'relationleadstruncated', 'relationleadsnote',
    'relationcount', 'relationexamples', 'relationexample', 'relationcandidates', 'knownrelationexamples',
    'derivedcandidates', 'candidateexamples', 'localstories', 'localcandidates']);
  const walk = (value, location = '') => {
    if (Array.isArray(value)) return value.map((item, index) => walk(item, `${location}[${index}]`));
    if (!value || typeof value !== 'object') return value;
    const copy = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.replace(/[_-]/g, '').toLowerCase(), next = location ? `${location}.${key}` : key;
      if (normalized === 'localleads' || normalized === 'relationleads') {
        copy[key] = []; removedPaths.push(next); continue;
      }
      if (dropKeys.has(normalized)) { removedPaths.push(next); continue; }
      // A submitted card's support packet may contain its checked relationship.
      // That is post-submission validation, not a lead shown during discovery.
      if (normalized === 'relations' && input.stage !== 'validate') {
        copy[key] = []; removedPaths.push(next); continue;
      }
      copy[key] = walk(item, next);
    }
    return copy;
  };
  const payload = walk(input);
  payload.localLeads = [];
  return { payload, removedPaths,
    boundary: input.stage === 'validate' ? 'post_submission_validation' : input.stage === 'closing' ? 'post_selection_closing' : 'discovery_or_repair' };
}

function observeModel(client, timeline, calls, { leadVisibility = 'visible' } = {}) {
  if (!client) return null;
  return { enabled: client.enabled, model: client.model, cacheKey: client.cacheKey,
    async completeRecapTurn(input, options = {}) {
      const { payload, removedPaths, boundary } = prepareModelInput(input, leadVisibility);
      const system = require('../review/recap/runner').recapSystemPrompt(payload.stage);
      const call = { id: calls.length + 1, stage: payload.stage || 'unknown', mustFinalize: payload.mustFinalize ?? null,
        remainingReads: payload.remainingReads ?? null, payloadSize: inputSize(payload), payloadHash: hash(JSON.stringify(payload)),
        hiddenLeads: leadVisibility === 'hidden', leadVisibility, stageBoundary: boundary, removedLeadPaths: removedPaths,
        systemSize: { characters: [...system].length, bytes: Buffer.byteLength(system) },
        usage: normalizeUsage(null), providerUsage: null, usageCallbacks: 0, localLeads: payload.localLeads ? sanitize(payload.localLeads) : undefined,
        validationCards: payload.stage === 'validate' ? (payload.supportPackets || []).map(packet => ({ index: packet.index, signature: cardSignature(packet.card) })) : undefined };
      calls.push(call);
      const started = performance.now();
      try {
        const answer = await client.completeRecapTurn(payload, { ...options, onUsage: info => {
          call.usageCallbacks++;
          call.providerUsage = info?.usage || null;
          call.usage = normalizeUsage(info?.usage);
          options.onUsage?.(info);
        } });
        call.answer = answer == null ? null : sanitize(answer);
        if (Array.isArray(answer?.candidates)) {
          try {
            call.candidateDiagnostics = candidateDiagnostics(timeline, answer.candidates);
            call.renderedCandidates = answer.candidates.map((candidate, index) => {
              const card = groundedStory(timeline, candidate);
              return { index, signature: card ? cardSignature(card) : null, card, candidate: sanitize(candidate) };
            });
          } catch (error) { call.diagnosticError = error.message; }
        }
        return answer;
      } catch (error) { call.error = error.message; throw error; }
      finally { call.elapsedMs = Math.round(performance.now() - started); }
    } };
}

function auditRelationSources(timeline, definition) {
  const prefix = timeline.runId === LONG_RUN ? LONG_SOURCE : REGENT_SOURCE;
  const by = n => timeline.byId.get(prefix + n);
  if (definition.id === 'zero_hp_recovery') {
    const before = by(3006), after = by(3008);
    return Boolean(before?.payload?.hp === 0 && after?.payload?.hp === 37
      && before.sourceSessionId === after.sourceSessionId && before.combatId === after.combatId
      && before.attemptGeneration === after.attemptGeneration && timeline.facts.indexOf(before) < timeline.facts.indexOf(after));
  }
  if (definition.id === 'rest_max_hp_growth') return REST_TRIPLES.every(([a, b, c]) => {
    const before = by(a), action = by(b), after = by(c);
    return before?.payload?.maxHp + 5 === after?.payload?.maxHp && action?.payload?.action === 'heal'
      && before.sourceSessionId === action.sourceSessionId && action.sourceSessionId === after.sourceSessionId
      && timeline.facts.indexOf(before) < timeline.facts.indexOf(action) && timeline.facts.indexOf(action) < timeline.facts.indexOf(after);
  });
  const last = by(466), end = by(467);
  return Boolean(last?.payload?.hp === 8 && last.payload.potions?.length === 2
    && last.payload.potions.some(potion => potion.id === 'SPEED_POTION') && last.payload.potions.some(potion => potion.id === 'FIRE_POTION')
    && end?.eventType === 'run.ended' && end.payload?.reason === 'game_ended_not_cleared');
}

function relationCoverage(timeline, card, definition) {
  const prefix = timeline.runId === LONG_RUN ? LONG_SOURCE : REGENT_SOURCE;
  const evidence = new Set(card.evidenceIds || []);
  const groupHits = definition.groups.map(group => group.some(id => evidence.has(prefix + id)));
  const expectedRelationId = `${definition.kind}:${prefix}${definition.id === 'rest_max_hp_growth' ? 359 : definition.id === 'zero_hp_recovery' ? 3006 : 466}`;
  const claims = card.assertions || [];
  const sameValue = (field, left, right) => field === 'potionNames'
    ? typeof left === 'string' && [...left.split(/[、，,与和]/)].sort().join('|') === [...right.split(/[、，,与和]/)].sort().join('|')
    : JSON.stringify(left) === JSON.stringify(right);
  const knownFields = Object.entries(definition.fields).filter(([field, value]) => claims.some(claim =>
    claim.type === 'recorded_relation' && claim.relationId === expectedRelationId && claim.field === field && sameValue(field, claim.value, value)));
  const direct = (ids, field, value) => claims.some(claim => claim.type === 'event_field' && ids.includes(claim.eventId)
    && claim.field === field && claim.value === value);
  const claimCoverage = definition.id === 'zero_hp_recovery'
    ? knownFields.length === 2 || direct([prefix + 3006], 'hp', 0) && (direct([prefix + 3008], 'hp', 37) || direct([prefix + 3007], 'currentHp', 37))
    : definition.id === 'rest_max_hp_growth' ? knownFields.length === 3
      : knownFields.some(([field]) => field === 'hp') && knownFields.some(([field]) => ['potionCount', 'potionNames'].includes(field));
  return { relationId: definition.id, endpointCoverage: groupHits.every(Boolean), matchedGroups: groupHits.filter(Boolean).length,
    totalGroups: groupHits.length, assertionCoverage: claimCoverage, sourceAvailable: auditRelationSources(timeline, definition),
    agentSemanticConfirmed: null, interest1to5: null,
    note: '仅独立端点/断言检查；正文可能未表达关系或存在额外因果，不代表语义通过或有趣。' };
}

function narrativeRisks(timeline, text) {
  const risks = [];
  if (/阵亡|牺牲|死于|战死|临死|死亡|棺材|陪葬/.test(text)
    && !timeline.facts.some(fact => fact.eventType === 'run.ended' && fact.payload?.reason === 'death')) risks.push('unproven_death');
  if (/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/.test(text)) risks.push('engineering_id_in_player_text');
  if (/证据|未证|只证明|字段|工具|快照|诊断|来源(?:不足|未知|不明)|无法确认/.test(text)) risks.push('engineering_commentary_needs_review');
  if (/药|瓶|背包|库存/.test(text) && /没动|未动|没喝|未喝|没用|未用|没有(?:用|喝)|从未使用|一直留|原封不动|舍不得|忘(?:记)?(?:用|喝)|没舍得/.test(text)) risks.push('inventory_nonuse_implication_needs_review');
  if (/从未|一次也没|一直没|没上手|没抽到|忘.*(?:药|喝)|宁死/.test(text)) risks.push('absence_or_motive_needs_review');
  if (/最高|首次|整局|累计|第.*[层幕章]|[一二三四五六七八九十]+[幕章]/.test(text)) risks.push('scope_needs_review');
  return risks;
}

function evaluateExpectations(timeline, recap, inputHash, calls = [], fallback = []) {
  const applies = REAL_EXPECTATIONS[timeline.runId] === inputHash;
  const definitions = applies ? RELATIONS[timeline.runId] || [] : [];
  const localLeads = calls.find(call => call.localLeads)?.localLeads || fallback;
  const selection = (recap.trace || []).findLast(item => item.phase === 'selection');
  const selectionMatches = (item, card) => item?.title === card.title
    && JSON.stringify([...(item.evidenceIds || [])].sort()) === JSON.stringify([...(card.evidenceIds || [])].sort());
  const sourceRecords = recap.cards.map((card, index) => {
    const signature = cardSignature(card);
    const candidates = calls.flatMap(call => (call.renderedCandidates || []).map(candidate => ({ ...candidate, callId: call.id, stage: call.stage }))).filter(candidate => candidate.signature === signature);
    // Corroboration only: final runner selection is authoritative. A verdict
    // requiring changes must never turn a same-signature fallback into model work.
    const checked = calls.some(call => call.stage === 'validate' && call.validationCards?.some(item => item.signature === signature
      && call.answer?.verdicts?.some(verdict => verdict.index === item.index && verdict.supported === true
        && (verdict.issues === undefined || Array.isArray(verdict.issues) && verdict.issues.length === 0)
        && !/但[^。]*(?:改|缺|未|不)|建议(?:改|修|补|删|收窄)|证据不足|无法支持|未证明|额外概括/.test(String(verdict.reason || '')))));
    const coverage = definitions.map(definition => relationCoverage(timeline, card, definition));
    const relationKnown = coverage.some(item => item.endpointCoverage && localLeads.some(lead =>
      relationCoverage(timeline, lead, definitions.find(definition => definition.id === item.relationId)).endpointCoverage));
    const overlapsLead = localLeads.some(lead => cardSignature(lead) === signature
      || (card.evidenceIds || []).length > 0 && (card.evidenceIds || []).every(id => lead.evidenceIds?.includes(id)));
    const isFallback = fallback.some(lead => cardSignature(lead) === signature);
    const selectedModel = Boolean(selection?.modelCards?.some(item => selectionMatches(item, card)));
    const selectedFallback = Boolean(selection?.fallbackCards?.some(item => selectionMatches(item, card)));
    let origin = 'unknown', originEvidence = selection ? 'selection_unmatched_or_conflicting' : 'no_final_selection';
    if (selection) {
      if (selectedFallback && !selectedModel) { origin = 'local_fallback'; originEvidence = 'runner_selection'; }
      else if (selectedModel && !selectedFallback) {
        origin = relationKnown || overlapsLead ? 'model_selected_known_lead' : candidates.length ? 'model_discovered_relation' : 'unknown';
        originEvidence = 'runner_selection';
      }
    } else if (isFallback && (!candidates.length || !checked)) {
      origin = 'local_fallback'; originEvidence = 'local_signature_without_approved_candidate';
    } else if (!isFallback && candidates.length && checked) {
      origin = relationKnown || overlapsLead ? 'model_selected_known_lead' : 'model_discovered_relation';
      originEvidence = 'candidate_and_strict_verdict_without_selection';
    }
    const evidence = (card.evidenceIds || []).map(id => timeline.byId.get(id)).filter(Boolean);
    const riskLocations = { title: narrativeRisks(timeline, card.title), body: narrativeRisks(timeline, card.body) };
    const risks = [...new Set([...riskLocations.title, ...riskLocations.body])];
    const text = card.title + card.body;
    if (/强化壁垒/.test(text) && evidence.some(fact => fact.payload?.cardId === 'IMPERVIOUS')) risks.push('wrong_card_name_IMPERVIOUS');
    if (/获|提供|造成|挡住|削血|叠加/.test(text) && evidence.some(fact => fact.eventType === 'card.played')
      && evidence.some(fact => /^(damage.resolved|block.changed|power.changed)$/.test(fact.eventType))
      && !(card.assertions || []).some(claim => claim.type === 'action_link')) risks.push('attribution_unproven');
    return { index, origin, originEvidence, runnerSelectedModel: selectedModel, runnerSelectedFallback: selectedFallback,
      modelCandidateCalls: candidates.map(candidate => candidate.callId), modelSemanticallyApproved: checked,
      mechanicalRelations: coverage, riskFlags: risks, riskLocations, agentReview: null };
  });
  const relations = definitions.map(definition => ({ id: definition.id, sourceAvailable: auditRelationSources(timeline, definition),
    matchingCards: sourceRecords.filter(row => row.mechanicalRelations.some(item => item.relationId === definition.id && item.endpointCoverage)).map(row => row.index),
    assertedCards: sourceRecords.filter(row => row.mechanicalRelations.some(item => item.relationId === definition.id && item.endpointCoverage && item.assertionCoverage)).map(row => row.index),
    agentSemanticConfirmed: null }));
  return { applies, expectedInputHash: REAL_EXPECTATIONS[timeline.runId] || null,
    source: 'independent-source-audit.md + independent-source-evidence.json; frozen four-run development labels',
    checks: { fixedMetricsExact: applies ? recap.fixedMetrics.length === 4 && recap.fixedMetrics.every((metric, index) =>
      metric.id === metricIds[index] && metric.label === metricLabels[index] && metric.value === null && metric.display === '未记录') : null,
    correctAbstention: applies && timeline.runId === SHORT_RUN ? recap.cards.length === 0 && !recap.closing.trim() : null,
    knownCardNameError: sourceRecords.every(row => !row.riskFlags.includes('wrong_card_name_IMPERVIOUS')),
    noEngineeringIds: sourceRecords.every(row => !row.riskFlags.includes('engineering_id_in_player_text')),
    distinctImportantRelations: relations.every(relation => relation.matchingCards.length <= 1) },
    relations, cards: sourceRecords,
    closingReview: { riskFlags: narrativeRisks(timeline, recap.closing || ''), agentReview: null, semanticConfirmed: null },
    relationDuplicates: relations.filter(relation => relation.matchingCards.length > 1).map(relation => ({ relationId: relation.id, cards: relation.matchingCards })),
    semanticReviewRequired: true };
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('Symbolic links are not accepted in evaluation sources');
    return entry.isDirectory() ? listFiles(file) : entry.isFile() ? [file] : [];
  }).sort();
}

function sourceHashes(base, historyFile, directories) {
  return [historyFile, ...directories.flatMap(listFiles)].sort().map(file => ({
    file: path.relative(base, file), sha256: hash(fs.readFileSync(file)), bytes: fs.statSync(file).size
  }));
}

function readJsonl(file, audit) {
  if (!fs.existsSync(file)) { audit.missingFiles.push(path.basename(file)); return []; }
  const rows = [];
  for (const [index, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); }
    catch { audit.parseErrors.push({ file: path.basename(file), line: index + 1 }); break; }
  }
  return rows;
}

function readEffectiveRun(directory, manifest) {
  const audit = { missingFiles: [], parseErrors: [], attempts: [], rejectedUncommitted: 0, duplicateEvents: 0 };
  const coverage = structuredClone(readJson(path.join(directory, 'coverage.json')));
  const rows = readJsonl(path.join(directory, 'events-0001.jsonl'), audit);
  const committed = new Set(manifest.eventIds || []);
  for (const [combatId, combat] of Object.entries(manifest.combats || {})) {
    let generation = combat.activeGeneration;
    let recovery = null;
    if (combat.pendingGeneration != null) {
      const pendingFile = path.join(directory, 'combats', `${safeId(combatId)}-g${combat.pendingGeneration}.jsonl`);
      if (generation == null && fs.existsSync(pendingFile) && fs.statSync(pendingFile).size > 0) {
        generation = combat.pendingGeneration;
        recovery = 'kept_unfinished_combat';
      } else recovery = 'discarded_incomplete_attempt';
      // The production loader performs the same selection at restart. Here only
      // the derived coverage is annotated: the source pointer/files stay intact.
      coverage.health ||= [];
      coverage.health.push({ type: recovery, combatId, source: 'readonly_evaluation' });
    }
    audit.attempts.push({ combatId, generation: generation ?? null, pendingGeneration: combat.pendingGeneration ?? null, recovery });
    if (generation == null) continue;
    const file = path.join(directory, 'combats', `${safeId(combatId)}-g${generation}.jsonl`);
    rows.push(...readJsonl(file, audit).filter(row => row.combatId === combatId && row.attemptGeneration === generation));
  }
  const unique = new Map();
  for (const row of rows) {
    if (row.runId !== manifest.runId || !committed.has(row.eventId)) { audit.rejectedUncommitted++; continue; }
    if (unique.has(row.eventId)) audit.duplicateEvents++;
    else unique.set(row.eventId, row);
  }
  const snapshotsFile = path.join(directory, 'snapshots-0001.jsonl');
  const snapshots = fs.existsSync(snapshotsFile) ? readJsonl(snapshotsFile, audit).filter(row => row.runId === manifest.runId) : [];
  if (audit.parseErrors.length || audit.missingFiles.length) {
    coverage.health ||= [];
    coverage.health.push({ type: 'write_failed', source: 'readonly_evaluation', reason: 'source_file_missing_or_invalid' });
  }
  const facts = [...unique.values()];
  audit.eventCount = facts.length;
  audit.eventTypes = facts.reduce((counts, row) => { counts[row.eventType] = (counts[row.eventType] || 0) + 1; return counts; }, {});
  audit.damageWithKnownSides = facts.filter(row => row.eventType === 'damage.resolved' && row.payload?.sourceSide && row.payload?.targetSide).length;
  audit.nonemptyDraws = facts.filter(row => row.eventType === 'card.drawn' && Object.keys(row.payload || {}).length).length;
  audit.runEnds = facts.filter(row => row.eventType === 'run.ended').map(row => ({ eventId: row.eventId, payload: row.payload }));
  audit.explicitDeath = audit.runEnds.some(row => row.payload?.reason === 'death');
  return { input: sanitize({ runId: manifest.runId, facts, coverage, snapshots, synthetic: false }), audit };
}

function selectRuns(base) {
  const historyFile = path.join(base, 'review-history.v2.json');
  const history = readJson(historyFile);
  const summaries = (Array.isArray(history) ? history : history.runs || []).filter(row => row.result === 'loss');
  const candidates = [];
  for (const entry of fs.readdirSync(path.join(base, 'facts', 'v1', 'runs'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(base, 'facts', 'v1', 'runs', entry.name);
    const manifestFile = path.join(directory, 'manifest.json');
    if (!fs.existsSync(manifestFile)) continue;
    const manifest = readJson(manifestFile), summary = summaries.find(row => row.runId === manifest.runId);
    if (summary && manifest.replay !== true) candidates.push({ directory, manifest, summary });
  }
  if (new Set(candidates.map(row => row.manifest.runId)).size !== candidates.length) throw Error('Duplicate real run manifests');
  return { historyFile, candidates };
}

function assertDerivedOutput(file) {
  const relative = path.relative(DERIVED, file);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw Error('Evaluation outputs must be files under .runtime/recap-real');
  }
  // Refuse symlink ancestors so a derived output cannot be redirected into source data.
  let current = path.dirname(file);
  while (current !== ROOT && current !== path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Output path contains a symbolic link');
    current = path.dirname(current);
  }
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('Output file is a symbolic link');
}

function writeDerived(file, data) {
  assertDerivedOutput(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function run(options = {}) {
  const mode = options.mode || arg('mode', 'local');
  if (!['local', 'model'].includes(mode)) throw Error('mode must be local or model');
  const leadVisibility = options.leadVisibility || arg('lead-visibility', 'visible');
  if (!['visible', 'hidden'].includes(leadVisibility)) throw Error('lead visibility must be visible or hidden');
  const base = path.resolve(options.source || arg('source', path.join(os.homedir(), 'Library', 'Application Support', 'gamebuddy')));
  const output = path.resolve(options.output || arg('output', path.join(DERIVED, `recap-real-${mode}.json`)));
  assertDerivedOutput(output);
  const { historyFile, candidates } = selectRuns(base);
  const directories = candidates.map(row => row.directory);
  const before = sourceHashes(base, historyFile, directories);
  const sourceSetHash = hash(JSON.stringify(before));
  const loaded = candidates.map(row => ({ ...row, ...readEffectiveRun(row.directory, row.manifest) }))
    .filter(row => row.audit.runEnds.some(end => end.payload?.reason !== 'abandoned' && end.payload?.cleared === false));
  if (loaded.length !== 4) throw Error(`Expected exactly four completed loss runs; found ${loaded.length}`);
  const requested = (options.cases || arg('cases', '')).split(',').filter(Boolean);
  if (requested.some(id => !loaded.some(row => row.manifest.runId === id))) throw Error('Unknown completed loss run id');
  const selected = loaded.filter(row => !requested.length || requested.includes(row.manifest.runId));
  const config = mode === 'model' ? readLlmConfig() : null;
  if (mode === 'model' && !config.enabled) throw Error('Model mode requires the existing configured API key');
  const llm = config ? createOpenAiClient({ ...config, thinking: 'disabled', temperature: 0.1, stream: false, maxTokens: 3500 }, { timeoutMs: 90000 }) : null;
  const implementationHashes = Object.fromEntries(['harness/eval-real-recap.js', 'review/recap/runner.js', 'review/recap/facts.js',
    'review/recap/stories.js', 'review/recap/claims.js', 'review/recap/tools.js', 'agent/llm/openai.js'].map(file => [file, hash(fs.readFileSync(path.join(ROOT, file)))]));
  const cases = [];
  for (const row of selected) {
    const inputBytes = `${JSON.stringify(row.input, null, 2)}\n`;
    const inputFile = path.join(DERIVED, 'inputs', `${row.manifest.runId}.json`);
    writeDerived(inputFile, row.input);
    const started = performance.now();
    const timeline = makeTimeline(row.input.runId, row.input.facts, row.input.coverage, row.input.snapshots);
    const modelCalls = [], fallback = localStories(timeline);
    const recap = await buildRecap({ ...row.input, llm: observeModel(llm, timeline, modelCalls, { leadVisibility }) });
    const independent = evaluateExpectations(timeline, recap, hash(inputBytes), modelCalls, fallback);
    const evidenceKeys = recap.cards.flatMap(card => storyKeys(timeline, card));
    const text = recap.cards.map(card => card.title + card.body).join('') + recap.closing;
    const invalidEvents = row.input.facts.map(fact => ({ eventId: fact.eventId, result: validateFactEvent(fact) })).filter(item => !item.result.ok);
    const checks = {
      sourceReadable: row.audit.missingFiles.length === 0 && row.audit.parseErrors.length === 0,
      validEvents: invalidEvents.length === 0,
      endedLoss: row.summary.result === 'loss' && row.audit.runEnds.length > 0,
      fixedSlots: recap.fixedMetrics.map(metric => metric.id).join() === 'turn_damage,lethal_hit,absorbed,reloads',
      lengths: recap.cards.length <= 3 && recap.cards.every(card => [...card.title].length <= 10 && [...card.body].length <= 40) && [...recap.closing].length <= 40,
      evidenceExists: recap.cards.every(card => card.evidenceIds.every(id => timeline.byId.has(id) || timeline.snapshotsById.has(id))),
      distinctEvidence: new Set(evidenceKeys).size === evidenceKeys.length,
      forbiddenCounterfactual: !/必胜|本来(?:能|可以)|操作失误|你(?:打错|选错)/.test(text),
      ...independent.checks
    };
    cases.push({
      id: row.manifest.runId, runId: row.manifest.runId, synthetic: false,
      summary: { character: row.summary.character, result: row.summary.result, finalFloor: row.summary.finalFloor, finalAct: row.summary.finalAct, endedAt: row.summary.endedAt },
      inputFile: path.relative(ROOT, inputFile), inputHash: hash(inputBytes), factsRevision: timeline.revision,
      sourceAudit: row.audit, capture: { completeRun: timeline.completeRun, blocked: timeline.blocked, combats: timeline.combats.size },
      elapsedMs: Math.round(performance.now() - started), checks, invalidEvents,
      fixedMetrics: recap.fixedMetrics, status: recap.status, coverageNote: recap.coverageNote,
      cards: recap.cards, closing: recap.closing, renderedCharacters: [...text].length,
      targetLength: [...text].length >= 120 && [...text].length <= 220,
      calls: modelCalls.length,
      toolReads: recap.trace.filter(item => item.phase === 'tool').length,
      providerUsage: recap.trace.filter(item => item.phase === 'usage'), cost: null,
      hiddenLeads: leadVisibility === 'hidden', independent, modelCalls, modelObservation: summarizeCalls(modelCalls),
      modelContribution: { selectedCardIndices: independent.cards.filter(card => card.runnerSelectedModel).map(card => card.index),
        knownLeadSelectionIndices: independent.cards.filter(card => card.origin === 'model_selected_known_lead').map(card => card.index),
        discoveredRelationIndices: independent.cards.filter(card => card.origin === 'model_discovered_relation').map(card => card.index),
        localFallbackIndices: independent.cards.filter(card => card.origin === 'local_fallback').map(card => card.index),
        unclassifiedIndices: independent.cards.filter(card => card.origin === 'unknown').map(card => card.index) },
      agentReview: null, humanReview: null, trace: recap.trace
    });
    // Persist progress after each run; interrupted model evaluation need not lose
    // all completed results. The final report additionally verifies source hashes.
    writeDerived(output, { schema: 'gamebuddy.real-recap-evaluation.v1', state: 'running', mode, leadVisibility, hiddenLeads: leadVisibility === 'hidden', sourceSetHash, cases });
  }
  const after = sourceHashes(base, historyFile, directories);
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const manifest = { schema: 'gamebuddy.real-recap-inputs.v1', generatedAt: new Date().toISOString(), sourceSetHash,
    selection: 'history.result=loss AND persisted run.ended cleared=false, excluding abandoned and replay',
    cases: loaded.map(row => ({ id: row.manifest.runId, synthetic: false, eventCount: row.input.facts.length })),
    originalFiles: before, originalFilesAfter: after, sourceUnchanged: unchanged };
  writeDerived(path.join(DERIVED, 'inputs', 'manifest.json'), manifest);
  const failures = cases.filter(row => Object.values(row.checks).includes(false)).map(row => row.id);
  const report = {
    schema: 'gamebuddy.real-recap-evaluation.v1', generatedAt: new Date().toISOString(), state: 'finished', mode,
    experiment: { kind: leadVisibility === 'hidden' ? 'development_set_lead_ablation' : 'development_set_visible_leads',
      leadVisibility, hiddenLeads: leadVisibility === 'hidden', holdout: false, productionDefaultsChanged: false,
      description: leadVisibility === 'hidden' ? '同四局开发数据，发现/修复请求递归隐藏程序关系线索；原始事件、状态索引、工具合同和系统任务不变。本地回填仍可发布，独立列出。' : '同四局开发数据，保留生产默认派生关系线索。',
      validationBoundary: 'validate可接收模型已提交片段的事实支持包用于核验，不作为发现阶段注入；closing仅处理已选片段。',
      interpretation: 'model_discovered_relation只是无先验线索下的机械来源标签，不代表片段有趣、事实语义通过或泛化优秀。' },
    promptVersion: PROMPT_VERSION, toolVersion: TOOL_VERSION, implementationHashes, knowledgeRevision: knowledgeRevision(), model: config?.model || null,
    sourceSetHash, sourceManifest: '.runtime/recap-real/inputs/manifest.json', originalFiles: before,
    originalFilesAfter: after, sourceUnchanged: unchanged,
    budget: { maxReads: 10, investigationRounds: 5, maxMs: 90000, adaptive: true,
      note: 'investigationRounds是默认最大响应数；旧日志自适应缩短。actualPerCase仅从本次调用观测，不把未调用样本记为模型生成。',
      actualPerCase: cases.map(row => ({ runId: row.runId, modelInvoked: row.modelCalls.length > 0, logicalCalls: row.modelCalls.length,
        investigationResponses: row.modelCalls.filter(call => call.stage === 'investigate').length,
        repairResponses: row.modelCalls.filter(call => call.stage === 'repair').length,
        validationResponses: row.modelCalls.filter(call => call.stage === 'validate').length,
        closingResponses: row.modelCalls.filter(call => call.stage === 'closing').length,
        finalizeRequestedAtCalls: row.modelCalls.filter(call => call.mustFinalize).map(call => call.id), toolReads: row.toolReads })) },
    summary: { cases: cases.length, totalEligibleRuns: loaded.length, cards: cases.reduce((sum, row) => sum + row.cards.length, 0),
      independentLabelsApplied: cases.filter(row => row.independent.applies).length,
      availableImportantRelations: cases.flatMap(row => row.independent.relations).filter(relation => relation.sourceAvailable).length,
      endpointCoveredRelations: cases.flatMap(row => row.independent.relations).filter(relation => relation.matchingCards.length > 0).length,
      assertedImportantRelations: cases.flatMap(row => row.independent.relations).filter(relation => relation.assertedCards.length > 0).length,
      correctlyAbstainedRuns: cases.filter(row => row.independent.checks.correctAbstention === true).length,
      cardOrigins: cases.flatMap(row => row.independent.cards).reduce((counts, card) => { counts[card.origin] = (counts[card.origin] || 0) + 1; return counts; }, {}),
      hiddenLeads: leadVisibility === 'hidden',
      modelSelectedCards: cases.reduce((sum, row) => sum + row.modelContribution.selectedCardIndices.length, 0),
      modelDiscoveredCards: cases.reduce((sum, row) => sum + row.modelContribution.discoveredRelationIndices.length, 0),
      localFallbackCards: cases.reduce((sum, row) => sum + row.modelContribution.localFallbackIndices.length, 0),
      totalProviderTokens: cases.some(row => row.modelObservation.totalProviderTokens != null)
        ? cases.reduce((sum, row) => sum + (row.modelObservation.totalProviderTokens ?? 0), 0) : null,
      hardCheckFailures: failures, modelEvaluated: mode === 'model', actualModelInvokedRuns: cases.filter(row => row.modelCalls.length > 0).length,
      earlyAbstainedRuns: cases.filter(row => row.trace.some(item => item.phase === 'early_abstention')).length,
      agentReviewed: false, humanReviewed: false, allSynthetic: false },
    limitations: ['四局均为开发数据，不是独立留出集', '历史loss和game_ended_not_cleared不证明死亡', '自动结构/端点/断言覆盖不证明正文语义或趣味', '旧日志缺字段不能补造；固定指标缺失保留未记录', '子agent评审须独立记录，不能冒充玩家盲评', '来源归因依赖捕获到的候选与校验；unknown不计为模型发现', 'provider usage缺失保持null；token不以字符估算；逻辑调用不等于HTTP请求次数'], cases
  };
  writeDerived(output, report);
  console.log(JSON.stringify({ output, sourceUnchanged: unchanged, ...report.summary }));
  if (!unchanged || failures.length) process.exitCode = 1;
  return report;
}

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { run, readEffectiveRun, selectRuns, sourceHashes, normalizeUsage, summarizeCalls, observeModel, prepareModelInput, evaluateExpectations, REAL_EXPECTATIONS };
