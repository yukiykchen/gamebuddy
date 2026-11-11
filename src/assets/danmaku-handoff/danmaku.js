(function (global) {
  const themes = new Set(['bird', 'reaper', 'robot', 'star', 'warrior']);

  function normalizeTheme(theme) {
    return themes.has(theme) ? theme : 'star';
  }

  function create(options) {
    const config = Object.assign({
      theme: 'star',
      text: '',
      avatar: true,
      compact: false,
      animate: true,
      basePath: './assets'
    }, options || {});

    const theme = normalizeTheme(config.theme);
    const element = document.createElement('article');
    element.className = [
      'gb-danmaku',
      `gb-danmaku--${theme}`,
      config.avatar ? '' : 'gb-danmaku--no-avatar',
      config.compact ? 'gb-danmaku--compact' : '',
      config.animate ? 'gb-danmaku--enter' : ''
    ].filter(Boolean).join(' ');

    element.dataset.theme = theme;

    if (config.avatar) {
      const image = document.createElement('img');
      image.className = 'gb-danmaku__avatar';
      image.src = `${String(config.basePath).replace(/\/$/, '')}/${theme}-head.png`;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      element.appendChild(image);
    }

    const text = document.createElement('p');
    text.className = 'gb-danmaku__text';
    text.textContent = String(config.text || '');
    element.appendChild(text);

    return element;
  }

  function mount(target, options) {
    const parent = typeof target === 'string' ? document.querySelector(target) : target;
    if (!parent) throw new Error('GameBuddyDanmaku: mount target not found');
    const element = create(options);
    parent.appendChild(element);
    return element;
  }

  function setText(element, value) {
    const text = element && element.querySelector('.gb-danmaku__text');
    if (text) text.textContent = String(value || '');
  }

  global.GameBuddyDanmaku = Object.freeze({ create, mount, setText });
})(window);

