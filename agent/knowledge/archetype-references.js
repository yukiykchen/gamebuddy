// 真实通关牌表是教学参照，不代表唯一/全局最优，遗物不作为搜集清单。
// 四套来源完整保留；只比较卡牌功能，未知改造与附魔不猜测。
// 攻略机制依据：https://slaythespire2.net/zh-CN/build/ironclad
const RULE_VERSION = 'affinity-2.1.0';
const references = {
  "auto_strike": {
    "name": "自动打击·抽牌打击",
    "origin": "https://spire-codex.com/zhs/runs/b88bf732fa576d92",
    "cards": [
      "STRIKE_IRONCLAD*3",
      "DEFEND_IRONCLAD*2",
      "BASH",
      "ASCENDERS_BANE",
      "SPITE",
      "POMMEL_STRIKE+*6",
      "ANGER",
      "HELLRAISER",
      "POMMEL_STRIKE",
      "FINESSE"
    ],
    "relics": [],
    "roles": {
      "starter": [
        20,
        1
      ],
      "loop": [
        18,
        3
      ],
      "strikes": [
        15,
        6
      ],
      "output": [40, 6],
      "resource": [
        5,
        0.5
      ],
      "amplification": [2, 0.5]
    },
    "links": [
      [
        "starter",
        "loop"
      ],
      [
        "starter",
        "strikes"
      ]
    ],
    "identity": [
      "starter",
      "loop"
    ],
    "labels": {
      "starter": "自动打击启动",
      "loop": "抽牌打击循环",
      "strikes": "打击牌供给",
      "output": "打击输出与成长",
      "resource": "通用资源支持", "amplification": "打击伤害放大"
    }
  },
  "exhaust": {
    "name": "消耗·抽牌与格挡引擎",
    "origin": "https://spire-codex.com/zhs/runs/cc13f514aeaf999c",
    "cards": [
      "STRIKE_IRONCLAD+",
      "STRIKE_IRONCLAD*3",
      "DEFEND_IRONCLAD*4",
      "BASH",
      "ASCENDERS_BANE",
      "POMMEL_STRIKE+",
      "SHRUG_IT_OFF",
      "STOKE+",
      "HEADBUTT+",
      "ASHEN_STRIKE*2",
      "BATTLE_TRANCE+",
      "TRUE_GRIT+*2",
      "SHRUG_IT_OFF+*2",
      "ARMAMENTS+",
      "TAUNT+",
      "BRAND+",
      "ANCIENTSAWAKENED-CINDERBORN+",
      "ANGER",
      "BLUDGEON",
      "SECOND_WIND+",
      "HOWL_FROM_BEYOND+",
      "FEEL_NO_PAIN+",
      "DARK_EMBRACE+",
      "TREMBLE+",
      "POMMEL_STRIKE+",
      "ARMAMENTS+",
      "EVIL_EYE+",
      "DECAY",
      "DRUM_OF_BATTLE+"
    ],
    "relics": [],
    "roles": {
      "outlet": [
        30,
        3
      ],
      "draw": [
        20,
        1
      ],
      "block": [
        15,
        1
      ],
      "payoff": [
        30,
        2
      ],
      "resource": [
        5,
        3
      ]
    },
    "links": [
      [
        "outlet",
        "draw"
      ],
      [
        "outlet",
        "block"
      ],
      [
        "outlet",
        "payoff"
      ]
    ],
    "identity": [
      "outlet",
      "draw",
      "block",
      "payoff"
    ],
    "labels": {
      "outlet": "主动消耗手段",
      "draw": "消耗转抽牌",
      "block": "消耗转格挡",
      "payoff": "消耗转输出",
      "resource": "通用资源支持"
    }
  },
  "strength": {
    "name": "力量·成长与多段输出",
    "origin": "https://spire-codex.com/zhs/runs/55701f908dd5f15f",
    "cards": [
      "STRIKE_IRONCLAD",
      "STRIKE_IRONCLAD+",
      "DEFEND_IRONCLAD",
      "DEFEND_IRONCLAD+",
      "BASH",
      "ASCENDERS_BANE",
      "EXPECT_A_FIGHT+",
      "BREAKTHROUGH+",
      "FIGHT_ME",
      "BLOODLETTING*2",
      "DEMON_FORM+",
      "FORGOTTEN_RITUAL",
      "SWORD_BOOMERANG+",
      "SCRAWL+",
      "CONFLAGRATION+",
      "ULTIMATE_DEFEND",
      "UNMOVABLE+",
      "IMPERVIOUS",
      "BARRICADE+"
    ],
    "relics": [],
    "roles": {
      "source": [
        35,
        2
      ],
      "output": [
        45,
        2
      ],
      "resource": [
        5,
        3
      ],
      "defense": [
        15,
        2
      ]
    },
    "links": [
      [
        "source",
        "output"
      ]
    ],
    "identity": [
      "source",
      "output"
    ],
    "labels": {
      "source": "力量来源",
      "output": "多段与重复输出",
      "resource": "通用资源支持",
      "defense": "基本防御"
    }
  },
  "block": {
    "name": "格挡·壁垒与全身撞击",
    "origin": "https://spire-codex.com/zhs/runs/771edca84735c8d3",
    "cards": [
      "ASCENDERS_BANE",
      "BARRICADE+",
      "BASH",
      "BATTLE_TRANCE+",
      "BLOOD_WALL",
      "BLOOD_WALL+",
      "BODY_SLAM+*2",
      "BODY_SLAM",
      "COLOSSUS+",
      "CRIMSON_MANTLE",
      "DEFEND_IRONCLAD*4",
      "FINESSE",
      "MAD_SCIENCE",
      "PROLONG+",
      "SHRUG_IT_OFF",
      "TEAR_ASUNDER+",
      "TREMBLE"
    ],
    "relics": [],
    "roles": {
      "retention": [
        25,
        1
      ],
      "conversion": [
        35,
        2
      ],
      "generation": [
        20,
        3
      ],
      "growth": [
        15,
        1
      ],
      "resource": [
        5,
        2
      ]
    },
    "links": [
      [
        "retention",
        "generation"
      ],
      [
        "conversion",
        "generation"
      ],
      [
        "growth",
        "generation"
      ]
    ],
    "identity": [
      "retention",
      "conversion",
      "growth"
    ],
    "labels": {
      "retention": "跨回合保留格挡",
      "conversion": "格挡转输出",
      "generation": "格挡来源",
      "growth": "格挡增长与放大",
      "resource": "通用资源支持"
    }
  }
};
for (const [id, plan] of Object.entries(references)) {
  plan.id = `${id}_reference`;
  plan.review = 'guide-and-card-facts-checked; no independent expert review';
}
// 消耗可走单收益引擎，不强迫每套卡同时带无惧疼痛和黑暗之拥。
const drawRoute = {
  ...references.exhaust, id: 'exhaust_draw', name: '消耗·抽牌与消耗堆兑现',
  origin: 'https://spire-codex.com/zhs/runs/2dd1c482c04fadec',
  cards: ["STRIKE_IRONCLAD*4", "DEFEND_IRONCLAD*3", "BASH", "ASCENDERS_BANE", "STOKE+", "SHRUG_IT_OFF*4", "DRUM_OF_BATTLE", "DARK_EMBRACE+", "BLOOD_WALL", "AUTOMATION", "WHIRLWIND", "INFLAME", "BRAND+", "FINESSE", "BURNING_PACT+", "BLOODLETTING*2", "FIEND_FIRE+", "TAUNT+", "ASHEN_STRIKE", "PACTS_END", "MAD_SCIENCE", "BATTLE_TRANCE+", "OFFERING"],
  roles: { outlet: [30, 3], draw: [25, 1], block: [0, 1], payoff: [40, 2], resource: [5, 3] },
  links: [['outlet', 'draw'], ['outlet', 'payoff']], identity: ['outlet', 'draw', 'payoff']
};
const blockExhaustRoute = {
  ...references.exhaust, id: 'exhaust_block', name: '消耗·格挡与消耗堆兑现',
  roles: { outlet: [30, 3], draw: [0, 1], block: [25, 1], payoff: [40, 2], resource: [5, 3] },
  links: [['outlet', 'block'], ['outlet', 'payoff']], identity: ['outlet', 'block', 'payoff']
};
const variants = {
  auto_strike: [references.auto_strike],
  exhaust: [references.exhaust, drawRoute, blockExhaustRoute],
  strength: [references.strength],
  block: [references.block]
};
const FUNCTION_IDS = {
  auto_strike: { starter: 'auto_gate', loop: 'auto_loop', strikes: 'auto_ammo', output: 'auto_output', resource: 'auto_support', amplification: 'auto_amplification' },
  exhaust: { outlet: 'exhaust_outlet', draw: 'exhaust_draw', block: 'exhaust_pain', payoff: 'exhaust_payoff', resource: 'exhaust_support' },
  strength: { source: 'strength_source', output: 'strength_multihit', resource: 'strength_throughput', defense: 'strength_defense' },
  block: { retention: 'block_gate', conversion: 'block_conversion', generation: 'block_source', growth: 'block_growth', resource: 'block_support' }
};
const PROVIDERS = {
  auto_output: ['PERFECTED_STRIKE', 'ASHEN_STRIKE', 'POMMEL_STRIKE', 'TWIN_STRIKE'],
  amplification: ['INFLAME', 'BASH', 'TAUNT'], starter: ['HELLRAISER'], loop: ['POMMEL_STRIKE', 'PILLAGE'], strikes: ['POMMEL_STRIKE', 'SETUP_STRIKE', 'TWIN_STRIKE', 'PERFECTED_STRIKE'],
  outlet: ['BURNING_PACT', 'TRUE_GRIT', 'SECOND_WIND', 'STOKE'], draw: ['DARK_EMBRACE'], block: ['FEEL_NO_PAIN'], payoff: ['ASHEN_STRIKE', 'PACTS_END', 'FIEND_FIRE'],
  source: ['INFLAME', 'DEMON_FORM', 'FIGHT_ME', 'BRAND'], output: ['SWORD_BOOMERANG', 'TWIN_STRIKE', 'WHIRLWIND', 'CONFLAGRATION'],
  defense: ['SHRUG_IT_OFF', 'FLAME_BARRIER', 'BLOOD_WALL'], retention: ['BARRICADE'], conversion: ['BODY_SLAM', 'JUGGERNAUT'],
  generation: ['SHRUG_IT_OFF', 'BLOOD_WALL', 'IMPERVIOUS', 'FLAME_BARRIER'], growth: ['UNMOVABLE', 'PROLONG'], resource: ['POMMEL_STRIKE', 'OFFERING', 'BLOODLETTING']
};
module.exports = { RULE_VERSION, references, variants, FUNCTION_IDS, PROVIDERS };
