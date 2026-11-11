'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_DISPLAY_NAME = '匿名人士';
const MAX_DISPLAY_NAME = 16;

function profilePath(userDataDir) {
  return path.join(userDataDir, 'player-profile.json');
}

function normalizeDisplayName(value) {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_DISPLAY_NAME);
  return cleaned || DEFAULT_DISPLAY_NAME;
}

function readProfile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const playerId = typeof parsed?.playerId === 'string' && parsed.playerId.trim() ? parsed.playerId.trim() : '';
    return {
      displayName: normalizeDisplayName(parsed?.displayName),
      playerId
    };
  } catch {
    return { displayName: DEFAULT_DISPLAY_NAME, playerId: '' };
  }
}

function writeProfile(file, profile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  return profile;
}

function loadPlayerProfile(userDataDir) {
  const file = profilePath(userDataDir);
  const current = readProfile(file);
  if (current.playerId) return current;
  return writeProfile(file, { ...current, playerId: randomUUID() });
}

function saveDisplayName(userDataDir, displayName) {
  const current = loadPlayerProfile(userDataDir);
  return writeProfile(profilePath(userDataDir), {
    displayName: normalizeDisplayName(displayName),
    playerId: current.playerId
  });
}

module.exports = {
  DEFAULT_DISPLAY_NAME,
  MAX_DISPLAY_NAME,
  profilePath,
  normalizeDisplayName,
  loadPlayerProfile,
  saveDisplayName
};
