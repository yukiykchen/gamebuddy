'use strict';

(function (root) {
  const themes = Object.freeze({
    ironclad: 'warrior',
    silent: 'bird',
    defect: 'robot',
    regent: 'star',
    necrobinder: 'reaper'
  });

  function presentationFor(message) {
    const character = String(message?.character || '').trim().toLowerCase();
    const theme = themes[character] || null;
    return {
      theme,
      avatar: Boolean(theme) && message?.recommendation?.task !== 'card_reward'
    };
  }

  const api = Object.freeze({ presentationFor });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameBuddyDanmakuTheme = api;
})(typeof window === 'object' ? window : globalThis);
