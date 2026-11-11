'use strict';
// 功能组是牌面机制注释，不是核心牌数量目标；同一功能允许多个提供者。
const group = (id, label, ids, optional = false) => ({ id, label, ids: ids.split(' '), optional });
const groups = {
  'exhaust-engine': [group('outlet', '主动消耗手段', 'TRUE_GRIT BURNING_PACT SECOND_WIND FIEND_FIRE CORRUPTION BRAND STOKE HAVOC'), group('payoff', '消耗收益', 'FEEL_NO_PAIN DARK_EMBRACE ASHEN_STRIKE PACTS_END HOWL_FROM_BEYOND')],
  'strength-scaling': [group('source', '力量来源', 'INFLAME DEMON_FORM SETUP_STRIKE FIGHT_ME BRAND DOMINATE'), group('output', '多段输出', 'TWIN_STRIKE SWORD_BOOMERANG WHIRLWIND CONFLAGRATION FIGHT_ME THRASH ONE_TWO_PUNCH')],
  'block-barricade': [group('generation', '格挡来源', 'SHRUG_IT_OFF IMPERVIOUS BLOOD_WALL FLAME_BARRIER CRIMSON_MANTLE COLOSSUS'), group('conversion', '格挡转输出', 'BODY_SLAM JUGGERNAUT'), group('retention', '跨回合格挡', 'BARRICADE PROLONG', true), group('growth', '格挡放大', 'UNMOVABLE', true)],
  vulnerable: [group('source', '易伤来源', 'BASH TREMBLE MOLTEN_FIST THUNDERCLAP TAUNT UPPERCUT DOMINATE'), group('payoff', '易伤收益', 'CRUELTY BULLY DISMANTLE VICIOUS COLOSSUS')],
  'self-damage': [group('trigger', '主动失血手段', 'BLOODLETTING OFFERING HEMOKINESIS BRAND BLOOD_WALL CRIMSON_MANTLE INFERNO'), group('payoff', '失血收益', 'RUPTURE INFERNO TEAR_ASUNDER SPITE')],
  poison: [group('source', '施毒手段', 'NOXIOUS_FUMES DEADLY_POISON POISONED_STAB BOUNCING_FLASK HAZE ENVENOM CORROSIVE_WAVE'), group('payoff', '中毒放大或兑现', 'ACCELERANT OUTBREAK BUBBLE_BUBBLE MIRAGE', true)],
  'sly-discard': [group('outlet', '主动弃牌手段', 'ACROBATICS PREPARED CALCULATED_GAMBLE DAGGER_THROW TOOLS_OF_THE_TRADE HIDDEN_DAGGERS'), group('payoff', '弃牌或奇巧收益', 'TACTICIAN REFLEX FLICK_FLACK RICOCHET UNTOUCHABLE ABRASIVE MASTER_PLANNER MEMENTO_MORI')],
  shiv: [group('source', '小刀来源', 'BLADE_DANCE INFINITE_BLADES CLOAK_AND_DAGGER LEADING_STRIKE FAN_OF_KNIVES BLADE_OF_INK HIDDEN_DAGGERS STORM_OF_STEEL'), group('payoff', '小刀增伤', 'ACCURACY PHANTOM_BLADES', true)],
  'dexterity-block': [group('source', '敏捷来源', 'FOOTWORK ABRASIVE'), group('generation', '格挡来源', 'BACKFLIP DASH DODGE_AND_ROLL LEG_SWEEP AFTERIMAGE'), group('survival', '防御延续', 'BLUR WRAITH_FORM', true)],
  'draw-tempo': [group('draw', '抽牌循环', 'ACROBATICS ADRENALINE BACKFLIP PREDATOR ESCAPE_PLAN PREPARED TOOLS_OF_THE_TRADE'), group('payoff', '过牌或出牌收益', 'SPEEDSTER SERPENT_FORM CORROSIVE_WAVE MURDER')],
  'frost-focus-orbs': [group('source', '冰霜生成', 'GLACIER COOLHEADED CHILL COLD_SNAP'), group('focus', '集中来源', 'DEFRAGMENT HOTFIX'), group('slots', '充能球栏位', 'CAPACITOR MODDED', true)],
  'claw-zero-cost': [group('output', '爪击成长', 'CLAW'), group('replay', '零费回收或重复', 'ALL_FOR_ONE FERAL HOLOGRAM'), group('draw', '零费过牌', 'SCRAPE FTL SKIM', true)],
  'lightning-power-engine': [group('source', '闪电来源', 'BALL_LIGHTNING STORM TEMPEST ZAP VOLTAIC'), group('engine', '闪电或能力收益', 'STORM THUNDER SUBROUTINE LIGHTNING_ROD TESLA_COIL'), group('powers', '能力牌供给', 'CREATIVE_AI WHITE_NOISE MACHINE_LEARNING ECHO_FORM', true)],
  'dark-orb-evoke-burst': [group('source', '黑暗球生成', 'DARKNESS SHADOW_SHIELD RAINBOW CONSUMING_SHADOW'), group('evoke', '激发手段', 'MULTI_CAST SHATTER DUALCAST QUADCAST CONSUMING_SHADOW'), group('growth', '被动成长', 'LOOP DARKNESS DEFRAGMENT', true)],
  'status-engine': [group('source', '状态牌生成', 'GUNK_UP OVERCLOCK TURBO BOOST_AWAY'), group('payoff', '状态牌收益', 'TRASH_TO_TREASURE SMOKESTACK ITERATION ROCKET_PUNCH FLAK_CANNON')],
  'star-engine': [group('source', '辉星来源', 'GLOW GENESIS HIDDEN_CACHE GATHER_LIGHT BIG_BANG SOLAR_STRIKE SHINING_STRIKE'), group('payoff', '辉星输出或防御', 'COMET REFLECT SEVEN_STARS RADIATE PARTICLE_WALL CLOAK_OF_STARS BLACK_HOLE')],
  'alignment-loop': [group('energy', '星位序列回能', 'ALIGNMENT'), group('draw', '辉光过牌', 'GLOW'), group('compression', '牌组清理或变化', 'GUARDS BEGONE CHARGE', true)],
  'sovereign-blade-forge': [group('forge', '铸造来源', 'SUMMON_FORTH SEEKING_EDGE FURNACE BULWARK CONQUEROR WROUGHT_IN_WAR SPOILS_OF_BATTLE THE_SMITH REFINE_BLADE BEAT_INTO_SHAPE BIG_BANG'), group('access', '君王之剑调取', 'SUMMON_FORTH', true), group('payoff', '君王之剑放大', 'SEEKING_EDGE CONQUEROR SWORD_SAGE', true)],
  'void-form': [group('starter', '虚空形态', 'VOID_FORM'), group('payoff', '免费打出收益', 'SEVEN_STARS COMET REFLECT BULWARK GENESIS CONVERGENCE')],
  'card-creation': [group('source', '造牌手段', 'SPECTRUM_SHIFT QUASAR MANIFEST_AUTHORITY BUNDLE_OF_JOY SUPERMASSIVE'), group('payoff', '造牌收益', 'ARSENAL PILLAR_OF_CREATION')],
  'soul-cycle': [group('source', '灵魂来源', 'GRAVE_WARDEN CAPTURE_SPIRIT DIRGE REAVE SEVERANCE'), group('payoff', '灵魂输出', 'HAUNT SOUL_STORM DEATH_MARCH DEVOUR_LIFE')],
  'doom-execute': [group('source', '灾厄来源', 'NO_ESCAPE NEGATIVE_PULSE DEATHBRINGER COUNTDOWN BLIGHT_STRIKE SCOURGE OBLIVION END_OF_DAYS'), group('payoff', '灾厄或负面状态收益', 'SLEIGHT_OF_FLESH SHROUD DEATHS_DOOR TIMES_UP', true)],
  osty: [group('output', '奥斯提攻击', 'FETCH FLATTEN RATTLE SQUEEZE RIGHT_HAND_HAND SNAP POKE UNLEASH'), group('summon', '召唤补充', 'INVOKE PULL_AGGRO AFTERLIFE SPUR REANIMATE NECRO_MASTERY', true), group('payoff', '奥斯提输出强化', 'CALCIFY NECRO_MASTERY', true)],
  ethereal: [group('source', '虚无牌供给', 'CALL_OF_THE_VOID SCULPTING_STRIKE VEILPIERCER DREDGE GRAVEBLAST EIDOLON DEFY'), group('payoff', '虚无收益', 'PULL_FROM_BELOW PAGESTORM SPIRIT_OF_ASH BANSHEES_CRY')],
  'reaper-big-hit': [group('starter', '死神形态', 'REAPER_FORM'), group('output', '高伤攻击', 'THE_SCYTHE ERADICATE'), group('amplification', '攻击放大', 'LETHALITY FEAR PUTREFY DEBILITATE', true)],
  'auto-strike': [group('starter', '地狱狂徒', 'HELLRAISER'), group('supply', '打击供给', 'STRIKE_IRONCLAD POMMEL_STRIKE PERFECTED_STRIKE TWIN_STRIKE SETUP_STRIKE ASHEN_STRIKE'), group('loop', '打击抽牌循环', 'POMMEL_STRIKE')]
};
module.exports = { groups };
