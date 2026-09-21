(function registerGameBuddyPetSprite() {
const SPRITE_POSES = Object.freeze(['waiting', 'watching', 'thinking', 'advising']);

const imageSpriteConfig = Object.freeze({
  kind: 'image',
  poses: Object.freeze({
    waiting: { image: './assets/pet/cujun-waiting.gif', alt: '桌宠等待游戏' },
    watching: { image: './assets/pet/cujun-watching.gif', alt: '桌宠旁观对局' },
    thinking: { image: './assets/pet/cujun-thinking.gif', alt: '桌宠正在思考' },
    advising: { image: './assets/pet/cujun-advising.gif', alt: '桌宠给出建议' }
  })
});

const cssSpriteConfig = Object.freeze({
  kind: 'css',
  poses: Object.freeze(Object.fromEntries(SPRITE_POSES.map(pose => [pose, {}])))
});

const petSpriteConfig = imageSpriteConfig;

function createCssPetSprite(root, config) {
  root.classList.add('pet-sprite--css');
  const stage = root.closest('.pet-stage');
  return {
    kind: config.kind,
    setPose(pose) {
      if (!config.poses[pose]) return;
      if (stage) stage.dataset.pose = pose;
    },
    destroy() {
      root.classList.remove('pet-sprite--css');
      if (stage) delete stage.dataset.pose;
    }
  };
}

function createImagePetSprite(root, config) {
  root.classList.add('pet-sprite--image');
  const image = document.createElement('img');
  image.className = 'pet-sprite-frame';
  image.decoding = 'async';
  image.draggable = false;
  root.append(image);
  let activePose = '';

  return {
    kind: config.kind,
    setPose(pose) {
      const poseConfig = config.poses[pose];
      if (!poseConfig || activePose === pose) return;
      activePose = pose;
      root.dataset.pose = pose;
      image.src = poseConfig.image;
      image.alt = poseConfig.alt || '';
      image.addEventListener('error', () => console.error(`[GameBuddy] pet sprite failed to load: ${poseConfig.image}`), { once: true });
    },
    destroy() {
      image.remove();
      root.classList.remove('pet-sprite--image');
      delete root.dataset.pose;
    }
  };
}

const rendererFactories = Object.freeze({
  css: createCssPetSprite,
  image: createImagePetSprite
});

function createPetSprite(root, config = petSpriteConfig) {
  const factory = rendererFactories[config.kind];
  if (!factory) throw new Error(`Unknown pet sprite renderer: ${config.kind}`);
  return factory(root, config);
}

window.GameBuddyPetSprite = Object.freeze({
  POSES: SPRITE_POSES,
  petSpriteConfig,
  imageSpriteConfig,
  cssSpriteConfig,
  createPetSprite
});
})();
