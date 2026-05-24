<template>
  <section class="battle-shell">
    <header class="battle-toolbar">
      <p class="battle-state">{{ battleStatusText }}</p>

      <div class="toolbar-actions">
        <button v-if="isTrainingMode" type="button" class="toolbar-btn" :disabled="isRunning" @click="startTrainingBattle">
          开始训练
        </button>
        <button v-if="isTrainingMode && isRunning" type="button" class="toolbar-btn" @click="stopBattle('训练已手动停止。')">
          停止训练
        </button>
        <button type="button" class="toolbar-btn" :disabled="isRunning" @click="openEnemyStatEditor">
          敌方属性 {{ enemyStatPercent }}%
        </button>
        <span v-if="enemyDifficultyRemark" class="difficulty-badge">{{ enemyDifficultyRemark }}</span>
        <button type="button" class="toolbar-btn" :disabled="isRunning" @click="resetBattleState">刷新预览</button>
      </div>
    </header>

    <section ref="battleStageRef" class="battle-stage">
      <div class="battle-effect-layer" aria-hidden="true">
        <div
          v-for="effect in battleEffects"
          :key="effect.id"
          :class="getBattleEffectClass(effect)"
          :style="getBattleEffectStyle(effect)"
        >
          <template v-if="effect.kind === 'beam'">
            <div class="effect-charge"></div>
            <div class="effect-beam"></div>
            <div class="effect-shockwave"></div>
            <div class="effect-damage">{{ formatDamageNumber(effect.damage) }}</div>
          </template>
          <template v-else>
            <div class="mass-spell-circle-wrap">
              <div class="mass-spell-core-glow"></div>
              <div class="mass-spell-layer mass-spell-min-star"></div>
              <div class="mass-spell-layer mass-spell-star"></div>
              <div class="mass-spell-layer mass-spell-square"></div>
              <div class="mass-spell-layer mass-spell-incantation mass-spell-incantation-small">
                <span
                  v-for="(glyph, index) in spellCircleGlyphs"
                  :key="`small-incantation-${effect.id}-${glyph}-${index}`"
                  class="mass-spell-rune"
                  :style="getSpellGlyphStyle(index, 0.21, 0)"
                >
                  {{ glyph }}
                </span>
              </div>
              <div class="mass-spell-layer mass-spell-double-circle"></div>
              <div class="mass-spell-layer mass-spell-stripe-circle">
                <span class="mass-spell-stripe-ring"></span>
              </div>
              <div class="mass-spell-layer mass-spell-quarter-stars">
                <span v-for="index in 4" :key="`quarter-star-${effect.id}-${index}`"></span>
              </div>
              <div class="mass-spell-layer mass-spell-cross-line"></div>
              <div class="mass-spell-layer mass-spell-cross-square"></div>
              <div class="mass-spell-layer mass-spell-incantation mass-spell-incantation-large">
                <span
                  v-for="(glyph, index) in spellCircleGlyphs"
                  :key="`large-incantation-${effect.id}-${glyph}-${index}`"
                  class="mass-spell-rune"
                  :style="getSpellGlyphStyle(index, 0.45, 0.5)"
                >
                  {{ glyph }}
                </span>
              </div>
              <div class="mass-spell-layer mass-spell-middle-circle"></div>
              <div class="mass-spell-layer mass-spell-big-star"></div>
              <div class="mass-spell-layer mass-spell-outer-line"></div>
              <div class="mass-spell-layer mass-spell-outer-markers">
                <span
                  v-for="index in 8"
                  :key="`outer-marker-${effect.id}-${index}`"
                  class="mass-spell-outer-marker"
                  :style="getOuterMarkerStyle(index - 1)"
                ></span>
              </div>
              <div class="mass-spell-layer mass-spell-impact-flash"></div>
            </div>
            <div v-if="effect.damage !== null" class="spell-damage">{{ formatDamageNumber(effect.damage) }}</div>
          </template>
        </div>
      </div>

      <div v-if="isManualTargetArmed" class="manual-target-banner" aria-live="polite">
        {{ manualTargetBannerText }}
      </div>

      <div class="formation-grid enemy-formation">
        <button
          v-for="slot in enemySlots"
          :key="slot.fighter.id"
          :ref="el => setFighterCardRef(slot.fighter.id, el)"
          type="button"
          class="fighter-card"
          :class="cardClasses(slot.fighter)"
          @click="onFighterCardClicked(slot.fighter)"
        >
          <p class="fighter-name">{{ slot.fighter.name }}</p>
          <p class="fighter-role">{{ roleLabel(slot.fighter.role) }}</p>
          <p class="fighter-hp">生命 {{ slot.fighter.currentHp }}/{{ slot.fighter.stats.hp }}</p>
          <p v-if="slot.fighter.shield > 0" class="fighter-shield">护盾 {{ slot.fighter.shield }}</p>
          <p class="fighter-speed">速度 {{ getEffectiveStat(slot.fighter, 'speed') }}</p>
          <p v-if="getStatusLabels(slot.fighter).length > 0" class="fighter-status">
            {{ getStatusLabels(slot.fighter).join(' · ') }}
          </p>
          <p v-if="slot.fighter.isDead" class="dead-mark">已阵亡</p>
        </button>
      </div>

      <div class="arena-core">
        <div class="core-title">战斗核心</div>
        <p class="core-round">第 {{ currentRound }} / {{ maxRounds }} 回合</p>
        <p class="core-hp">我方总生命：{{ allyTotalHp }}</p>
        <p class="core-hp">敌方总生命：{{ enemyTotalHp }}</p>
        <p class="core-tip">{{ turnHint }}</p>
        <p v-if="winnerText" class="core-winner">{{ winnerText }}</p>
      </div>

      <div class="formation-grid ally-formation">
        <button
          v-for="slot in allySlots"
          :key="slot.fighter.id"
          :ref="el => setFighterCardRef(slot.fighter.id, el)"
          type="button"
          class="fighter-card"
          :class="cardClasses(slot.fighter)"
          @click="onFighterCardClicked(slot.fighter)"
        >
          <p class="fighter-name">{{ slot.fighter.name }}</p>
          <p class="fighter-role">{{ roleLabel(slot.fighter.role) }}</p>
          <p class="fighter-hp">生命 {{ slot.fighter.currentHp }}/{{ slot.fighter.stats.hp }}</p>
          <p v-if="slot.fighter.shield > 0" class="fighter-shield">护盾 {{ slot.fighter.shield }}</p>
          <p class="fighter-speed">速度 {{ getEffectiveStat(slot.fighter, 'speed') }}</p>
          <p v-if="getStatusLabels(slot.fighter).length > 0" class="fighter-status">
            {{ getStatusLabels(slot.fighter).join(' · ') }}
          </p>
          <p v-if="slot.fighter.isDead" class="dead-mark">已阵亡</p>
        </button>
      </div>

      <MagicCircleEffect :active="isShenXixiSelected" :anchor="shenXixiMagicCircleAnchor" />
    </section>

    <p class="battle-help">{{ rosterSyncHint }} 点击我方人物查看属性和技能。</p>

    <section
      v-if="fighterDetailOpen && selectedAlly"
      class="fighter-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fighter-modal-title"
      @click.self="closeFighterDetail"
    >
      <article class="fighter-modal">
        <header class="fighter-modal-head">
          <div>
            <h3 id="fighter-modal-title">{{ selectedAlly.name }}</h3>
            <p class="attr-line">
              {{ roleLabel(selectedAlly.role) }} · 生命 {{ selectedAlly.currentHp }}/{{ selectedAlly.stats.hp }}
              <span v-if="selectedAlly.shield > 0"> · 护盾 {{ selectedAlly.shield }}</span>
            </p>
          </div>
          <button type="button" class="modal-close-btn" @click="closeFighterDetail">关闭</button>
        </header>

        <div class="modal-stat-grid">
          <p>物攻 {{ getEffectiveStat(selectedAlly, 'physicalAttack') }}</p>
          <p>法攻 {{ getEffectiveStat(selectedAlly, 'magicAttack') }}</p>
          <p>物抗 {{ getEffectiveStat(selectedAlly, 'physicalResist') }}</p>
          <p>法抗 {{ getEffectiveStat(selectedAlly, 'magicResist') }}</p>
          <p>速度 {{ getEffectiveStat(selectedAlly, 'speed') }}</p>
        </div>

        <div v-if="getStatusLabels(selectedAlly).length > 0" class="status-strip">
          <span v-for="label in getStatusLabels(selectedAlly)" :key="label">{{ label }}</span>
        </div>

        <div class="skill-grid">
          <button
            v-for="skill in selectedAllySkills"
            :key="skill.id"
            type="button"
            class="skill-card"
            :class="{ selected: selectedSkillId === skill.id, cooling: getSkillCooldown(selectedAlly, skill.id) > 0 }"
            @click="onSkillClicked(skill.id)"
          >
            <p class="skill-name">{{ skill.name }}</p>
            <p class="skill-desc">{{ skill.description }}</p>
            <p class="skill-state">
              冷却：{{ getDisplayedSkillCooldown(selectedAlly, skill.id) }} 回合
              <span v-if="getSkillCooldown(selectedAlly, skill.id) > 0">（不可释放）</span>
            </p>
          </button>
        </div>

        <p v-if="selectedSkillActionHint" class="skill-action-hint">{{ selectedSkillActionHint }}</p>

        <div v-if="selectedSkill && requiresManualTarget(selectedSkill)" class="target-zone">
          <p class="target-title">{{ targetZoneTitle }}</p>
          <div class="target-grid">
            <button
              v-for="target in visibleManualTargets"
              :key="target.id"
              type="button"
              class="target-btn"
              :disabled="!canSelectFighterAsManualTarget(target)"
              :title="getManualTargetHint(target)"
              @click="onManualTargetChosen(target.id)"
            >
              {{ target.name }} · {{ target.currentHp }}/{{ target.stats.hp }}
              <span v-if="target.shield > 0"> · 护盾 {{ target.shield }}</span>
            </button>
          </div>
        </div>
      </article>
    </section>

    <section
      v-if="enemyStatEditorOpen"
      class="enemy-percent-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enemy-percent-title"
      @click.self="closeEnemyStatEditor"
    >
      <article class="enemy-percent-modal">
        <header class="enemy-percent-head">
          <h3 id="enemy-percent-title">敌方属性倍率</h3>
          <button type="button" class="modal-close-btn" @click="closeEnemyStatEditor">关闭</button>
        </header>

        <p v-if="enemyStatDraftRemark" class="enemy-percent-remark">{{ enemyStatDraftRemark }}</p>
        <input class="enemy-percent-input" :value="enemyStatDraftDisplay" readonly inputmode="none" aria-label="敌方属性百分比" />

        <div class="enemy-percent-keypad">
          <button v-for="digit in enemyStatDigitKeys" :key="digit" type="button" class="keypad-btn" @click="appendEnemyStatDigit(digit)">
            {{ digit }}
          </button>
          <button type="button" class="keypad-btn delete" @click="deleteEnemyStatDigit">删除</button>
        </div>

        <div class="enemy-percent-actions">
          <button type="button" class="toolbar-btn" @click="commitEnemyStatDraft">确定</button>
          <button type="button" class="toolbar-btn" @click="closeEnemyStatEditor">取消</button>
        </div>
      </article>
    </section>

    <section class="log-panel">
      <p class="log-title">战斗日志</p>
      <div class="log-list">
        <p v-for="entry in battleLogs" :key="entry.id" class="log-item" :class="`log-${entry.kind}`">
          {{ entry.text }}
        </p>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import MagicCircleEffect from './MagicCircleEffect.vue';
import {
  battleRosterMembers,
  ensureBattleRosterLoaded,
  getRoleLabel,
  type SquadMemberId,
  type SquadMemberRole,
  type SquadMemberStatKey,
  type SquadMemberStats,
} from '../battleRosterState';
import {
  createDefaultStoryBattleState,
  isStoryBattleActive,
  normalizeStoryBattleState,
  STORY_BATTLE_STATE_KEY,
  type StoryBattleState,
} from '../../共享/比赛状态';
import {
  ENEMY_SKILL_LIBRARY_GLOBAL_KEY,
  type BattleStatusKind,
  type EnemyRoleSkillLibrary,
  type FighterSide,
  type SkillDefinition,
  type SkillKind,
  type SkillTargetMode,
  type SkillTargetType,
} from '../../共享/战斗技能';

const props = withDefaults(
  defineProps<{
    mode?: 'story' | 'training';
    ignoredStoryBattleSessionId?: string | null;
  }>(),
  {
    mode: 'story',
    ignoredStoryBattleSessionId: null,
  },
);

type FormationSlot = 'top' | 'left' | 'right' | 'bottom';
type BattleLogKind = 'info' | 'turn' | 'action' | 'result' | 'warn';
type BattleEffectTone = 'arcane' | 'crimson';
type EnemyStatSettings = {
  version: number;
  percent: number;
};

type BattleFighter = {
  id: string;
  side: FighterSide;
  role: SquadMemberRole;
  name: string;
  stats: SquadMemberStats;
  currentHp: number;
  isDead: boolean;
  skills: SkillDefinition[];
  cooldowns: Record<string, number>;
  shield: number;
  shieldExpiresAtRoundStart: number | null;
  statuses: BattleStatus[];
};

type BattleLogEntry = {
  id: string;
  text: string;
  kind: BattleLogKind;
};

type ManualAction = {
  actorId: string;
  skillId: string;
  targetId: string | null;
};

type FormationCell = {
  slot: FormationSlot;
  fighter: BattleFighter;
};

type MagicCircleAnchor = {
  x: number;
  y: number;
  size: number;
};

type BattleStatus = {
  id: string;
  kind: BattleStatusKind;
  label: string;
  startsAtRound: number;
  expiresAtRoundStart?: number;
  expiresAtRoundEnd?: number;
  statMultipliers?: Partial<Record<SquadMemberStatKey, number>>;
  incomingDamageMultiplier?: number;
  ignoreIncomingResist?: boolean;
  counterReflectRate?: number;
};

type PendingRoundHeal = {
  fighterId: string;
  round: number;
  maxHpRate: number;
  sourceName: string;
};

type DamageNumbers = {
  kind: SkillKind;
  rawDamage: number;
  finalDamage: number;
};

type DamageResult = {
  hpDamage: number;
  shieldDamage: number;
  beforeHp: number;
  afterHp: number;
  defeated: boolean;
};

type BattleEffectPosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type EnemyActionChoice = {
  skill: SkillDefinition;
  target: BattleFighter;
  score: number;
};

type BeamBattleEffect = {
  id: string;
  kind: 'beam';
  tone: BattleEffectTone;
  damage: number;
};

type SpellCircleBattleEffect = {
  id: string;
  kind: 'spellCircle';
  targetId: string;
  damage: number | null;
  position: BattleEffectPosition;
};

type BattleEffect = BeamBattleEffect | SpellCircleBattleEffect;

type HostRuntime = Window & typeof globalThis;

function resolveHostRuntime(): HostRuntime | null {
  const candidates: Array<Window | null | undefined> = [window, window.parent, window.top];
  const visited = new Set<Window>();

  for (const candidate of candidates) {
    if (!candidate || visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    try {
      const runtime = candidate as HostRuntime;
      if (runtime.TavernHelper) {
        return runtime;
      }
    } catch {
      // ignore cross-origin access failures
    }
  }

  return null;
}

function withTavernHelper<T>(context: string, fallback: T, runner: (helper: Window['TavernHelper']) => T): T {
  const runtime = resolveHostRuntime();
  const helper = runtime?.TavernHelper;
  if (!helper) {
    console.error(`[全屏覆盖式酒馆前端] ${context}失败：未找到 TavernHelper。`);
    return fallback;
  }

  try {
    return runner(helper);
  } catch (error) {
    console.error(`[全屏覆盖式酒馆前端] ${context}失败。`, error);
    return fallback;
  }
}

function readChatVariables(): Record<string, any> {
  return withTavernHelper('读取比赛聊天变量', {}, helper => helper.getVariables({ type: 'chat' }));
}

const ENEMY_STATS: Record<SquadMemberRole, SquadMemberStats> = {
  guard: {
    physicalAttack: 88,
    magicAttack: 70,
    hp: 480,
    physicalResist: 32,
    magicResist: 26,
    speed: 88,
  },
  mage: {
    physicalAttack: 40,
    magicAttack: 132,
    hp: 340,
    physicalResist: 18,
    magicResist: 24,
    speed: 128,
  },
  support: {
    physicalAttack: 56,
    magicAttack: 110,
    hp: 360,
    physicalResist: 22,
    magicResist: 28,
    speed: 104,
  },
  assassin: {
    physicalAttack: 126,
    magicAttack: 52,
    hp: 330,
    physicalResist: 20,
    magicResist: 20,
    speed: 142,
  },
};

const ALLY_MEMBER_IDS: readonly SquadMemberId[] = ['shen_xixi', 'li_yenan', 'bai_zhi', 'su_su'];

const ALLY_SKILLS_BY_MEMBER_ID: Record<SquadMemberId, SkillDefinition[]> = {
  shen_xixi: [
    {
      id: 'shen_xixi_star_lance',
      name: '星焰单咒',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对敌方单人造成 200% 法术伤害。',
    },
    {
      id: 'shen_xixi_arcane_tide',
      name: '辉潮术式',
      kind: 'magic',
      ratio: 0.6,
      cooldown: 3,
      targetType: 'opponent',
      targetMode: 'allOpponents',
      description: '对敌方全体造成 60% 法术范围伤害。',
    },
    {
      id: 'shen_xixi_moon_spark',
      name: '月光弹',
      kind: 'magic',
      ratio: 1,
      cooldown: 1,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对敌方单人造成 100% 法术伤害。',
    },
    {
      id: 'shen_xixi_twin_stars',
      name: '双星坠',
      kind: 'magic',
      ratio: 1.5,
      cooldown: 3,
      targetType: 'opponent',
      targetMode: 'randomOpponents',
      randomTargetCount: 2,
      description: '对敌方随机两人造成 150% 法术伤害。',
    },
  ],
  li_yenan: [
    {
      id: 'li_yenan_blood_recover_slash',
      name: '饮血斩',
      kind: 'physical',
      ratio: 1.5,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      selfHealMaxHpRate: 0.1,
      description: '对敌方单人造成 150% 物理伤害，并回复自身 10% 最大生命。',
    },
    {
      id: 'li_yenan_team_shield',
      name: '全队护阵',
      cooldown: 2,
      targetType: 'none',
      targetMode: 'none',
      teamShieldMaxHpRate: 0.15,
      description: '为我方全体附加 15% 最大生命护盾，下一回合清除；护盾不享受双抗减伤。',
    },
    {
      id: 'li_yenan_guarded_strike',
      name: '守势重击',
      kind: 'physical',
      ratio: 1,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      selfDefenseBuffRate: 0.1,
      description: '对敌方单人造成 100% 物理伤害，本回合自身双抗提高 10%。',
    },
    {
      id: 'li_yenan_counter_guard',
      name: '返伤壁垒',
      cooldown: 3,
      targetType: 'none',
      targetMode: 'none',
      counterStance: true,
      description: '本回合受到敌方伤害时承受 80%，并以法术伤害返还 30%；下一回合回复 15% 最大生命。',
    },
  ],
  bai_zhi: [
    {
      id: 'bai_zhi_quick_cut',
      name: '瞬切',
      kind: 'physical',
      ratio: 1.5,
      cooldown: 1,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '选定一个敌人，造成 150% 物理伤害。',
    },
    {
      id: 'bai_zhi_shadow_pierce',
      name: '影穿',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '选定一个敌人，造成 200% 物理伤害。',
    },
    {
      id: 'bai_zhi_vanish_cut',
      name: '隐袭',
      kind: 'physical',
      ratio: 1,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      selfUntargetableNextRound: true,
      description: '对敌人造成 100% 物理伤害，并在下回合无法被敌人选中释放技能。',
    },
    {
      id: 'bai_zhi_overload_kill',
      name: '破限绝杀',
      kind: 'physical',
      ratio: 3,
      cooldown: 3,
      targetType: 'opponent',
      targetMode: 'selected',
      selfOverloadDebuff: true,
      description: '对敌人造成 300% 物理伤害；自身速度 -20%，双抗失效，受到伤害 +10%，持续到下回合结束。',
    },
  ],
  su_su: [
    {
      id: 'su_su_single_heal',
      name: '柔光疗愈',
      cooldown: 1,
      targetType: 'ally',
      targetMode: 'selected',
      targetHealMaxHpRate: 0.25,
      description: '指定一个队友，回复其 25% 最大生命。',
    },
    {
      id: 'su_su_tactical_refresh',
      name: '灵感调律',
      cooldown: 2,
      targetType: 'ally',
      targetMode: 'selected',
      cooldownReduction: 1,
      attackBuffRate: 0.2,
      description: '选定一个队友，其所有技能冷却减少 1 回合，并获得 20% 攻击提升。',
    },
    {
      id: 'su_su_spring_field',
      name: '春息领域',
      cooldown: 3,
      targetType: 'none',
      targetMode: 'none',
      teamHealMaxHpRate: 0.1,
      nextRoundTeamStatBuffRate: 0.1,
      description: '立刻回复我方全体 10% 最大生命；下一回合我方除生命外全属性 +10%。',
    },
    {
      id: 'su_su_dual_grace',
      name: '祈愿裁定',
      kind: 'magic',
      ratio: 0.5,
      cooldown: 3,
      targetType: 'any',
      targetMode: 'selected',
      targetHealMaxHpRate: 0.45,
      silenceNextRound: true,
      description: '选定队友回复 45% 最大生命；或选定敌人造成 50% 法术伤害，并使其下一回合无法释放技能。',
    },
  ],
};

const FALLBACK_ENEMY_ROLE_SKILLS: EnemyRoleSkillLibrary = {
  guard: [
    {
      id: 'guard_shield_bash',
      name: '盾击',
      kind: 'physical',
      ratio: 1.2,
      cooldown: 1,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对单体造成 120% 物理伤害。',
    },
    {
      id: 'guard_iron_crash',
      name: '钢铁冲撞',
      kind: 'physical',
      ratio: 1.8,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      selfDefenseBuffRate: 0.1,
      description: '对单体造成 180% 物理伤害，自身本回合双抗 +10%。',
    },
    {
      id: 'guard_counter_wall',
      name: '反击壁垒',
      cooldown: 3,
      targetType: 'none',
      targetMode: 'none',
      counterStance: true,
      counterIncomingDamageMultiplier: 0.8,
      counterReflectRate: 0.3,
      counterNextRoundHealMaxHpRate: 0.12,
      description: '本回合承伤 80%，返还 30% 法术伤害；下一回合回复 12% 最大生命。',
    },
    {
      id: 'guard_line_lock',
      name: '战线封锁',
      kind: 'physical',
      ratio: 1,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      silenceNextRound: true,
      description: '对单体造成 100% 物理伤害，并使其下回合沉默。',
    },
  ],
  mage: [
    {
      id: 'mage_fire_lance',
      name: '炎枪术',
      kind: 'magic',
      ratio: 1.2,
      cooldown: 1,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对单体造成 120% 法术伤害。',
    },
    {
      id: 'mage_arcane_burst',
      name: '奥术爆裂',
      kind: 'magic',
      ratio: 1.9,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对单体造成 190% 法术伤害。',
    },
    {
      id: 'mage_frost_spike',
      name: '霜锥',
      kind: 'magic',
      ratio: 1.4,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      silenceNextRound: true,
      description: '对单体造成 140% 法术伤害，并使其下回合沉默。',
    },
    {
      id: 'mage_meteor_fall',
      name: '陨星落',
      kind: 'magic',
      ratio: 0.65,
      cooldown: 3,
      targetType: 'opponent',
      targetMode: 'allOpponents',
      description: '对敌方全体造成 65% 法术伤害。',
    },
  ],
  support: [
    {
      id: 'support_light_bolt',
      name: '辉光箭',
      kind: 'magic',
      ratio: 0.9,
      cooldown: 1,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对单体造成 90% 法术伤害。',
    },
    {
      id: 'support_holy_pulse',
      name: '圣息脉冲',
      cooldown: 3,
      targetType: 'none',
      targetMode: 'none',
      teamHealMaxHpRate: 0.1,
      description: '敌方全体回复 10% 最大生命。',
    },
    {
      id: 'support_grace_mark',
      name: '恩典刻印',
      cooldown: 2,
      targetType: 'ally',
      targetMode: 'selected',
      cooldownReduction: 1,
      attackBuffRate: 0.2,
      description: '指定己方冷却 -1，并使其攻击 +20%。',
    },
    {
      id: 'support_silence_prayer',
      name: '禁言祷词',
      kind: 'magic',
      ratio: 0.5,
      cooldown: 3,
      targetType: 'opponent',
      targetMode: 'selected',
      silenceNextRound: true,
      description: '对单体造成 50% 法术伤害，并使其下回合沉默。',
    },
  ],
  assassin: [
    {
      id: 'assassin_backstab',
      name: '背刺',
      kind: 'physical',
      ratio: 1.3,
      cooldown: 1,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对单体造成 130% 物理伤害。',
    },
    {
      id: 'assassin_shadow_combo',
      name: '影连斩',
      kind: 'physical',
      ratio: 1.9,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '对单体造成 190% 物理伤害。',
    },
    {
      id: 'assassin_vanish_cut',
      name: '隐袭',
      kind: 'physical',
      ratio: 1,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      selfUntargetableNextRound: true,
      description: '对单体造成 100% 物理伤害，自身下回合不可被选中。',
    },
    {
      id: 'assassin_execute',
      name: '处决',
      kind: 'physical',
      ratio: 2.6,
      cooldown: 3,
      targetType: 'opponent',
      targetMode: 'selected',
      executeThresholdHpRate: 0.35,
      executeRatio: 3.2,
      description: '对单体造成 260% 物理伤害；目标生命低于 35% 时改为 320%。',
    },
  ],
};

const ENEMY_POSITION: Record<SquadMemberRole, FormationSlot> = {
  mage: 'top',
  support: 'left',
  assassin: 'right',
  guard: 'bottom',
};

const ALLY_POSITION: Record<SquadMemberRole, FormationSlot> = {
  guard: 'top',
  assassin: 'left',
  support: 'right',
  mage: 'bottom',
};

const spellCircleGlyphs = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'];
const SHEN_XIXI_MASS_SPELL_IDS = new Set(['shen_xixi_arcane_tide', 'shen_xixi_twin_stars']);
const maxRounds = 7;
const battleDelayMs = 420;
const shenXixiMassSpellDamageDelayMs = 8_650;
const shenXixiMassSpellCleanupDelayMs = 1_700;
const SHEN_XIXI_MEMBER_ID = 'shen_xixi' satisfies SquadMemberId;
const ENEMY_SKILL_DRAW_COUNT = 4;
const SQUAD_ROLES: readonly SquadMemberRole[] = ['guard', 'mage', 'support', 'assassin'];
const ENEMY_SKILL_LIBRARY_URL_VARIABLE_KEY = 'th_fullscreen_enemy_skill_library_url';
const ENEMY_STAT_SETTINGS_KEY = 'th_fullscreen_enemy_stat_settings_v1';
const ENEMY_STAT_SETTINGS_VERSION = 1;
const DEFAULT_ENEMY_STAT_PERCENT = 100;
const MIN_ENEMY_STAT_PERCENT = 1;
const MAX_ENEMY_STAT_PERCENT = 999;
const ENEMY_STAT_DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

let activeEnemyRoleSkills: EnemyRoleSkillLibrary = cloneEnemyRoleSkillLibrary(FALLBACK_ENEMY_ROLE_SKILLS);
let enemySkillLibraryLoadPromise: Promise<void> | null = null;

const enemySkillLibrarySourceText = ref('内置兜底技能库');
const enemyStatSettings = ref<EnemyStatSettings>(createDefaultEnemyStatSettings());
const enemyStatEditorOpen = ref(false);
const enemyStatDraft = ref(String(DEFAULT_ENEMY_STAT_PERCENT));
const battleLogs = ref<BattleLogEntry[]>([]);
const fighters = ref<BattleFighter[]>(createInitialFighters());
const storyBattleState = ref<StoryBattleState>(createDefaultStoryBattleState());
const isRunning = ref(false);
const currentRound = ref(1);
const selectedAllyId = ref<string | null>(battleRosterMembers.value[0]?.id ?? null);
const selectedSkillId = ref<string | null>(null);
const pendingActorId = ref<string | null>(null);
const winnerText = ref('');
const turnHint = ref('等待剧情中的比赛开始。');
const roundQueueText = ref('');
const battleToken = ref(0);
const lastAutoStartedStoryBattleSessionId = ref('');
const fighterDetailOpen = ref(false);
const battleEffects = ref<BattleEffect[]>([]);
const battleStageRef = ref<HTMLElement | null>(null);
const shenXixiMagicCircleAnchor = ref<MagicCircleAnchor | null>(null);

let pendingManualResolver: ((action: ManualAction | null) => void) | null = null;
let storyBattlePollTimer: number | null = null;
let pendingRoundHeals: PendingRoundHeal[] = [];
let battleEffectTimer: number | null = null;
let magicCircleAnchorFrame: number | null = null;
const fighterCardElements = new Map<string, HTMLElement>();

const isTrainingMode = computed(() => props.mode === 'training');
const enemyStatPercent = computed(() => enemyStatSettings.value.percent);
const enemyDifficultyRemark = computed(() => getEnemyDifficultyRemark(enemyStatPercent.value));
const enemyStatDraftPercent = computed(() => parseEnemyStatPercent(enemyStatDraft.value));
const enemyStatDraftDisplay = computed(() => `${enemyStatDraft.value || ''}%`);
const enemyStatDraftRemark = computed(() => {
  const draftPercent = enemyStatDraftPercent.value;
  return draftPercent === null ? '' : getEnemyDifficultyRemark(draftPercent);
});
const enemyStatDigitKeys = ENEMY_STAT_DIGIT_KEYS;
const selectedAlly = computed(() => fighters.value.find(fighter => fighter.id === selectedAllyId.value && fighter.side === 'ally') ?? null);
const isShenXixiSelected = computed(() => selectedAllyId.value === SHEN_XIXI_MEMBER_ID);
const selectedAllySkills = computed(() => {
  if (!selectedAlly.value) {
    return [];
  }
  return getSkillsForFighter(selectedAlly.value);
});
const selectedSkill = computed(() => {
  if (!selectedAlly.value || !selectedSkillId.value) {
    return null;
  }
  return getSkillForFighter(selectedAlly.value, selectedSkillId.value);
});
const allyTotalHp = computed(() =>
  fighters.value.filter(fighter => fighter.side === 'ally').reduce((total, fighter) => total + fighter.currentHp, 0),
);
const enemyTotalHp = computed(() =>
  fighters.value.filter(fighter => fighter.side === 'enemy').reduce((total, fighter) => total + fighter.currentHp, 0),
);
const enemySlots = computed(() => buildFormationCells('enemy', ENEMY_POSITION));
const allySlots = computed(() => buildFormationCells('ally', ALLY_POSITION));
const currentStoryBattleSessionId = computed(() => resolveStoryBattleSessionId(storyBattleState.value));
const isCurrentStoryBattleIgnored = computed(
  () => Boolean(currentStoryBattleSessionId.value) && props.ignoredStoryBattleSessionId === currentStoryBattleSessionId.value,
);
const battleStatusText = computed(() => {
  if (isRunning.value) {
    return `当前状态：${isTrainingMode.value ? '训练' : '比赛'}进行中（第 ${currentRound.value} 回合）`;
  }
  if (isTrainingMode.value) {
    if (winnerText.value) {
      return `当前状态：训练结束（${winnerText.value}）`;
    }
    return '当前状态：训练预览，可随时开始';
  }
  if (isCurrentStoryBattleIgnored.value) {
    return '当前状态：已无视本次比赛';
  }
  if (winnerText.value) {
    return `当前状态：比赛结束（${winnerText.value}）`;
  }
  if (isStoryBattleActive(storyBattleState.value)) {
    return '当前状态：检测到剧情比赛，正在准备战斗场';
  }
  return '当前状态：等待剧情比赛触发';
});
const canChooseManualTarget = computed(() => {
  if (!isRunning.value || !pendingActorId.value || !selectedAlly.value || !selectedSkill.value) {
    return false;
  }
  return pendingActorId.value === selectedAlly.value.id && getSkillCooldown(selectedAlly.value, selectedSkill.value.id) <= 0;
});
const rosterSyncHint = computed(() => {
  const skillLibraryText = `敌方技能库：${enemySkillLibrarySourceText.value}；每名敌人本场抽取 ${ENEMY_SKILL_DRAW_COUNT} 个技能。`;
  const statRuleText = `敌方除物抗、法抗外按我方同职位属性的 ${enemyStatPercent.value}% 创建，物抗、法抗固定为 100%。`;
  if (isTrainingMode.value) {
    return `训练开始时锁定当前战队属性；${statRuleText}${skillLibraryText}`;
  }
  if (isRunning.value) {
    return `本场比赛已锁定触发时的我方属性；战队页后续修改会在下一次剧情比赛触发时生效。${statRuleText}${skillLibraryText}`;
  }
  return `战队页中的属性会实时同步到这里，剧情变量触发比赛时会按当前值创建我方战斗单位。${statRuleText}${skillLibraryText}`;
});
const visibleManualTargets = computed(() => {
  if (!selectedAlly.value || !selectedSkill.value || !requiresManualTarget(selectedSkill.value)) {
    return [];
  }

  return fighters.value.filter(fighter => {
    if (fighter.isDead) {
      return false;
    }
    if (selectedSkill.value?.targetType === 'opponent') {
      return fighter.side !== selectedAlly.value?.side;
    }
    if (selectedSkill.value?.targetType === 'ally') {
      return fighter.side === selectedAlly.value?.side;
    }
    return selectedSkill.value?.targetType === 'any';
  });
});
const isManualTargetArmed = computed(
  () => selectedSkill.value !== null && requiresManualTarget(selectedSkill.value) && canChooseManualTarget.value,
);
const manualTargetBannerText = computed(() => {
  if (!selectedAlly.value || !selectedSkill.value) {
    return '';
  }
  return `已选择「${selectedSkill.value.name}」：点击高亮目标释放。`;
});
const selectedSkillActionHint = computed(() => {
  if (!selectedAlly.value || !selectedSkill.value) {
    return '';
  }
  if (!isRunning.value) {
    return isTrainingMode.value
      ? '当前是训练预览：开始训练后，轮到该角色行动时才能释放技能。'
      : '当前是预览状态：剧情比赛触发后，轮到该角色行动时才能释放技能。';
  }
  if (pendingActorId.value !== selectedAlly.value.id) {
    const pending = pendingActorId.value ? findFighterById(pendingActorId.value) : null;
    return pending ? `当前轮到 ${pending.name} 行动，${selectedAlly.value.name} 暂时只能预览技能。` : '当前还没有可操作角色。';
  }
  if (getSkillCooldown(selectedAlly.value, selectedSkill.value.id) > 0) {
    return '该技能仍在冷却中。';
  }
  if (requiresManualTarget(selectedSkill.value)) {
    return '关闭弹窗后，点击战场中高亮的合法目标释放。';
  }
  return '再次点击技能即可直接释放。';
});
const targetZoneTitle = computed(() => {
  if (!selectedSkill.value) {
    return '目标选择';
  }
  if (selectedSkill.value.targetType === 'ally') {
    return '目标选择（我方）';
  }
  if (selectedSkill.value.targetType === 'any') {
    return '目标选择（我方或敌方）';
  }
  return '目标选择（敌方）';
});

function cloneSquadStats(stats: SquadMemberStats): SquadMemberStats {
  return {
    physicalAttack: stats.physicalAttack,
    magicAttack: stats.magicAttack,
    hp: stats.hp,
    physicalResist: stats.physicalResist,
    magicResist: stats.magicResist,
    speed: stats.speed,
  };
}

function cloneSkillDefinition(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    targetPriorityRoles: skill.targetPriorityRoles ? [...skill.targetPriorityRoles] : undefined,
  };
}

function cloneSkillDefinitions(skills: SkillDefinition[]): SkillDefinition[] {
  return skills.map(cloneSkillDefinition);
}

function cloneEnemyRoleSkillLibrary(library: EnemyRoleSkillLibrary): EnemyRoleSkillLibrary {
  return {
    guard: cloneSkillDefinitions(library.guard),
    mage: cloneSkillDefinitions(library.mage),
    support: cloneSkillDefinitions(library.support),
    assassin: cloneSkillDefinitions(library.assassin),
  };
}

function createFallbackEnemyRoleSkillLibrary(): EnemyRoleSkillLibrary {
  return cloneEnemyRoleSkillLibrary(FALLBACK_ENEMY_ROLE_SKILLS);
}

function isSkillTargetType(value: unknown): value is SkillTargetType {
  return value === 'opponent' || value === 'ally' || value === 'any' || value === 'none';
}

function isSkillTargetMode(value: unknown): value is SkillTargetMode {
  return value === 'selected' || value === 'allOpponents' || value === 'randomOpponents' || value === 'none';
}

function isSkillKind(value: unknown): value is SkillKind {
  return value === 'physical' || value === 'magic';
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  const numberValue = normalizeFiniteNumber(value);
  if (numberValue === undefined) {
    return undefined;
  }
  return Math.max(0, Math.trunc(numberValue));
}

function parseEnemyStatPercent(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return _.clamp(Math.trunc(numberValue), MIN_ENEMY_STAT_PERCENT, MAX_ENEMY_STAT_PERCENT);
}

function normalizeEnemyStatPercent(value: unknown, fallback = DEFAULT_ENEMY_STAT_PERCENT): number {
  const numberValue = typeof value === 'number' ? value : Number(String(value).replace('%', ''));
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return _.clamp(Math.trunc(numberValue), MIN_ENEMY_STAT_PERCENT, MAX_ENEMY_STAT_PERCENT);
}

function createDefaultEnemyStatSettings(): EnemyStatSettings {
  return {
    version: ENEMY_STAT_SETTINGS_VERSION,
    percent: DEFAULT_ENEMY_STAT_PERCENT,
  };
}

function normalizeEnemyStatSettings(raw: unknown): EnemyStatSettings {
  if (!raw || typeof raw !== 'object') {
    return createDefaultEnemyStatSettings();
  }

  const record = raw as Record<string, unknown>;
  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version)
        ? Math.trunc(record.version)
        : ENEMY_STAT_SETTINGS_VERSION,
    percent: normalizeEnemyStatPercent(record.percent, DEFAULT_ENEMY_STAT_PERCENT),
  };
}

function loadEnemyStatSettings() {
  const variables = readChatVariables();
  enemyStatSettings.value = normalizeEnemyStatSettings(_.get(variables, ENEMY_STAT_SETTINGS_KEY));
}

function persistEnemyStatSettings() {
  const variables = readChatVariables();
  _.set(variables, ENEMY_STAT_SETTINGS_KEY, {
    version: ENEMY_STAT_SETTINGS_VERSION,
    percent: enemyStatSettings.value.percent,
  });

  void withTavernHelper('写入敌方属性倍率', false, helper => {
    helper.replaceVariables(variables, { type: 'chat' });
    return true;
  });
}

function getEnemyDifficultyRemark(percent: number): string {
  if (percent < 50) {
    return '你诗人？';
  }
  if (percent < 80) {
    return '我是懦夫';
  }
  if (percent < 100) {
    return '养生打法';
  }
  if (percent === 100) {
    return '';
  }
  if (percent <= 120) {
    return '来点难度';
  }
  if (percent <= 140) {
    return '压力！';
  }
  if (percent <= 150) {
    return '群英荟萃';
  }
  if (percent <= 170) {
    return '天骄尽出';
  }
  return '我不做人了！';
}

function normalizeSkillDefinition(raw: unknown): SkillDefinition | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';
  const targetType = isSkillTargetType(record.targetType) ? record.targetType : null;
  const targetMode = isSkillTargetMode(record.targetMode) ? record.targetMode : null;
  const cooldown = normalizeNonNegativeInteger(record.cooldown);

  if (!id || !name || !description || !targetType || !targetMode || cooldown === undefined) {
    return null;
  }

  const kind = isSkillKind(record.kind) ? record.kind : undefined;
  const priorityRoles = Array.isArray(record.targetPriorityRoles)
    ? record.targetPriorityRoles.filter((role): role is SquadMemberRole => SQUAD_ROLES.includes(role as SquadMemberRole))
    : undefined;

  return {
    id,
    name,
    kind,
    ratio: normalizeFiniteNumber(record.ratio),
    cooldown: Math.min(cooldown, 3),
    description,
    targetType,
    targetMode,
    randomTargetCount: normalizeNonNegativeInteger(record.randomTargetCount),
    ignoreResistRate: normalizeFiniteNumber(record.ignoreResistRate),
    selfHealMaxHpRate: normalizeFiniteNumber(record.selfHealMaxHpRate),
    targetHealMaxHpRate: normalizeFiniteNumber(record.targetHealMaxHpRate),
    teamHealMaxHpRate: normalizeFiniteNumber(record.teamHealMaxHpRate),
    teamShieldMaxHpRate: normalizeFiniteNumber(record.teamShieldMaxHpRate),
    cooldownReduction: normalizeNonNegativeInteger(record.cooldownReduction),
    attackBuffRate: normalizeFiniteNumber(record.attackBuffRate),
    nextRoundTeamStatBuffRate: normalizeFiniteNumber(record.nextRoundTeamStatBuffRate),
    selfDefenseBuffRate: normalizeFiniteNumber(record.selfDefenseBuffRate),
    counterStance: record.counterStance === true,
    counterIncomingDamageMultiplier: normalizeFiniteNumber(record.counterIncomingDamageMultiplier),
    counterReflectRate: normalizeFiniteNumber(record.counterReflectRate),
    counterNextRoundHealMaxHpRate: normalizeFiniteNumber(record.counterNextRoundHealMaxHpRate),
    silenceNextRound: record.silenceNextRound === true,
    selfUntargetableNextRound: record.selfUntargetableNextRound === true,
    selfOverloadDebuff: record.selfOverloadDebuff === true,
    targetVulnerableNextRoundRate: normalizeFiniteNumber(record.targetVulnerableNextRoundRate),
    executeThresholdHpRate: normalizeFiniteNumber(record.executeThresholdHpRate),
    executeRatio: normalizeFiniteNumber(record.executeRatio),
    targetPriorityRoles: priorityRoles && priorityRoles.length > 0 ? priorityRoles : undefined,
    selfCurrentHpCostRate: normalizeFiniteNumber(record.selfCurrentHpCostRate),
  };
}

function normalizeEnemySkillLibraryPayload(raw: unknown): EnemyRoleSkillLibrary | null {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const roleSkillsRecord = record.roleSkills && typeof record.roleSkills === 'object' ? (record.roleSkills as Record<string, unknown>) : record;
  const nextLibrary: Partial<EnemyRoleSkillLibrary> = {};

  for (const role of SQUAD_ROLES) {
    const rawSkills = roleSkillsRecord[role];
    if (!Array.isArray(rawSkills)) {
      return null;
    }

    const skills = rawSkills.map(normalizeSkillDefinition).filter(Boolean) as SkillDefinition[];
    if (skills.length < ENEMY_SKILL_DRAW_COUNT) {
      return null;
    }

    nextLibrary[role] = skills;
  }

  return cloneEnemyRoleSkillLibrary(nextLibrary as EnemyRoleSkillLibrary);
}

function readEnemySkillLibraryGlobal(): EnemyRoleSkillLibrary | null {
  const candidates = [window, resolveHostRuntime(), window.parent, window.top].filter(Boolean) as Array<
    Window & typeof globalThis & Record<string, unknown>
  >;
  const visited = new Set<Window>();

  for (const candidate of candidates) {
    if (visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    try {
      const library = normalizeEnemySkillLibraryPayload(candidate[ENEMY_SKILL_LIBRARY_GLOBAL_KEY]);
      if (library) {
        return library;
      }
    } catch {
      // ignore cross-origin access failures
    }
  }

  return null;
}

function getEnemySkillLibraryUrlFromVariables(): string {
  const variables = readChatVariables();
  const value = _.get(variables, ENEMY_SKILL_LIBRARY_URL_VARIABLE_KEY);
  return typeof value === 'string' ? value.trim() : '';
}

function pushUniqueUrl(urls: string[], url: string) {
  if (url && !urls.includes(url)) {
    urls.push(url);
  }
}

function resolveDefaultEnemySkillLibraryUrls(): string[] {
  const urls: string[] = [];
  try {
    const moduleUrl = String(import.meta.url);
    pushUniqueUrl(urls, new URL(`../${'敌方技能库'}/index.js`, moduleUrl).href);
    pushUniqueUrl(urls, new URL(`../${'全屏覆盖式酒馆前端'}/${'敌方技能库'}/index.js`, moduleUrl).href);
  } catch {
    // fall back to script element discovery below
  }

  const runtime = resolveHostRuntime();
  const candidates = [runtime?.document?.currentScript, document.currentScript].filter(Boolean) as HTMLScriptElement[];
  for (const script of candidates) {
    const source = script.src;
    if (!source) {
      continue;
    }

    try {
      pushUniqueUrl(urls, new URL('../敌方技能库/index.js', source).href);
      pushUniqueUrl(urls, new URL('../全屏覆盖式酒馆前端/敌方技能库/index.js', source).href);
    } catch {
      // ignore malformed script URLs
    }
  }
  return urls;
}

function loadScriptOnce(url: string) {
  return new Promise<void>((resolve, reject) => {
    const hostDocument = resolveHostRuntime()?.document ?? document;
    const existing = Array.from(hostDocument.querySelectorAll<HTMLScriptElement>('script[data-th-enemy-skill-library-url]')).find(
      script => script.dataset.thEnemySkillLibraryUrl === url,
    );
    if (existing) {
      resolve();
      return;
    }

    const script = hostDocument.createElement('script');
    script.type = 'module';
    script.src = url;
    script.dataset.thEnemySkillLibraryUrl = url;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(Error(`敌方技能库加载失败：${url}`)), { once: true });
    hostDocument.head.append(script);
  });
}

async function ensureEnemySkillLibraryLoaded() {
  if (enemySkillLibraryLoadPromise) {
    return enemySkillLibraryLoadPromise;
  }

  enemySkillLibraryLoadPromise = (async () => {
    const loadedGlobalLibrary = readEnemySkillLibraryGlobal();
    if (loadedGlobalLibrary) {
      activeEnemyRoleSkills = loadedGlobalLibrary;
      enemySkillLibrarySourceText.value = '外部已注册技能库';
      return;
    }

    const configuredUrl = getEnemySkillLibraryUrlFromVariables();
    const urls = configuredUrl ? [configuredUrl] : resolveDefaultEnemySkillLibraryUrls();
    if (urls.length === 0) {
      activeEnemyRoleSkills = createFallbackEnemyRoleSkillLibrary();
      enemySkillLibrarySourceText.value = '内置兜底技能库';
      return;
    }

    let lastError: unknown = null;
    for (const url of urls) {
      try {
        await loadScriptOnce(url);
        const externalLibrary = readEnemySkillLibraryGlobal();
        if (!externalLibrary) {
          throw Error('外部脚本没有注册有效技能库。');
        }
        activeEnemyRoleSkills = externalLibrary;
        enemySkillLibrarySourceText.value = configuredUrl ? '聊天变量指定的外部技能库' : '同目录外部技能库';
        return;
      } catch (error) {
        lastError = error;
      }
    }

    try {
      throw lastError ?? Error('没有可用的敌方技能库链接。');
    } catch (error) {
      activeEnemyRoleSkills = createFallbackEnemyRoleSkillLibrary();
      enemySkillLibrarySourceText.value = '内置兜底技能库';
      console.warn('[全屏覆盖式酒馆前端] 敌方技能库加载失败，已回退内置技能库。', error);
    }
  })();

  return enemySkillLibraryLoadPromise;
}

function sampleEnemySkillsForBattle(role: SquadMemberRole) {
  const roleSkills = activeEnemyRoleSkills[role] ?? FALLBACK_ENEMY_ROLE_SKILLS[role];
  return _.shuffle(roleSkills).slice(0, ENEMY_SKILL_DRAW_COUNT).map(cloneSkillDefinition);
}

function createInitialFighters() {
  const allyFighters = createAllyFightersFromRoster();
  return [...createEnemyFighters(allyFighters), ...allyFighters];
}

function createEnemyFighters(allyFighters: BattleFighter[]) {
  const enemyRoles: SquadMemberRole[] = ['guard', 'mage', 'support', 'assassin'];
  return enemyRoles.map(role => {
    const stats = createEnemyStatsForRole(role, allyFighters);
    const skills = sampleEnemySkillsForBattle(role);
    return {
      id: `enemy_${role}`,
      side: 'enemy',
      role,
      name: `敌方${getRoleLabel(role)}`,
      stats,
      currentHp: stats.hp,
      isDead: false,
      skills,
      cooldowns: createCooldownsForSkills(skills),
      shield: 0,
      shieldExpiresAtRoundStart: null,
      statuses: [],
    } satisfies BattleFighter;
  });
}

function createEnemyStatsForRole(role: SquadMemberRole, allyFighters: BattleFighter[]) {
  const ally = allyFighters.find(fighter => fighter.role === role);
  if (!ally) {
    return cloneSquadStats(ENEMY_STATS[role]);
  }

  const multiplier = enemyStatSettings.value.percent / 100;
  const allyStats = ally.stats;
  return {
    physicalAttack: scaleEnemyStat(allyStats.physicalAttack, multiplier),
    magicAttack: scaleEnemyStat(allyStats.magicAttack, multiplier),
    hp: scaleEnemyStat(allyStats.hp, multiplier),
    physicalResist: allyStats.physicalResist,
    magicResist: allyStats.magicResist,
    speed: scaleEnemyStat(allyStats.speed, multiplier),
  } satisfies SquadMemberStats;
}

function scaleEnemyStat(value: number, multiplier: number) {
  return Math.max(1, Math.round(value * multiplier));
}

function createAllyFightersFromRoster() {
  return battleRosterMembers.value.map(member => {
    const stats = cloneSquadStats(member.stats);
    return {
      id: member.id,
      side: 'ally',
      role: member.role,
      name: member.name,
      stats,
      currentHp: stats.hp,
      isDead: false,
      skills: getSkillDefinitionsFor('ally', member.role, member.id),
      cooldowns: createCooldownsForFighter('ally', member.role, member.id),
      shield: 0,
      shieldExpiresAtRoundStart: null,
      statuses: [],
    } satisfies BattleFighter;
  });
}

function createCooldownsForFighter(side: FighterSide, role: SquadMemberRole, fighterId: string) {
  return createCooldownsForSkills(getSkillDefinitionsFor(side, role, fighterId));
}

function createCooldownsForSkills(skills: SkillDefinition[]) {
  const cooldowns: Record<string, number> = {};
  skills.forEach(skill => {
    cooldowns[skill.id] = 0;
  });
  return cooldowns;
}

function isSquadMemberId(value: string): value is SquadMemberId {
  return (ALLY_MEMBER_IDS as readonly string[]).includes(value);
}

function getSkillDefinitionsFor(side: FighterSide, role: SquadMemberRole, fighterId: string) {
  if (side === 'ally' && isSquadMemberId(fighterId)) {
    return ALLY_SKILLS_BY_MEMBER_ID[fighterId];
  }
  return activeEnemyRoleSkills[role] ?? FALLBACK_ENEMY_ROLE_SKILLS[role];
}

function getSkillsForFighter(fighter: BattleFighter) {
  return fighter.skills;
}

function getSkillForFighter(fighter: BattleFighter, skillId: string) {
  return getSkillsForFighter(fighter).find(item => item.id === skillId) ?? null;
}

function buildFormationCells(side: FighterSide, positionMap: Record<SquadMemberRole, FormationSlot>) {
  return fighters.value
    .filter(fighter => fighter.side === side)
    .map(fighter => ({
      slot: positionMap[fighter.role],
      fighter,
    }))
    .sort((left, right) => formationOrder(left.slot) - formationOrder(right.slot));
}

function formationOrder(slot: FormationSlot) {
  if (slot === 'top') {
    return 1;
  }
  if (slot === 'left') {
    return 2;
  }
  if (slot === 'right') {
    return 3;
  }
  return 4;
}

function roleLabel(role: SquadMemberRole) {
  return getRoleLabel(role);
}

function resolveStoryBattleSessionId(state: StoryBattleState): string {
  if (state.sessionId.trim()) {
    return state.sessionId.trim();
  }
  return state.lastProcessedMessageId == null ? '' : `story_battle_${state.lastProcessedMessageId}`;
}

function getIdleTurnHint() {
  if (isTrainingMode.value) {
    return '训练场待机中，可随时开始训练。';
  }
  if (isCurrentStoryBattleIgnored.value) {
    return '已无视本次比赛，战斗场不会自动开启。';
  }
  if (isStoryBattleActive(storyBattleState.value)) {
    return '检测到比赛开始，战斗场正在准备。';
  }
  return '等待剧情中的比赛开始。';
}

function refreshStoryBattleState() {
  const variables = readChatVariables();
  const nextState = normalizeStoryBattleState(_.get(variables, STORY_BATTLE_STATE_KEY, {}));
  if (!_.isEqual(storyBattleState.value, nextState)) {
    storyBattleState.value = nextState;
  }
  syncStoryBattleState();
}

function cardClasses(fighter: BattleFighter) {
  const isTargetMode = isManualTargetArmed.value;
  const targetCheck = isTargetMode && selectedAlly.value && selectedSkill.value ? canSkillTargetFighter(selectedAlly.value, selectedSkill.value, fighter) : null;

  return {
    dead: fighter.isDead,
    selected: selectedAllyId.value === fighter.id,
    pending: pendingActorId.value === fighter.id,
    enemy: fighter.side === 'enemy',
    ally: fighter.side === 'ally',
    'target-mode': isTargetMode,
    'target-valid': Boolean(targetCheck?.allowed),
    'target-invalid': isTargetMode && !targetCheck?.allowed,
    'slot-top': getSlotClass(fighter.side, fighter.role) === 'top',
    'slot-left': getSlotClass(fighter.side, fighter.role) === 'left',
    'slot-right': getSlotClass(fighter.side, fighter.role) === 'right',
    'slot-bottom': getSlotClass(fighter.side, fighter.role) === 'bottom',
  };
}

function setFighterCardRef(fighterId: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) {
    fighterCardElements.set(fighterId, element);
    scheduleMagicCircleAnchorUpdate();
    return;
  }
  fighterCardElements.delete(fighterId);
  scheduleMagicCircleAnchorUpdate();
}

function scheduleMagicCircleAnchorUpdate() {
  if (magicCircleAnchorFrame !== null) {
    return;
  }

  magicCircleAnchorFrame = window.requestAnimationFrame(() => {
    magicCircleAnchorFrame = null;
    updateMagicCircleAnchor();
  });
}

function updateMagicCircleAnchor() {
  const stageElement = battleStageRef.value;
  const cardElement = fighterCardElements.get(SHEN_XIXI_MEMBER_ID);
  if (!stageElement || !cardElement) {
    shenXixiMagicCircleAnchor.value = null;
    return;
  }

  const stageRect = stageElement.getBoundingClientRect();
  const cardRect = cardElement.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0 || cardRect.width <= 0 || cardRect.height <= 0) {
    shenXixiMagicCircleAnchor.value = null;
    return;
  }

  shenXixiMagicCircleAnchor.value = {
    x: cardRect.left - stageRect.left + cardRect.width / 2,
    y: cardRect.top - stageRect.top + cardRect.height / 2,
    size: Math.max(180, Math.min(260, Math.max(cardRect.width, cardRect.height) * 1.82)),
  };
}

function getSlotClass(side: FighterSide, role: SquadMemberRole) {
  return side === 'enemy' ? ENEMY_POSITION[role] : ALLY_POSITION[role];
}

function findFighterById(fighterId: string) {
  return fighters.value.find(fighter => fighter.id === fighterId) ?? null;
}

function getSkillCooldown(fighter: BattleFighter, skillId: string) {
  return fighter.cooldowns[skillId] ?? 0;
}

function getDisplayedSkillCooldown(fighter: BattleFighter, skillId: string) {
  return getSkillCooldown(fighter, skillId);
}

function isStatusVisible(status: BattleStatus) {
  if (status.expiresAtRoundStart !== undefined && currentRound.value >= status.expiresAtRoundStart) {
    return false;
  }
  if (status.expiresAtRoundEnd !== undefined && currentRound.value > status.expiresAtRoundEnd) {
    return false;
  }
  return true;
}

function isStatusActive(status: BattleStatus) {
  if (!isStatusVisible(status)) {
    return false;
  }
  return currentRound.value >= status.startsAtRound;
}

function getActiveStatuses(fighter: BattleFighter) {
  return fighter.statuses.filter(isStatusActive);
}

function getStatusLabels(fighter: BattleFighter) {
  return fighter.statuses.filter(isStatusVisible).map(status => status.label);
}

function getEffectiveStat(fighter: BattleFighter, statKey: SquadMemberStatKey) {
  let value = fighter.stats[statKey];
  for (const status of getActiveStatuses(fighter)) {
    const multiplier = status.statMultipliers?.[statKey];
    if (multiplier !== undefined) {
      value *= multiplier;
    }
  }

  if (statKey === 'hp' || statKey === 'speed') {
    return Math.max(1, Math.round(value));
  }
  return Math.max(0, Math.round(value));
}

function addStatus(fighter: BattleFighter, status: BattleStatus) {
  fighter.statuses = fighter.statuses.filter(item => item.id !== status.id);
  fighter.statuses.push(status);
}

function removeExpiredRoundStartEffects() {
  fighters.value.forEach(fighter => {
    if (fighter.shieldExpiresAtRoundStart !== null && currentRound.value >= fighter.shieldExpiresAtRoundStart) {
      fighter.shield = 0;
      fighter.shieldExpiresAtRoundStart = null;
    }
    fighter.statuses = fighter.statuses.filter(
      status => status.expiresAtRoundStart === undefined || currentRound.value < status.expiresAtRoundStart,
    );
  });
}

function removeExpiredRoundEndEffects() {
  fighters.value.forEach(fighter => {
    fighter.statuses = fighter.statuses.filter(
      status => status.expiresAtRoundEnd === undefined || currentRound.value < status.expiresAtRoundEnd,
    );
  });
}

function resolvePendingRoundStartHeals() {
  const dueHeals = pendingRoundHeals.filter(item => item.round <= currentRound.value);
  pendingRoundHeals = pendingRoundHeals.filter(item => item.round > currentRound.value);

  dueHeals.forEach(item => {
    const target = findFighterById(item.fighterId);
    if (!target || target.isDead) {
      return;
    }
    healFighter(target, Math.round(target.stats.hp * item.maxHpRate), item.sourceName);
  });
}

function syncIdleBattlePreviewFromRoster() {
  if (isRunning.value) {
    return;
  }

  fighters.value = createInitialFighters();
  currentRound.value = 1;
  winnerText.value = '';
  selectedSkillId.value = null;
  pendingActorId.value = null;
  roundQueueText.value = '';
  pendingRoundHeals = [];

  if (!fighters.value.some(fighter => fighter.id === selectedAllyId.value && fighter.side === 'ally')) {
    selectedAllyId.value = fighters.value.find(fighter => fighter.side === 'ally')?.id ?? null;
  }

  turnHint.value = getIdleTurnHint();
}

function resetBattleState() {
  battleToken.value += 1;
  resolvePendingManualAction(null);
  fighters.value = createInitialFighters();
  isRunning.value = false;
  currentRound.value = 1;
  winnerText.value = '';
  selectedSkillId.value = null;
  pendingActorId.value = null;
  fighterDetailOpen.value = false;
  roundQueueText.value = '';
  clearBattleEffects();
  pendingRoundHeals = [];
  selectedAllyId.value = fighters.value.find(fighter => fighter.side === 'ally')?.id ?? null;
  turnHint.value = getIdleTurnHint();
  appendLog(`${isTrainingMode.value ? '训练' : '赛场'}预览已刷新。`, 'info');
}

function syncStoryBattleState() {
  if (isTrainingMode.value) {
    return;
  }

  const sessionId = currentStoryBattleSessionId.value;
  if (isCurrentStoryBattleIgnored.value) {
    if (isRunning.value || pendingActorId.value) {
      stopBattle('已无视本次比赛，战斗场已关闭。');
    }
    turnHint.value = '已无视本次比赛，战斗场不会自动开启。';
    return;
  }

  if (isStoryBattleActive(storyBattleState.value)) {
    if (!sessionId || isRunning.value || lastAutoStartedStoryBattleSessionId.value === sessionId) {
      return;
    }
    void startBattle('story');
    return;
  }

  if (isRunning.value || pendingActorId.value) {
    stopBattle('AI 已判断比赛结束，战斗场已自动关闭。');
  }
  if (!winnerText.value) {
    turnHint.value = '等待剧情中的比赛开始。';
  }
  lastAutoStartedStoryBattleSessionId.value = '';
}

function stopBattle(reason: string) {
  battleToken.value += 1;
  resolvePendingManualAction(null);
  if (isRunning.value) {
    appendLog(reason, 'warn');
  }
  isRunning.value = false;
  pendingActorId.value = null;
  selectedSkillId.value = null;
  clearBattleEffects();
  pendingRoundHeals = [];
}

async function startBattle(source: 'story' | 'training' = 'story') {
  const sessionId = currentStoryBattleSessionId.value;
  const isStorySource = source === 'story';
  if (isStorySource && (!isStoryBattleActive(storyBattleState.value) || isCurrentStoryBattleIgnored.value || !sessionId)) {
    return;
  }
  if (isRunning.value) {
    return;
  }

  await ensureEnemySkillLibraryLoaded();
  if (isStorySource && (!isStoryBattleActive(storyBattleState.value) || isCurrentStoryBattleIgnored.value || isRunning.value)) {
    return;
  }
  if (!isStorySource && isRunning.value) {
    return;
  }

  battleToken.value += 1;
  resolvePendingManualAction(null);
  fighters.value = createInitialFighters();
  selectedAllyId.value = fighters.value.find(fighter => fighter.side === 'ally')?.id ?? null;
  selectedSkillId.value = null;
  pendingActorId.value = null;
  fighterDetailOpen.value = false;
  currentRound.value = 1;
  winnerText.value = '';
  roundQueueText.value = '';
  battleLogs.value = [];
  clearBattleEffects();
  pendingRoundHeals = [];
  isRunning.value = true;
  if (isStorySource) {
    lastAutoStartedStoryBattleSessionId.value = sessionId;
  }
  turnHint.value = `${isTrainingMode.value ? '训练' : '比赛'}开始：按速度决定出手顺序。`;
  appendLog(`${isTrainingMode.value ? '训练' : '比赛'}开始。`, 'info');

  const token = battleToken.value;
  await runBattleLoop(token);
}

function startTrainingBattle() {
  if (!isTrainingMode.value || isRunning.value) {
    return;
  }
  void startBattle('training');
}

function openEnemyStatEditor() {
  enemyStatDraft.value = String(enemyStatPercent.value);
  enemyStatEditorOpen.value = true;
}

function closeEnemyStatEditor() {
  enemyStatEditorOpen.value = false;
}

function appendEnemyStatDigit(digit: string) {
  if (!/^\d$/.test(digit)) {
    return;
  }
  const nextDraft = `${enemyStatDraft.value}${digit}`.replace(/^0+(?=\d)/, '').slice(0, 3);
  enemyStatDraft.value = nextDraft || '0';
}

function deleteEnemyStatDigit() {
  enemyStatDraft.value = enemyStatDraft.value.slice(0, -1);
}

function commitEnemyStatDraft() {
  const percent = enemyStatDraftPercent.value;
  if (percent === null) {
    toastr.warning('请输入数字百分比。', '敌方属性');
    return;
  }

  enemyStatSettings.value = {
    version: ENEMY_STAT_SETTINGS_VERSION,
    percent,
  };
  persistEnemyStatSettings();
  closeEnemyStatEditor();
  syncIdleBattlePreviewFromRoster();
  appendLog(`敌方属性倍率已调整为 ${percent}%。`, 'info');
}

async function runBattleLoop(token: number) {
  while (isRunning.value && token === battleToken.value && currentRound.value <= maxRounds) {
    beginRound();
    const queue = buildRoundQueue();
    if (roundQueueText.value) {
      appendLog(roundQueueText.value, 'turn');
    }

    for (const actorId of queue) {
      if (!isRunning.value || token !== battleToken.value) {
        return;
      }

      const actor = findFighterById(actorId);
      if (!actor || actor.isDead) {
        continue;
      }

      if (actor.side === 'ally') {
        const handled = await handleAllyTurn(actor, token);
        if (!handled) {
          return;
        }
      } else {
        await handleEnemyTurn(actor, token);
      }

      if (!isRunning.value || token !== battleToken.value) {
        return;
      }

      const earlyWinner = determineWinnerByWipeOut();
      if (earlyWinner) {
        finishBattle(earlyWinner);
        return;
      }
    }

    endRound();
    const roundEndWinner = determineWinnerByWipeOut();
    if (roundEndWinner) {
      finishBattle(roundEndWinner);
      return;
    }

    if (currentRound.value >= maxRounds) {
      break;
    }

    currentRound.value += 1;
  }

  if (!isRunning.value || token !== battleToken.value) {
    return;
  }

  finishBattle(determineWinnerAtRoundEnd());
}

function beginRound() {
  tickCooldowns();
  removeExpiredRoundStartEffects();
  resolvePendingRoundStartHeals();
  selectedSkillId.value = null;
  pendingActorId.value = null;
  turnHint.value = `第 ${currentRound.value} 回合进行中。`;
}

function endRound() {
  removeExpiredRoundEndEffects();
}

function tickCooldowns() {
  fighters.value.forEach(fighter => {
    Object.keys(fighter.cooldowns).forEach(skillId => {
      fighter.cooldowns[skillId] = Math.max(0, fighter.cooldowns[skillId] - 1);
    });
  });
}

function buildRoundQueue() {
  const alive = fighters.value.filter(fighter => !fighter.isDead);
  if (alive.length === 0) {
    roundQueueText.value = '本回合无可行动角色。';
    return [] as string[];
  }

  const minSpeed = Math.min(...alive.map(fighter => getEffectiveStat(fighter, 'speed')));
  const ordered = [...alive].sort((left, right) => getEffectiveStat(right, 'speed') - getEffectiveStat(left, 'speed'));
  const normalQueue = ordered.map(fighter => fighter.id);
  const bonusQueue = ordered.filter(fighter => getEffectiveStat(fighter, 'speed') - minSpeed > 100).map(fighter => fighter.id);
  const queue = [...normalQueue, ...bonusQueue];
  roundQueueText.value = `出手顺序：${queue.map(actorId => findFighterById(actorId)?.name ?? actorId).join(' → ')}`;
  return queue;
}

async function handleAllyTurn(actor: BattleFighter, token: number) {
  if (isSilenced(actor)) {
    appendLog(`${actor.name} 受到沉默影响，本回合无法释放技能。`, 'warn');
    await sleepStep(battleDelayMs, token);
    return true;
  }

  const available = getAvailableSkills(actor);
  if (available.length === 0) {
    appendLog(`${actor.name} 因技能冷却中，本回合跳过。`, 'warn');
    await sleepStep(battleDelayMs, token);
    return true;
  }

  selectedAllyId.value = actor.id;
  selectedSkillId.value = null;
  pendingActorId.value = actor.id;
  fighterDetailOpen.value = true;
  turnHint.value = `轮到 ${actor.name}：请选择技能。`;
  appendLog(`轮到 ${actor.name} 行动。`, 'turn');

  const action = await waitForManualAction(actor.id);
  if (!action || token !== battleToken.value || !isRunning.value) {
    return false;
  }

  await executeSkill(action.actorId, action.skillId, action.targetId, token);
  return true;
}

async function handleEnemyTurn(actor: BattleFighter, token: number) {
  if (isSilenced(actor)) {
    appendLog(`${actor.name} 受到沉默影响，本回合无法释放技能。`, 'warn');
    await sleepStep(battleDelayMs, token);
    return;
  }

  const available = getAvailableSkills(actor);
  if (available.length === 0) {
    appendLog(`${actor.name} 因技能冷却中，本回合跳过。`, 'warn');
    await sleepStep(battleDelayMs, token);
    return;
  }

  const pickedAction = pickEnemyAction(actor, available);
  if (!pickedAction) {
    appendLog(`${actor.name} 找不到可选目标，本回合跳过。`, 'warn');
    await sleepStep(battleDelayMs, token);
    return;
  }

  turnHint.value = `${actor.name} 正在释放技能…`;
  await executeSkill(actor.id, pickedAction.skill.id, pickedAction.target.id, token);
}

function getAvailableSkills(actor: BattleFighter) {
  return getSkillsForFighter(actor).filter(skill => getSkillCooldown(actor, skill.id) <= 0);
}

function pickEnemyAction(actor: BattleFighter, available: SkillDefinition[]) {
  const choices: EnemyActionChoice[] = [];

  available.forEach(skill => {
    resolveEnemyTargetsForSkill(actor, skill).forEach(target => {
      choices.push({
        skill,
        target,
        score: scoreEnemySkill(actor, target, skill),
      });
    });
  });

  if (choices.length === 0) {
    return null;
  }

  choices.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.target.currentHp - right.target.currentHp;
  });
  return choices[0];
}

function resolveEnemyTargetsForSkill(actor: BattleFighter, skill: SkillDefinition) {
  if (!requiresManualTarget(skill)) {
    return [actor];
  }

  if (skill.targetType === 'ally') {
    const target = resolveUtilityTarget(actor, skill, null);
    return target ? [target] : [];
  }

  const selectableTargets = getSelectableTargetsForSkill(actor, skill);
  if (!skill.targetPriorityRoles || skill.targetPriorityRoles.length === 0) {
    return selectableTargets;
  }

  const priorityTargets = selectableTargets.filter(target => skill.targetPriorityRoles?.includes(target.role));
  return priorityTargets.length > 0 ? priorityTargets : selectableTargets;
}

function scoreEnemySkill(actor: BattleFighter, target: BattleFighter, skill: SkillDefinition) {
  let score = estimateSkillDamage(actor, target, skill);

  if (!isDamageSkill(skill)) {
    if (skill.teamHealMaxHpRate) {
      score += getAliveTeam(actor.side).reduce((total, member) => {
        const missingHp = member.stats.hp - member.currentHp;
        return total + Math.min(missingHp, Math.round(member.stats.hp * skill.teamHealMaxHpRate!));
      }, 0);
    }

    if (skill.targetHealMaxHpRate && target.side === actor.side) {
      score += Math.min(target.stats.hp - target.currentHp, Math.round(target.stats.hp * skill.targetHealMaxHpRate));
    }

    if (skill.teamShieldMaxHpRate) {
      score += getAliveTeam(actor.side).length * actor.stats.hp * skill.teamShieldMaxHpRate * 0.35;
    }

    if (skill.attackBuffRate || skill.cooldownReduction || skill.nextRoundTeamStatBuffRate) {
      score += 55;
    }

    if (skill.counterStance || skill.selfUntargetableNextRound) {
      score += actor.currentHp <= actor.stats.hp * 0.55 ? 70 : 28;
    }
  }

  if (skill.silenceNextRound || skill.targetVulnerableNextRoundRate) {
    score += target.side !== actor.side ? 42 : 0;
  }

  if (skill.targetPriorityRoles?.includes(target.role)) {
    score += 34;
  }

  if (target.side === actor.side) {
    const missingRate = 1 - target.currentHp / target.stats.hp;
    score += missingRate * 90;
  } else {
    score += (1 - target.currentHp / target.stats.hp) * 45;
  }

  return score;
}

function estimateSkillDamage(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition) {
  if (!isDamageSkill(skill) || target.side === attacker.side) {
    return 0;
  }
  return calculateDamageNumbers(attacker, target, skill).finalDamage;
}

function isDamageSkill(skill: SkillDefinition) {
  return Boolean(skill.kind && (skill.ratio !== undefined || skill.executeRatio !== undefined));
}

async function executeSkill(actorId: string, skillId: string, targetId: string | null, token: number) {
  if (!isRunning.value || token !== battleToken.value) {
    return;
  }

  const attacker = findFighterById(actorId);
  if (!attacker || attacker.isDead) {
    return;
  }

  const skill = getSkillForFighter(attacker, skillId);
  if (!skill) {
    return;
  }
  if (getSkillCooldown(attacker, skill.id) > 0) {
    appendLog(`${attacker.name} 尝试释放 ${skill.name}，但技能仍在冷却。`, 'warn');
    return;
  }
  if (isSilenced(attacker)) {
    appendLog(`${attacker.name} 尝试释放 ${skill.name}，但本回合无法释放技能。`, 'warn');
    return;
  }

  const target = targetId ? findFighterById(targetId) : null;
  if (requiresManualTarget(skill)) {
    if (!target || !canSkillTargetFighter(attacker, skill, target).allowed) {
      const reason = target ? canSkillTargetFighter(attacker, skill, target).reason : '技能需要先选择目标。';
      appendLog(`${attacker.name} 释放 ${skill.name} 失败：${reason}`, 'warn');
      return;
    }
  }

  const utilityTarget = resolveUtilityTarget(attacker, skill, target);
  applyPreDamageSkillEffects(attacker, skill);
  appendLog(`${attacker.name}${target ? ` 对 ${target.name}` : ''}释放「${skill.name}」。`, 'action');
  await sleepStep(battleDelayMs, token);
  if (!isRunning.value || token !== battleToken.value) {
    return;
  }

  applyUtilitySkillEffects(attacker, skill, utilityTarget);
  const damageTargets = resolveDamageTargets(attacker, skill, target);
  const statusTargets = damageTargets.length > 0 ? damageTargets : resolveStatusTargets(attacker, skill, target);
  if (isShenXixiMassSpell(attacker, skill)) {
    await runShenXixiMassSpellEffect(attacker, skill, damageTargets, token);
  } else {
    damageTargets.forEach(damageTarget => {
      applySkillDamage(attacker, damageTarget, skill);
    });
  }
  if (!isRunning.value || token !== battleToken.value) {
    return;
  }
  applyPostDamageSkillEffects(attacker, skill, utilityTarget, statusTargets);

  attacker.cooldowns[skill.id] = skill.cooldown + 1;
  await sleepStep(battleDelayMs, token);
}

function resolveUtilityTarget(attacker: BattleFighter, skill: SkillDefinition, selectedTarget: BattleFighter | null) {
  if (selectedTarget && selectedTarget.side === attacker.side) {
    return selectedTarget;
  }

  if (skill.targetType !== 'ally' || skill.targetMode !== 'selected') {
    return selectedTarget;
  }

  const allies = getAliveTeam(attacker.side);
  if (allies.length === 0) {
    return null;
  }

  if (skill.targetHealMaxHpRate) {
    return [...allies].sort((left, right) => left.currentHp / left.stats.hp - right.currentHp / right.stats.hp)[0];
  }

  if (skill.attackBuffRate && attacker.role === 'mage') {
    return _.maxBy(allies, ally => getEffectiveStat(ally, 'magicAttack')) ?? allies[0];
  }

  if (skill.cooldownReduction && !skill.attackBuffRate) {
    return _.maxBy(allies, ally => getEffectiveStat(ally, 'speed')) ?? allies[0];
  }

  return _.maxBy(allies, ally => Math.max(getEffectiveStat(ally, 'physicalAttack'), getEffectiveStat(ally, 'magicAttack'))) ?? allies[0];
}

function applyPreDamageSkillEffects(attacker: BattleFighter, skill: SkillDefinition) {
  if (skill.selfDefenseBuffRate) {
    const label = `双抗+${formatPercent(skill.selfDefenseBuffRate)}`;
    addStatus(attacker, {
      id: `${skill.id}_defense_buff`,
      kind: 'defense_buff',
      label,
      startsAtRound: currentRound.value,
      expiresAtRoundEnd: currentRound.value,
      statMultipliers: {
        physicalResist: 1 + skill.selfDefenseBuffRate,
        magicResist: 1 + skill.selfDefenseBuffRate,
      },
    });
    appendEffectLogIfEnemy(attacker, attacker, `本回合受到「${skill.name}」影响：${label}。`);
    appendLog(`${attacker.name} 进入守势，本回合双抗提高 ${formatPercent(skill.selfDefenseBuffRate)}。`, 'info');
  }

  if (skill.counterStance) {
    const incomingMultiplier = skill.counterIncomingDamageMultiplier ?? 0.8;
    const reflectRate = skill.counterReflectRate ?? 0.3;
    const nextRoundHealRate = skill.counterNextRoundHealMaxHpRate ?? 0.15;
    const label = reflectRate > 0 ? '返伤壁垒' : '防御壁垒';
    addStatus(attacker, {
      id: `${skill.id}_counter_stance`,
      kind: 'counter_stance',
      label,
      startsAtRound: currentRound.value,
      expiresAtRoundEnd: currentRound.value,
      incomingDamageMultiplier: incomingMultiplier,
      counterReflectRate: reflectRate,
    });
    if (nextRoundHealRate > 0) {
      pendingRoundHeals.push({
        fighterId: attacker.id,
        round: currentRound.value + 1,
        maxHpRate: nextRoundHealRate,
        sourceName: skill.name,
      });
    }
    appendEffectLogIfEnemy(attacker, attacker, `本回合受到「${skill.name}」影响：承伤 ${formatPercent(incomingMultiplier)}。`);
    appendLog(`${attacker.name} 架起${label}${nextRoundHealRate > 0 ? '，并将在下一回合回复生命' : ''}。`, 'info');
  }

  if (skill.selfOverloadDebuff) {
    addStatus(attacker, {
      id: `${skill.id}_overload`,
      kind: 'overload',
      label: '破限负荷',
      startsAtRound: currentRound.value,
      expiresAtRoundStart: currentRound.value + 2,
      statMultipliers: {
        speed: 0.8,
      },
      incomingDamageMultiplier: 1.1,
      ignoreIncomingResist: true,
    });
    appendEffectLogIfEnemy(attacker, attacker, `受到「${skill.name}」负荷影响：速度 -20%，双抗失效，受到伤害 +10%，持续到下回合结束。`);
    appendLog(`${attacker.name} 进入破限负荷，负面效果持续到下回合结束。`, 'warn');
  }
}

function applyUtilitySkillEffects(attacker: BattleFighter, skill: SkillDefinition, target: BattleFighter | null) {
  if (skill.teamShieldMaxHpRate) {
    const team = getAliveTeam(attacker.side);
    team.forEach(member => {
      member.shield = Math.max(member.shield, Math.round(member.stats.hp * skill.teamShieldMaxHpRate!));
      member.shieldExpiresAtRoundStart = currentRound.value + 1;
      appendEffectLogIfEnemy(attacker, member, `受到「${skill.name}」影响：获得 ${formatPercent(skill.teamShieldMaxHpRate!)} 最大生命护盾，下一回合开始清除。`);
    });
    appendLog(`${attacker.side === 'ally' ? '我方' : '敌方'}全体获得护盾，下一回合开始时清除。`, 'info');
  }

  if (skill.teamHealMaxHpRate) {
    getAliveTeam(attacker.side).forEach(member => {
      healFighter(member, Math.round(member.stats.hp * skill.teamHealMaxHpRate!), skill.name);
    });
  }

  if (skill.nextRoundTeamStatBuffRate) {
    getAliveTeam(attacker.side).forEach(member => {
      addStatus(member, {
        id: `${skill.id}_next_round_stat_boost`,
        kind: 'team_stat_buff',
        label: `下回合全属性+${formatPercent(skill.nextRoundTeamStatBuffRate!)}`,
        startsAtRound: currentRound.value + 1,
        expiresAtRoundStart: currentRound.value + 2,
        statMultipliers: {
          physicalAttack: 1 + skill.nextRoundTeamStatBuffRate!,
          magicAttack: 1 + skill.nextRoundTeamStatBuffRate!,
          physicalResist: 1 + skill.nextRoundTeamStatBuffRate!,
          magicResist: 1 + skill.nextRoundTeamStatBuffRate!,
          speed: 1 + skill.nextRoundTeamStatBuffRate!,
        },
      });
      appendEffectLogIfEnemy(attacker, member, `将在下回合受到「${skill.name}」影响：除生命外全属性 +${formatPercent(skill.nextRoundTeamStatBuffRate!)}。`);
    });
    appendLog(`${attacker.side === 'ally' ? '我方' : '敌方'}全体将在下一回合获得除生命外全属性 +${formatPercent(skill.nextRoundTeamStatBuffRate!)}。`, 'info');
  }

  if (skill.selfCurrentHpCostRate && attacker.currentHp > 1) {
    const cost = Math.min(attacker.currentHp - 1, Math.max(1, Math.round(attacker.currentHp * skill.selfCurrentHpCostRate)));
    const beforeHp = attacker.currentHp;
    attacker.currentHp -= cost;
    appendLog(`${attacker.name} 因「${skill.name}」消耗生命 ${cost}（${beforeHp} → ${attacker.currentHp}）。`, 'warn');
  }

  if (!target || target.isDead || target.side !== attacker.side) {
    return;
  }

  if (skill.targetHealMaxHpRate) {
    healFighter(target, Math.round(target.stats.hp * skill.targetHealMaxHpRate), skill.name);
  }

  if (skill.cooldownReduction) {
    reduceFighterCooldowns(target, skill.cooldownReduction);
    appendLog(`${target.name} 的技能冷却减少 ${skill.cooldownReduction} 回合。`, 'info');
  }

  if (skill.attackBuffRate) {
    const label = `攻击+${formatPercent(skill.attackBuffRate)}`;
    addStatus(target, {
      id: `${skill.id}_attack_boost`,
      kind: 'attack_buff',
      label,
      startsAtRound: currentRound.value,
      expiresAtRoundStart: currentRound.value + 2,
      statMultipliers: {
        physicalAttack: 1 + skill.attackBuffRate,
        magicAttack: 1 + skill.attackBuffRate,
      },
    });
    appendEffectLogIfEnemy(attacker, target, `受到「${skill.name}」影响：${label}，持续到下回合结束。`);
    appendLog(`${target.name} 获得 ${formatPercent(skill.attackBuffRate)} 攻击提升，持续到下回合结束。`, 'info');
  }
}

function applyPostDamageSkillEffects(
  attacker: BattleFighter,
  skill: SkillDefinition,
  target: BattleFighter | null,
  damageTargets: BattleFighter[],
) {
  if (skill.selfHealMaxHpRate) {
    healFighter(attacker, Math.round(attacker.stats.hp * skill.selfHealMaxHpRate), skill.name);
  }

  if (skill.silenceNextRound) {
    damageTargets.forEach(damageTarget => {
      addStatus(damageTarget, {
        id: `${skill.id}_silenced`,
        kind: 'silenced',
        label: '下回合沉默',
        startsAtRound: currentRound.value + 1,
        expiresAtRoundStart: currentRound.value + 2,
      });
      appendEffectLogIfEnemy(attacker, damageTarget, `将在下回合受到「${skill.name}」影响：无法释放技能。`);
      appendLog(`${damageTarget.name} 下回合无法释放技能。`, 'info');
    });
  }

  if (skill.targetVulnerableNextRoundRate) {
    damageTargets.forEach(damageTarget => {
      const label = `受伤+${formatPercent(skill.targetVulnerableNextRoundRate!)}`;
      addStatus(damageTarget, {
        id: `${skill.id}_vulnerable`,
        kind: 'vulnerable',
        label,
        startsAtRound: currentRound.value + 1,
        expiresAtRoundStart: currentRound.value + 2,
        incomingDamageMultiplier: 1 + skill.targetVulnerableNextRoundRate!,
      });
      appendEffectLogIfEnemy(attacker, damageTarget, `将在下回合受到「${skill.name}」影响：${label}。`);
      appendLog(`${damageTarget.name} 下回合受到伤害提高 ${formatPercent(skill.targetVulnerableNextRoundRate!)}。`, 'info');
    });
  }

  if (skill.selfUntargetableNextRound && (!target || target.side !== attacker.side || skill.targetMode === 'none')) {
    addStatus(attacker, {
      id: `${skill.id}_untargetable`,
      kind: 'untargetable',
      label: '下回合不可选中',
      startsAtRound: currentRound.value + 1,
      expiresAtRoundStart: currentRound.value + 2,
    });
    appendEffectLogIfEnemy(attacker, attacker, `将在下回合受到「${skill.name}」影响：不可被选中。`);
    appendLog(`${attacker.name} 将在下回合无法被敌方选中。`, 'info');
  }
}

function resolveDamageTargets(attacker: BattleFighter, skill: SkillDefinition, selectedTarget: BattleFighter | null) {
  if (!isDamageSkill(skill)) {
    return [];
  }

  if (skill.targetMode === 'selected') {
    if (!selectedTarget || selectedTarget.side === attacker.side) {
      return [];
    }
    return [selectedTarget];
  }

  const opponents = fighters.value.filter(fighter => fighter.side !== attacker.side && !fighter.isDead);
  if (skill.targetMode === 'allOpponents') {
    return opponents;
  }
  if (skill.targetMode === 'randomOpponents') {
    return _.shuffle(opponents).slice(0, skill.randomTargetCount ?? 1);
  }
  if (skill.targetMode === 'none') {
    return [];
  }
  return [];
}

function resolveStatusTargets(attacker: BattleFighter, skill: SkillDefinition, selectedTarget: BattleFighter | null) {
  if (!skill.silenceNextRound && !skill.targetVulnerableNextRoundRate) {
    return [];
  }

  if (skill.targetMode === 'selected') {
    if (!selectedTarget || selectedTarget.side === attacker.side) {
      return [];
    }
    return [selectedTarget];
  }

  const opponents = fighters.value.filter(fighter => fighter.side !== attacker.side && !fighter.isDead);
  if (skill.targetMode === 'allOpponents') {
    return opponents;
  }
  if (skill.targetMode === 'randomOpponents') {
    return _.shuffle(opponents).slice(0, skill.randomTargetCount ?? 1);
  }
  return [];
}

function applySkillDamage(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition) {
  if (!isDamageSkill(skill) || target.isDead) {
    return null;
  }

  const damage = calculateDamageNumbers(attacker, target, skill);
  const result = applyDamage(attacker, target, damage, true);
  triggerSkillDamageEffect(attacker, skill, result.hpDamage);
  const damageText = `${target.name} 受到 ${result.hpDamage} 点${damage.kind === 'magic' ? '法术' : '物理'}伤害`;
  const shieldText = result.shieldDamage > 0 ? `，护盾抵消 ${result.shieldDamage}` : '';
  appendLog(`${damageText}${shieldText}（${result.beforeHp} → ${result.afterHp}）。`, 'action');

  if (result.defeated) {
    appendLog(`${target.name} 已被击倒，角色框进入灰暗状态。`, 'result');
  }

  return result;
}

function isShenXixiMassSpell(attacker: BattleFighter, skill: SkillDefinition) {
  return attacker.id === SHEN_XIXI_MEMBER_ID && SHEN_XIXI_MASS_SPELL_IDS.has(skill.id);
}

async function runShenXixiMassSpellEffect(attacker: BattleFighter, skill: SkillDefinition, damageTargets: BattleFighter[], token: number) {
  const activeTargets = damageTargets.filter(damageTarget => !damageTarget.isDead);
  if (activeTargets.length === 0) {
    return;
  }

  const spellEffects = triggerShenXixiMassSpellCircleEffects(activeTargets);
  appendLog(`魔法阵笼罩 ${activeTargets.map(damageTarget => damageTarget.name).join('、')}，群星术式正在展开。`, 'action');
  await sleepStep(shenXixiMassSpellDamageDelayMs, token);
  if (!isRunning.value || token !== battleToken.value) {
    return;
  }

  activeTargets.forEach(damageTarget => {
    const result = applySkillDamage(attacker, damageTarget, skill);
    updateSpellCircleDamage(damageTarget.id, result?.hpDamage ?? 0);
  });

  window.setTimeout(() => {
    removeSpellCircleEffects(spellEffects.map(effect => effect.id));
  }, shenXixiMassSpellCleanupDelayMs);
}

function resolveSkillEffectTone(attacker: BattleFighter, skill: SkillDefinition): BattleEffectTone | null {
  if (attacker.id !== 'shen_xixi') {
    return null;
  }
  if (skill.id === 'shen_xixi_moon_spark') {
    return 'arcane';
  }
  if (skill.id === 'shen_xixi_star_lance') {
    return 'crimson';
  }
  return null;
}

function triggerSkillDamageEffect(attacker: BattleFighter, skill: SkillDefinition, damage: number) {
  const tone = resolveSkillEffectTone(attacker, skill);
  if (!tone || damage <= 0) {
    return;
  }

  if (battleEffectTimer !== null) {
    window.clearTimeout(battleEffectTimer);
    battleEffectTimer = null;
  }

  battleEffects.value = [
    {
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'beam',
      tone,
      damage,
    },
  ];

  battleEffectTimer = window.setTimeout(() => {
    battleEffects.value = [];
    battleEffectTimer = null;
  }, 980);
}

function triggerShenXixiMassSpellCircleEffects(targets: BattleFighter[]) {
  const stageElement = battleStageRef.value;
  if (!stageElement) {
    return [] as SpellCircleBattleEffect[];
  }

  const stageRect = stageElement.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) {
    return [] as SpellCircleBattleEffect[];
  }

  const spellEffects = targets
    .map(target => {
      const position = resolveFighterEffectPosition(target.id, stageRect);
      if (!position) {
        return null;
      }

      return {
        id: `${Date.now().toString(36)}_${target.id}_${Math.random().toString(36).slice(2, 7)}`,
        kind: 'spellCircle',
        targetId: target.id,
        damage: null,
        position,
      } satisfies SpellCircleBattleEffect;
    })
    .filter(Boolean) as SpellCircleBattleEffect[];

  battleEffects.value = [...battleEffects.value.filter(effect => effect.kind !== 'spellCircle'), ...spellEffects];
  return spellEffects;
}

function resolveFighterEffectPosition(fighterId: string, stageRect: DOMRect): BattleEffectPosition | null {
  const cardElement = fighterCardElements.get(fighterId);
  if (!cardElement) {
    return null;
  }

  const cardRect = cardElement.getBoundingClientRect();
  if (cardRect.width <= 0 || cardRect.height <= 0) {
    return null;
  }

  const circleSize = Math.max(230, Math.min(360, Math.max(cardRect.width, cardRect.height) * 2.55));
  return {
    x: cardRect.left - stageRect.left + cardRect.width / 2,
    y: cardRect.top - stageRect.top + cardRect.height * 0.36,
    width: circleSize,
    height: circleSize,
  };
}

function updateSpellCircleDamage(targetId: string, damage: number) {
  battleEffects.value = battleEffects.value.map(effect =>
    effect.kind === 'spellCircle' && effect.targetId === targetId
      ? {
          ...effect,
          damage,
        }
      : effect,
  );
}

function removeSpellCircleEffects(effectIds: string[]) {
  const removingEffectIds = new Set(effectIds);
  battleEffects.value = battleEffects.value.filter(effect => effect.kind !== 'spellCircle' || !removingEffectIds.has(effect.id));
}

function getBattleEffectClass(effect: BattleEffect) {
  if (effect.kind === 'beam') {
    return ['skill-beam-effect', `tone-${effect.tone}`];
  }
  return ['twin-stars-effect'];
}

function getBattleEffectStyle(effect: BattleEffect): Record<string, string> | undefined {
  if (effect.kind !== 'spellCircle') {
    return undefined;
  }

  const size = effect.position.width;
  return {
    left: `${effect.position.x}px`,
    top: `${effect.position.y}px`,
    width: `${size}px`,
    height: `${effect.position.height}px`,
    '--spell-effect-size': `${size}px`,
    '--spell-small-rune-size': `${Math.max(10, Math.min(18, size * 0.046))}px`,
    '--spell-large-rune-size': `${Math.max(12, Math.min(24, size * 0.062))}px`,
    '--spell-damage-size': `${Math.max(28, Math.min(42, size * 0.13))}px`,
  };
}

function getSpellGlyphStyle(index: number, radiusRate: number, delayOffsetSeconds: number) {
  const rotation = (360 / spellCircleGlyphs.length) * index;
  return {
    '--glyph-rotation': `${rotation}deg`,
    '--glyph-counter-rotation': `${-rotation}deg`,
    '--glyph-radius-rate': `${radiusRate}`,
    '--glyph-delay': `${delayOffsetSeconds + (3.8 / spellCircleGlyphs.length) * index}s`,
  };
}

function getOuterMarkerStyle(index: number) {
  return {
    '--marker-angle': `${45 * index}deg`,
    '--marker-counter-angle': `${-45 * index}deg`,
  };
}

function formatDamageNumber(damage: number) {
  return damage > 0 ? `-${damage}` : '0';
}

function clearBattleEffects() {
  battleEffects.value = [];
  if (battleEffectTimer !== null) {
    window.clearTimeout(battleEffectTimer);
    battleEffectTimer = null;
  }
}

function calculateDamageNumbers(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition): DamageNumbers {
  const kind = skill.kind ?? 'physical';
  const ratio = getEffectiveSkillRatio(target, skill);
  const attackValue = kind === 'magic' ? getEffectiveStat(attacker, 'magicAttack') : getEffectiveStat(attacker, 'physicalAttack');
  const rawDamage = Math.max(1, Math.round(attackValue * ratio));
  const baseResist = kind === 'magic' ? getEffectiveStat(target, 'magicResist') : getEffectiveStat(target, 'physicalResist');
  const targetResist = shouldIgnoreIncomingResist(target) ? 0 : baseResist;
  const effectiveResist = Math.round(targetResist * (1 - (skill.ignoreResistRate ?? 0)));

  return {
    kind,
    rawDamage,
    finalDamage: Math.max(1, rawDamage - effectiveResist),
  };
}

function getEffectiveSkillRatio(target: BattleFighter, skill: SkillDefinition) {
  if (skill.executeThresholdHpRate !== undefined && skill.executeRatio !== undefined) {
    const targetHpRate = target.currentHp / target.stats.hp;
    if (targetHpRate <= skill.executeThresholdHpRate) {
      return skill.executeRatio;
    }
  }
  return skill.ratio ?? 0;
}

function applyDamage(attacker: BattleFighter, target: BattleFighter, damage: DamageNumbers, allowCounter: boolean): DamageResult {
  const beforeHp = target.currentHp;
  const damageMultiplier = getIncomingDamageMultiplier(target);
  const rawDamage = Math.max(1, Math.round(damage.rawDamage * damageMultiplier));
  const finalDamage = Math.max(1, Math.round(damage.finalDamage * damageMultiplier));
  const shieldBefore = target.shield;
  let shieldDamage = 0;
  let hpDamage = finalDamage;

  if (shieldBefore > 0) {
    shieldDamage = Math.min(shieldBefore, rawDamage);
    target.shield = Math.max(0, shieldBefore - shieldDamage);

    if (rawDamage <= shieldBefore) {
      hpDamage = 0;
    } else {
      const overflowRatio = (rawDamage - shieldBefore) / rawDamage;
      hpDamage = Math.max(1, Math.round(finalDamage * overflowRatio));
    }
  }

  if (hpDamage > 0) {
    target.currentHp = Math.max(0, target.currentHp - hpDamage);
    if (target.currentHp <= 0) {
      target.currentHp = 0;
      target.isDead = true;
    }
  }

  const result: DamageResult = {
    hpDamage,
    shieldDamage,
    beforeHp,
    afterHp: target.currentHp,
    defeated: target.isDead && beforeHp > 0,
  };

  if (allowCounter && hpDamage > 0) {
    triggerCounterDamage(attacker, target, hpDamage);
  }

  return result;
}

function triggerCounterDamage(attacker: BattleFighter, damagedTarget: BattleFighter, receivedHpDamage: number) {
  if (attacker.side === damagedTarget.side || attacker.isDead) {
    return;
  }

  const counterStatus = getActiveStatuses(damagedTarget).find(status => status.counterReflectRate !== undefined);
  if (!counterStatus?.counterReflectRate) {
    return;
  }

  const reflectDamage = Math.max(1, Math.round(receivedHpDamage * counterStatus.counterReflectRate));
  const result = applyDamage(
    damagedTarget,
    attacker,
    {
      kind: 'magic',
      rawDamage: reflectDamage,
      finalDamage: reflectDamage,
    },
    false,
  );
  appendLog(`${damagedTarget.name} 的返伤壁垒返还 ${result.hpDamage} 点法术伤害给 ${attacker.name}。`, 'action');
  if (result.defeated) {
    appendLog(`${attacker.name} 已被击倒，角色框进入灰暗状态。`, 'result');
  }
}

function getIncomingDamageMultiplier(target: BattleFighter) {
  return getActiveStatuses(target).reduce((multiplier, status) => multiplier * (status.incomingDamageMultiplier ?? 1), 1);
}

function shouldIgnoreIncomingResist(target: BattleFighter) {
  return getActiveStatuses(target).some(status => status.ignoreIncomingResist);
}

function healFighter(target: BattleFighter, amount: number, sourceName: string) {
  if (target.isDead || amount <= 0) {
    return;
  }

  const oldHp = target.currentHp;
  target.currentHp = Math.min(target.stats.hp, target.currentHp + amount);
  appendLog(`${target.name} 因「${sourceName}」回复生命 ${target.currentHp - oldHp}。`, 'info');
}

function reduceFighterCooldowns(target: BattleFighter, amount: number) {
  Object.keys(target.cooldowns).forEach(skillId => {
    target.cooldowns[skillId] = Math.max(0, target.cooldowns[skillId] - amount);
  });
}

function getAliveTeam(side: FighterSide) {
  return fighters.value.filter(fighter => fighter.side === side && !fighter.isDead);
}

function isSilenced(fighter: BattleFighter) {
  return getActiveStatuses(fighter).some(status => status.kind === 'silenced');
}

function requiresManualTarget(skill: SkillDefinition) {
  return skill.targetMode === 'selected';
}

function getSelectableTargetsForSkill(actor: BattleFighter, skill: SkillDefinition) {
  if (!requiresManualTarget(skill)) {
    return [];
  }

  return fighters.value.filter(target => canSkillTargetFighter(actor, skill, target).allowed);
}

function canSkillTargetFighter(attacker: BattleFighter, skill: SkillDefinition, target: BattleFighter) {
  if (target.isDead) {
    return { allowed: false, reason: '目标已经阵亡。' };
  }
  if (!requiresManualTarget(skill)) {
    return { allowed: false, reason: '该技能不需要手动选择目标。' };
  }
  if (skill.targetType === 'opponent' && target.side === attacker.side) {
    return { allowed: false, reason: '该技能只能选择敌方目标。' };
  }
  if (skill.targetType === 'ally' && target.side !== attacker.side) {
    return { allowed: false, reason: '该技能只能选择我方目标。' };
  }
  if (skill.targetType === 'none') {
    return { allowed: false, reason: '该技能不需要目标。' };
  }
  if (skill.targetType === 'any' && skill.targetHealMaxHpRate && target.side !== attacker.side && !isDamageSkill(skill)) {
    return { allowed: false, reason: '该技能当前只能选择己方治疗目标。' };
  }
  if (skill.targetType === 'any' && isDamageSkill(skill) && target.side === attacker.side && !skill.targetHealMaxHpRate) {
    return { allowed: false, reason: '该技能当前只能选择敌方伤害目标。' };
  }
  if (attacker.side === 'enemy' && target.side === 'ally' && isUntargetableToEnemy(target)) {
    return { allowed: false, reason: `${target.name} 下回合无法被敌方选中。` };
  }

  const guardBlockReason = getEnemyGuardBlockReason(attacker, target, skill);
  if (guardBlockReason) {
    return { allowed: false, reason: guardBlockReason };
  }

  return { allowed: true, reason: '' };
}

function isUntargetableToEnemy(target: BattleFighter) {
  return getActiveStatuses(target).some(status => status.kind === 'untargetable');
}

function getEnemyGuardBlockReason(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition) {
  if (attacker.side !== 'ally' || target.side !== 'enemy' || target.role === 'guard') {
    return '';
  }
  if (!fighters.value.some(fighter => fighter.side === 'enemy' && fighter.role === 'guard' && !fighter.isDead)) {
    return '';
  }
  if (attacker.role === 'assassin') {
    return '';
  }
  if (!isDamageSkill(skill) || skill.targetMode !== 'selected') {
    return '';
  }
  if (attacker.role === 'mage') {
    return '敌方战士仍存活，法师单体技能无法攻击后排。';
  }
  if (attacker.role === 'guard' || attacker.role === 'support') {
    return '敌方战士仍存活，战士和辅助无法攻击后排。';
  }
  return '';
}

function canSelectFighterAsManualTarget(target: BattleFighter) {
  if (!selectedAlly.value || !selectedSkill.value || !canChooseManualTarget.value) {
    return false;
  }
  return canSkillTargetFighter(selectedAlly.value, selectedSkill.value, target).allowed;
}

function getManualTargetHint(target: BattleFighter) {
  if (!selectedAlly.value || !selectedSkill.value) {
    return '请先选择技能。';
  }
  const result = canSkillTargetFighter(selectedAlly.value, selectedSkill.value, target);
  return result.allowed ? '选择目标' : result.reason;
}

function determineWinnerByWipeOut() {
  const allyAliveCount = fighters.value.filter(fighter => fighter.side === 'ally' && !fighter.isDead).length;
  const enemyAliveCount = fighters.value.filter(fighter => fighter.side === 'enemy' && !fighter.isDead).length;

  if (allyAliveCount === 0 && enemyAliveCount === 0) {
    return '双方同归于尽，判定平局。';
  }
  if (allyAliveCount === 0) {
    return '敌方全歼我方，敌方获胜。';
  }
  if (enemyAliveCount === 0) {
    return '我方全歼敌方，我方获胜。';
  }
  return '';
}

function determineWinnerAtRoundEnd() {
  const allyAliveHp = fighters.value
    .filter(fighter => fighter.side === 'ally' && !fighter.isDead)
    .reduce((sum, fighter) => sum + fighter.currentHp, 0);
  const enemyAliveHp = fighters.value
    .filter(fighter => fighter.side === 'enemy' && !fighter.isDead)
    .reduce((sum, fighter) => sum + fighter.currentHp, 0);

  if (allyAliveHp === enemyAliveHp) {
    return `第 ${maxRounds} 回合结束，双方总生命相同，平局。`;
  }
  if (allyAliveHp > enemyAliveHp) {
    return `第 ${maxRounds} 回合结束，我方总生命更高，我方获胜。`;
  }
  return `第 ${maxRounds} 回合结束，敌方总生命更高，敌方获胜。`;
}

function finishBattle(text: string) {
  isRunning.value = false;
  resolvePendingManualAction(null);
  selectedSkillId.value = null;
  pendingActorId.value = null;
  winnerText.value = text;
  turnHint.value = text;
  appendLog(text, 'result');
}

function onFighterCardClicked(fighter: BattleFighter) {
  if (selectedSkill.value && requiresManualTarget(selectedSkill.value) && canChooseManualTarget.value) {
    if (canSelectFighterAsManualTarget(fighter)) {
      onManualTargetChosen(fighter.id);
      return;
    }

    if (fighter.id === pendingActorId.value && fighter.side === 'ally') {
      fighterDetailOpen.value = true;
      turnHint.value = `${fighter.name}：可以重新选择技能，或继续点击合法目标释放。`;
      return;
    }

    toastr.warning(getManualTargetHint(fighter), '战斗场');
    return;
  }

  if (fighter.side === 'enemy') {
    return;
  }

  selectedAllyId.value = fighter.id;
  fighterDetailOpen.value = true;

  if (!isRunning.value) {
    turnHint.value = `${fighter.name}：${isTrainingMode.value ? '训练开始前' : '等待剧情比赛触发'}，可预览技能。`;
    return;
  }

  if (pendingActorId.value && pendingActorId.value !== fighter.id) {
    const pending = findFighterById(pendingActorId.value);
    if (pending) {
      toastr.info(`当前轮到 ${pending.name} 行动。`, '战斗场');
    }
  }
}

function onSkillClicked(skillId: string) {
  if (!selectedAlly.value) {
    return;
  }

  selectedSkillId.value = skillId;
  const skill = getSkillForFighter(selectedAlly.value, skillId);
  if (!skill) {
    return;
  }

  if (!isRunning.value) {
    const previewText = isTrainingMode.value
      ? '当前是训练预览：开始训练后，轮到该角色行动时才能释放技能。'
      : '当前是预览状态：剧情比赛触发后，轮到该角色行动时才能释放技能。';
    turnHint.value = `${selectedAlly.value.name}：${previewText}`;
    toastr.info(previewText, isTrainingMode.value ? '训练场' : '战斗场');
    return;
  }
  if (pendingActorId.value !== selectedAlly.value.id) {
    const pending = pendingActorId.value ? findFighterById(pendingActorId.value) : null;
    if (pending) {
      toastr.info(`当前轮到 ${pending.name} 行动。`, '战斗场');
      turnHint.value = `当前轮到 ${pending.name} 行动，${selectedAlly.value.name} 暂时只能预览技能。`;
    }
    return;
  }
  if (getSkillCooldown(selectedAlly.value, skillId) > 0) {
    toastr.warning('该技能仍在冷却中。', '战斗场');
    return;
  }

  if (!requiresManualTarget(skill)) {
    resolvePendingManualAction({
      actorId: selectedAlly.value.id,
      skillId,
      targetId: null,
    });
    return;
  }

  if (!visibleManualTargets.value.some(target => canSelectFighterAsManualTarget(target))) {
    toastr.warning('当前没有可选择的合法目标。', '战斗场');
    return;
  }

  fighterDetailOpen.value = false;
  turnHint.value = '已选择技能，请点击合法目标释放。';
}

function onManualTargetChosen(targetId: string) {
  if (!selectedAlly.value || !selectedSkill.value || !selectedSkillId.value || !pendingActorId.value) {
    return;
  }
  if (!isRunning.value) {
    return;
  }
  if (pendingActorId.value !== selectedAlly.value.id) {
    return;
  }

  const target = findFighterById(targetId);
  if (!target) {
    return;
  }
  if (getSkillCooldown(selectedAlly.value, selectedSkillId.value) > 0) {
    toastr.warning('技能正在冷却，无法释放。', '战斗场');
    return;
  }
  const targetCheck = canSkillTargetFighter(selectedAlly.value, selectedSkill.value, target);
  if (!targetCheck.allowed) {
    toastr.warning(targetCheck.reason, '战斗场');
    return;
  }

  resolvePendingManualAction({
    actorId: selectedAlly.value.id,
    skillId: selectedSkillId.value,
    targetId,
  });
}

function closeFighterDetail() {
  fighterDetailOpen.value = false;
}

function waitForManualAction(actorId: string) {
  return new Promise<ManualAction | null>(resolve => {
    resolvePendingManualAction(null);
    pendingActorId.value = actorId;
    pendingManualResolver = resolve;
  });
}

function resolvePendingManualAction(action: ManualAction | null) {
  const resolver = pendingManualResolver;
  pendingManualResolver = null;
  if (resolver) {
    resolver(action);
  }
  if (action) {
    fighterDetailOpen.value = false;
  }
  if (action || pendingActorId.value) {
    pendingActorId.value = null;
  }
}

function appendLog(text: string, kind: BattleLogKind) {
  battleLogs.value.unshift({
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    kind,
  });
  if (battleLogs.value.length > 120) {
    battleLogs.value.length = 120;
  }
}

function appendEffectLogIfEnemy(source: BattleFighter, affected: BattleFighter, text: string) {
  if (source.side !== 'enemy') {
    return;
  }
  appendLog(`${affected.name}${text}`, 'warn');
}

function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function sleepStep(ms: number, token: number) {
  return new Promise<void>(resolve => {
    window.setTimeout(() => {
      if (token !== battleToken.value) {
        resolve();
        return;
      }
      resolve();
    }, ms);
  });
}

watch(
  battleRosterMembers,
  () => {
    syncIdleBattlePreviewFromRoster();
    syncStoryBattleState();
    void nextTick(scheduleMagicCircleAnchorUpdate);
  },
  { deep: true },
);

watch(
  selectedAllyId,
  () => {
    void nextTick(scheduleMagicCircleAnchorUpdate);
  },
);

watch(
  () => [storyBattleState.value.status, storyBattleState.value.sessionId, props.ignoredStoryBattleSessionId],
  () => {
    syncStoryBattleState();
  },
);

watch(
  enemyStatPercent,
  () => {
    syncIdleBattlePreviewFromRoster();
  },
);

onMounted(() => {
  ensureBattleRosterLoaded();
  loadEnemyStatSettings();
  void ensureEnemySkillLibraryLoaded().then(() => {
    syncIdleBattlePreviewFromRoster();
    syncStoryBattleState();
  });
  syncIdleBattlePreviewFromRoster();
  scheduleMagicCircleAnchorUpdate();
  window.addEventListener('resize', scheduleMagicCircleAnchorUpdate, { passive: true });
  if (!isTrainingMode.value) {
    refreshStoryBattleState();
    storyBattlePollTimer = window.setInterval(refreshStoryBattleState, 1_000);
  }
});

onBeforeUnmount(() => {
  battleToken.value += 1;
  resolvePendingManualAction(null);
  clearBattleEffects();
  window.removeEventListener('resize', scheduleMagicCircleAnchorUpdate);
  if (magicCircleAnchorFrame !== null) {
    window.cancelAnimationFrame(magicCircleAnchorFrame);
    magicCircleAnchorFrame = null;
  }
  fighterCardElements.clear();
  if (storyBattlePollTimer !== null) {
    window.clearInterval(storyBattlePollTimer);
    storyBattlePollTimer = null;
  }
});
</script>

<style scoped>
.battle-shell {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto minmax(112px, 0.28fr);
  gap: 10px;
}

.battle-toolbar,
.battle-stage,
.log-panel {
  border: 1px solid var(--line-color);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.08);
}

.battle-toolbar {
  padding: 10px 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.battle-state {
  margin: 0;
  color: var(--sub-color);
  font-size: 13px;
}

.toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toolbar-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 7px 12px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  cursor: pointer;
}

.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.difficulty-badge {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 6px 10px;
  color: var(--btn-fg);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
  line-height: 1.25;
  white-space: nowrap;
}

.battle-stage {
  position: relative;
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(270px, 1fr) minmax(210px, 0.62fr) minmax(270px, 1fr);
  align-items: center;
  justify-items: center;
  gap: 12px;
  overflow: hidden;
}

.formation-grid {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 430px;
  display: grid;
  grid-template-columns: repeat(3, minmax(74px, 1fr));
  grid-template-rows: repeat(3, minmax(88px, 1fr));
  gap: 8px;
  align-items: center;
  justify-items: center;
}

.arena-core {
  position: relative;
  z-index: 1;
  width: min(230px, 100%);
  aspect-ratio: 1 / 1;
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 10px 12px;
  background: linear-gradient(150deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.06));
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 5px;
  text-align: center;
}

.battle-effect-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  overflow: hidden;
}

.manual-target-banner {
  position: absolute;
  left: 50%;
  top: 10px;
  z-index: 5;
  max-width: min(560px, calc(100% - 24px));
  border: 1px solid rgba(120, 255, 201, 0.82);
  border-radius: 999px;
  padding: 8px 16px;
  color: #ecfff8;
  background: linear-gradient(135deg, rgba(5, 31, 32, 0.92), rgba(20, 65, 58, 0.88));
  box-shadow: 0 0 0 1px rgba(120, 255, 201, 0.24), 0 10px 24px rgba(0, 0, 0, 0.28);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.skill-beam-effect {
  --beam-core: #ffffff;
  --beam-start: #63f5ff;
  --beam-end: #ff5cc8;
  --beam-glow: rgba(99, 245, 255, 0.66);
  --impact-glow: rgba(255, 92, 200, 0.74);
  --damage-shadow: #7f163d;
  position: absolute;
  inset: 0;
  mix-blend-mode: screen;
}

.skill-beam-effect.tone-crimson {
  --beam-start: #ffb39b;
  --beam-end: #ff1f35;
  --beam-glow: rgba(255, 53, 39, 0.7);
  --impact-glow: rgba(255, 40, 48, 0.78);
  --damage-shadow: #771119;
}

.effect-charge {
  position: absolute;
  left: 48%;
  top: 84%;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    var(--beam-core) 0 8%,
    var(--beam-start) 9% 22%,
    rgba(99, 245, 255, 0.12) 54%,
    transparent 72%
  );
  filter: blur(0.2px);
  animation: battleChargePulse 920ms ease-out forwards;
}

.skill-beam-effect.tone-crimson .effect-charge {
  background: radial-gradient(
    circle,
    var(--beam-core) 0 8%,
    var(--beam-start) 9% 20%,
    rgba(255, 31, 53, 0.16) 55%,
    transparent 72%
  );
}

.effect-beam {
  position: absolute;
  left: 45%;
  top: 66%;
  width: 30%;
  height: 14px;
  border-radius: 999px;
  transform-origin: left center;
  transform: rotate(-24deg) scaleX(0);
  background: linear-gradient(90deg, transparent, var(--beam-start) 14%, var(--beam-core) 48%, var(--beam-end) 78%, transparent);
  box-shadow: 0 0 18px var(--beam-glow), 0 0 36px var(--impact-glow);
  animation: battleBeamStrike 920ms ease-out forwards;
}

.effect-shockwave {
  position: absolute;
  right: 50%;
  top: 18%;
  width: 44px;
  height: 44px;
  border: 3px solid rgba(255, 255, 255, 0.88);
  border-radius: 50%;
  transform: translate(50%, -50%) scale(0.4);
  box-shadow: 0 0 24px var(--impact-glow);
  animation: battleShockwave 920ms ease-out forwards;
}

.effect-damage {
  position: absolute;
  right: 45%;
  top: 8%;
  color: #fff7d7;
  font-size: 34px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 2px 0 var(--damage-shadow), 0 0 18px rgba(255, 230, 124, 0.95);
  animation: battleDamageFloat 920ms ease-out forwards;
}

.twin-stars-effect {
  --spell-cyan: #08fcec;
  --spell-cyan-soft: rgba(8, 252, 236, 0.36);
  --spell-cyan-faint: rgba(8, 252, 236, 0.14);
  --spell-shadow: rgba(8, 252, 236, 0.84);
  position: absolute;
  z-index: 4;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transform-origin: center;
  mix-blend-mode: screen;
  perspective: 760px;
  filter: drop-shadow(0 0 10px var(--spell-shadow)) drop-shadow(0 0 26px rgba(70, 180, 255, 0.58));
}

.mass-spell-circle-wrap {
  position: absolute;
  inset: 0;
  color: var(--spell-cyan);
  transform: translateY(-10%) rotateX(64deg) rotateY(-14deg) rotateZ(50deg) scale(0.86);
  transform-style: preserve-3d;
  animation: massSpellCircleCast 10.3s ease-in-out forwards;
}

.mass-spell-layer,
.mass-spell-layer::before,
.mass-spell-layer::after {
  box-sizing: border-box;
}

.mass-spell-layer,
.mass-spell-core-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center;
}

.mass-spell-core-glow {
  width: 28%;
  height: 28%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.96) 0 5%, rgba(8, 252, 236, 0.56) 24%, transparent 70%);
  transform: translate(-50%, -50%);
  opacity: 0;
  animation: massSpellCorePulse 10.3s ease-in-out forwards;
}

.mass-spell-min-star,
.mass-spell-star {
  width: 28%;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
}

.mass-spell-min-star::before,
.mass-spell-min-star::after,
.mass-spell-star::before,
.mass-spell-star::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 72%;
  height: 72%;
  border: 1px solid currentColor;
  transform: translate(-50%, -50%) rotate(45deg);
}

.mass-spell-min-star::after,
.mass-spell-star::after {
  transform: translate(-50%, -50%);
}

.mass-spell-min-star {
  color: rgba(4, 12, 24, 0.92);
  z-index: 3;
  opacity: 0.9;
}

.mass-spell-min-star::before,
.mass-spell-min-star::after {
  width: 42%;
  height: 42%;
  background: rgba(2, 8, 18, 0.7);
}

.mass-spell-star {
  animation: massSpellCounterRotate 8s linear infinite;
}

.mass-spell-star::before,
.mass-spell-star::after {
  box-shadow: 0 0 10px var(--spell-shadow);
}

.mass-spell-square {
  width: 32%;
  aspect-ratio: 1 / 1;
  border: 1px solid currentColor;
  transform: translate(-50%, -50%) rotate(45deg);
  animation: massSpellDiamondBloom 9.2s ease-out forwards;
}

.mass-spell-square::before {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px solid currentColor;
  transform: rotate(45deg);
}

.mass-spell-incantation {
  transform: translate(-50%, -50%);
  animation: massSpellRotate 28s linear infinite;
}

.mass-spell-incantation-small {
  width: 42%;
  height: 42%;
}

.mass-spell-incantation-large {
  width: 82%;
  height: 82%;
  animation-direction: reverse;
  animation-duration: 42s;
}

.mass-spell-rune {
  position: absolute;
  left: 50%;
  top: 50%;
  color: currentColor;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: var(--spell-small-rune-size);
  font-weight: 700;
  line-height: 1;
  opacity: 0;
  text-shadow: 0 0 8px var(--spell-shadow), 0 0 16px var(--spell-shadow);
  transform: rotate(var(--glyph-rotation)) translateY(calc(var(--spell-effect-size, 260px) * var(--glyph-radius-rate) * -1))
    rotate(var(--glyph-counter-rotation));
  animation: massSpellRuneReveal 0.28s linear var(--glyph-delay) forwards;
}

.mass-spell-incantation-large .mass-spell-rune {
  font-size: var(--spell-large-rune-size);
}

.mass-spell-double-circle {
  width: 47%;
  aspect-ratio: 1 / 1;
  border: 1px solid currentColor;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: massSpellZoomIn 4.6s ease-out forwards;
}

.mass-spell-double-circle::before {
  content: '';
  position: absolute;
  inset: -8%;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.mass-spell-stripe-circle {
  width: 64%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0,
    transparent 5px,
    var(--spell-cyan-soft) 5px,
    var(--spell-cyan-soft) 7px
  );
  opacity: 0.34;
  transform: translate(-50%, -50%);
  animation: massSpellCounterRotate 18s linear infinite;
}

.mass-spell-stripe-ring {
  position: absolute;
  inset: 0;
  border: 3px solid currentColor;
  border-radius: 50%;
}

.mass-spell-quarter-stars {
  width: 92%;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
}

.mass-spell-quarter-stars span {
  position: absolute;
  width: 15%;
  aspect-ratio: 1 / 1;
  border: 1px solid currentColor;
  box-shadow: 0 0 8px var(--spell-shadow);
}

.mass-spell-quarter-stars span::before {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px solid currentColor;
  transform: rotate(45deg);
}

.mass-spell-quarter-stars span:nth-child(1) {
  left: 23%;
  top: 19%;
}

.mass-spell-quarter-stars span:nth-child(2) {
  right: 23%;
  top: 19%;
}

.mass-spell-quarter-stars span:nth-child(3) {
  left: 23%;
  bottom: 19%;
}

.mass-spell-quarter-stars span:nth-child(4) {
  right: 23%;
  bottom: 19%;
}

.mass-spell-cross-line {
  width: 66%;
  height: 1px;
  background: currentColor;
  transform: translate(-50%, -50%) rotate(45deg);
}

.mass-spell-cross-line::before {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  transform: rotate(90deg);
}

.mass-spell-cross-square {
  width: 75%;
  height: 36%;
  border: 1px solid currentColor;
  transform: translate(-50%, -50%);
  animation: massSpellCrossSquareBloom 8.6s ease-out forwards;
}

.mass-spell-cross-square::before {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px solid currentColor;
  transform: rotate(90deg);
}

.mass-spell-middle-circle {
  width: 42%;
  aspect-ratio: 1 / 1;
  border: 1px dashed currentColor;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.mass-spell-middle-circle::before,
.mass-spell-middle-circle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 260%;
  height: 1px;
  background: currentColor;
  transform: translate(-50%, -50%);
}

.mass-spell-middle-circle::after {
  transform: translate(-50%, -50%) rotate(90deg);
}

.mass-spell-big-star {
  width: 78%;
  aspect-ratio: 1 / 1;
  border: 1px dotted currentColor;
  transform: translate(-50%, -50%);
  animation: massSpellRotate 24s linear infinite;
}

.mass-spell-big-star::before {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px dotted currentColor;
  transform: rotate(45deg);
}

.mass-spell-outer-line {
  width: 96%;
  aspect-ratio: 1 / 1;
  border: 1px solid currentColor;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.mass-spell-outer-line::before {
  content: '';
  position: absolute;
  inset: -12%;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.mass-spell-outer-markers {
  width: 118%;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  animation: massSpellCounterRotate 34s linear infinite;
}

.mass-spell-outer-marker {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4.8%;
  aspect-ratio: 1 / 1;
  border: 1px solid currentColor;
  border-radius: 50%;
  box-shadow: 0 0 10px var(--spell-shadow);
  transform: rotate(var(--marker-angle)) translateY(calc(var(--spell-effect-size, 260px) * -0.59)) rotate(var(--marker-counter-angle));
}

.mass-spell-impact-flash {
  width: 88%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.94) 0 4%, rgba(8, 252, 236, 0.7) 5% 12%, transparent 44%);
  transform: translate(-50%, -50%) scale(0.4);
  opacity: 0;
  animation: massSpellImpactFlash 10.3s ease-out forwards;
}

.spell-damage {
  position: absolute;
  left: 50%;
  top: -2%;
  color: #fff7d7;
  font-size: var(--spell-damage-size);
  font-weight: 900;
  line-height: 1;
  transform: translate(-50%, 0);
  text-shadow: 0 2px 0 #215c64, 0 0 18px rgba(255, 230, 124, 0.95), 0 0 26px rgba(8, 252, 236, 0.88);
  animation: spellDamageFloat 1.45s ease-out forwards;
}

.core-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.core-round,
.core-hp,
.core-tip,
.core-winner {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.core-tip {
  color: var(--sub-color);
}

.core-winner {
  color: #ffd780;
  font-weight: 700;
}

.fighter-card {
  width: min(118px, 100%);
  min-height: 100px;
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 7px;
  color: var(--text-color);
  background: rgba(0, 0, 0, 0.14);
  text-align: left;
  display: grid;
  align-content: start;
  gap: 4px;
  cursor: pointer;
}

.fighter-card.enemy {
  background: linear-gradient(160deg, rgba(119, 18, 38, 0.2), rgba(17, 5, 9, 0.15));
}

.fighter-card.ally {
  background: linear-gradient(160deg, rgba(17, 76, 132, 0.22), rgba(5, 14, 25, 0.13));
}

.fighter-card.selected {
  box-shadow: 0 0 0 1px var(--accent), 0 0 14px var(--accent-soft);
}

.fighter-card.pending {
  border-color: #ffd27c;
  box-shadow: 0 0 0 1px rgba(255, 210, 124, 0.5);
}

.fighter-card.target-mode {
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    opacity 140ms ease,
    transform 140ms ease;
}

.fighter-card.target-valid {
  border-color: #78ffc9;
  box-shadow:
    0 0 0 1px rgba(120, 255, 201, 0.58),
    0 0 18px rgba(120, 255, 201, 0.3);
}

.fighter-card.target-valid:hover {
  transform: translateY(-2px);
}

.fighter-card.target-invalid:not(.selected):not(.pending) {
  opacity: 0.52;
}

.fighter-card.dead {
  opacity: 0.42;
  filter: grayscale(1);
}

.slot-top {
  grid-row: 1;
  grid-column: 2;
}

.slot-left {
  grid-row: 2;
  grid-column: 1;
}

.slot-right {
  grid-row: 2;
  grid-column: 3;
}

.slot-bottom {
  grid-row: 3;
  grid-column: 2;
}

.fighter-name,
.fighter-role,
.fighter-hp,
.fighter-shield,
.fighter-speed,
.fighter-status,
.dead-mark {
  margin: 0;
  font-size: 11px;
  line-height: 1.32;
}

.fighter-name {
  font-weight: 700;
}

.fighter-role,
.fighter-shield,
.fighter-speed,
.fighter-status,
.panel-note,
.attr-line,
.log-title,
.target-title {
  color: var(--sub-color);
}

.dead-mark {
  color: #ff8b9a;
  font-weight: 700;
}

.battle-help {
  margin: 0;
  color: var(--sub-color);
  font-size: 12px;
  line-height: 1.5;
}

.roster-panel,
.skill-panel,
.log-panel {
  padding: 10px 12px;
}

.panel-headline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-headline h3 {
  margin: 0;
  font-size: 16px;
}

.panel-note,
.attr-line {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.roster-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.roster-card {
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.08);
  display: grid;
  gap: 4px;
}

.roster-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.roster-card-head strong {
  font-size: 14px;
}

.roster-card-head span {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--btn-fg);
  background: rgba(255, 255, 255, 0.08);
}

.roster-card p,
.skill-name,
.skill-desc,
.skill-state,
.log-item {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.skill-panel {
  display: grid;
  gap: 8px;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.skill-card {
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.1);
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 4px;
}

.skill-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft);
}

.skill-card.cooling {
  opacity: 0.6;
}

.skill-name {
  font-weight: 700;
}

.skill-action-hint {
  margin: 2px 0 0;
  border: 1px solid rgba(120, 255, 201, 0.34);
  border-radius: 10px;
  padding: 8px 10px;
  color: var(--sub-color);
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  line-height: 1.55;
}

.fighter-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  padding: 18px;
  background: rgba(0, 0, 0, 0.48);
  display: grid;
  place-items: center;
}

.enemy-percent-backdrop {
  position: fixed;
  inset: 0;
  z-index: 22;
  padding: 18px;
  background: rgba(0, 0, 0, 0.48);
  display: grid;
  place-items: center;
}

.fighter-modal {
  width: min(780px, 100%);
  max-height: min(86dvh, 760px);
  overflow: auto;
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 14px;
  color: var(--text-color);
  background: var(--panel-bg);
  box-shadow: 0 24px 54px rgba(0, 0, 0, 0.34);
  display: grid;
  gap: 12px;
}

.enemy-percent-modal {
  width: min(340px, 100%);
  border: 1px solid var(--line-color);
  border-radius: 14px;
  padding: 14px;
  color: var(--text-color);
  background: var(--panel-bg);
  box-shadow: 0 24px 54px rgba(0, 0, 0, 0.34);
  display: grid;
  gap: 12px;
}

.fighter-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.enemy-percent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.fighter-modal-head h3 {
  margin: 0;
  font-size: 18px;
}

.enemy-percent-head h3 {
  margin: 0;
  font-size: 17px;
}

.modal-close-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 7px 12px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  cursor: pointer;
}

.enemy-percent-remark {
  min-height: 22px;
  margin: 0;
  color: #ffd780;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}

.enemy-percent-input {
  width: 100%;
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--text-color);
  background: var(--input-bg);
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  outline: none;
}

.enemy-percent-keypad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.keypad-btn {
  min-height: 44px;
  border: 1px solid var(--line-color);
  border-radius: 10px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.keypad-btn.delete {
  grid-column: span 2;
}

.enemy-percent-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-stat-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.modal-stat-grid p,
.status-strip span {
  margin: 0;
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 7px 9px;
  color: var(--sub-color);
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  line-height: 1.35;
}

.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.target-zone {
  display: grid;
  gap: 6px;
}

.target-title {
  font-size: 12px;
}

.target-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 6px;
}

.target-btn {
  border: 1px dashed var(--line-color);
  border-radius: 999px;
  padding: 7px 10px;
  color: var(--btn-fg);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.target-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.log-panel {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 6px;
}

.log-list {
  min-height: 0;
  max-height: 100%;
  overflow: auto;
  display: grid;
  gap: 4px;
}

.log-item {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line-color);
}

.log-info {
  background: rgba(64, 163, 255, 0.08);
}

.log-turn {
  background: rgba(255, 206, 110, 0.12);
}

.log-action {
  background: rgba(113, 255, 188, 0.1);
}

.log-result {
  background: rgba(255, 188, 96, 0.2);
}

.log-warn {
  background: rgba(255, 112, 145, 0.14);
}

@keyframes battleChargePulse {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.35);
  }
  34% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  52%,
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.35);
  }
}

@keyframes battleBeamStrike {
  0%,
  28% {
    opacity: 0;
    transform: rotate(-24deg) scaleX(0);
  }
  43% {
    opacity: 1;
    transform: rotate(-24deg) scaleX(1);
  }
  60%,
  100% {
    opacity: 0;
    transform: rotate(-24deg) scaleX(1.05);
  }
}

@keyframes battleShockwave {
  0%,
  38% {
    opacity: 0;
    transform: translate(50%, -50%) scale(0.4);
  }
  52% {
    opacity: 0.9;
  }
  82%,
  100% {
    opacity: 0;
    transform: translate(50%, -50%) scale(4.8);
  }
}

@keyframes battleDamageFloat {
  0%,
  46% {
    opacity: 0;
    transform: translateY(14px) scale(0.8);
  }
  58% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-38px) scale(1.18);
  }
}

@keyframes massSpellCircleCast {
  0% {
    opacity: 0;
    transform: translateY(-10%) rotateX(64deg) rotateY(-14deg) rotateZ(50deg) scale(0.32);
  }
  14% {
    opacity: 0.96;
    transform: translateY(-10%) rotateX(64deg) rotateY(-14deg) rotateZ(50deg) scale(0.86);
  }
  84% {
    opacity: 0.96;
    transform: translateY(-10%) rotateX(64deg) rotateY(-14deg) rotateZ(72deg) scale(0.92);
  }
  92% {
    opacity: 1;
    transform: translateY(-10%) rotateX(64deg) rotateY(-14deg) rotateZ(82deg) scale(1.02);
  }
  100% {
    opacity: 0.46;
    transform: translateY(-10%) rotateX(64deg) rotateY(-14deg) rotateZ(90deg) scale(1.08);
  }
}

@keyframes massSpellRotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes massSpellCounterRotate {
  0% {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  100% {
    transform: translate(-50%, -50%) rotate(-360deg);
  }
}

@keyframes massSpellZoomIn {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.38);
  }
  32%,
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes massSpellDiamondBloom {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) rotate(45deg) scale(0.1);
  }
  48% {
    opacity: 0.5;
    transform: translate(-50%, -50%) rotate(45deg) scale(0.54);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) rotate(45deg) scale(1);
  }
}

@keyframes massSpellCrossSquareBloom {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.12);
  }
  48% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(0.58);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes massSpellRuneReveal {
  0% {
    opacity: 0;
    filter: blur(4px);
  }
  100% {
    opacity: 1;
    filter: blur(0);
  }
}

@keyframes massSpellCorePulse {
  0%,
  18% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.6);
  }
  34%,
  72% {
    opacity: 0.48;
    transform: translate(-50%, -50%) scale(1);
  }
  86% {
    opacity: 0.88;
    transform: translate(-50%, -50%) scale(1.28);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.6);
  }
}

@keyframes massSpellImpactFlash {
  0%,
  78% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.35);
  }
  84% {
    opacity: 0.92;
    transform: translate(-50%, -50%) scale(0.8);
  }
  91% {
    opacity: 0.36;
    transform: translate(-50%, -50%) scale(1.5);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.2);
  }
}

@keyframes spellDamageFloat {
  0% {
    opacity: 0;
    transform: translate(-50%, 18px) scale(0.72);
  }
  16% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.08);
  }
  52% {
    opacity: 1;
    transform: translate(-50%, -16px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -54px) scale(1.18);
  }
}

@media (max-width: 980px) {
  .roster-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .battle-toolbar {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .toolbar-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .battle-stage {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    gap: 8px;
    overflow: visible;
  }

  .formation-grid {
    grid-template-columns: repeat(3, minmax(70px, 1fr));
    grid-template-rows: repeat(3, 112px);
    max-width: 520px;
    gap: 6px;
  }

  .fighter-card {
    min-height: 106px;
    padding: 7px;
  }

  .arena-core {
    width: min(220px, 92%);
  }

  .effect-charge {
    left: 48%;
    top: 84%;
    width: 74px;
    height: 74px;
  }

  .effect-beam {
    left: 45%;
    top: 66%;
    width: 32%;
  }

  .effect-damage {
    right: 43%;
    font-size: 28px;
  }
}

@media (max-width: 720px) {
  .roster-grid {
    grid-template-columns: 1fr;
  }

  .battle-shell {
    grid-template-rows: auto auto auto minmax(120px, 1fr);
  }

  .battle-stage {
    padding: 10px;
  }

  .formation-grid {
    grid-template-rows: repeat(3, 96px);
  }

  .fighter-card {
    min-height: 90px;
    padding: 6px;
  }

  .fighter-name,
  .fighter-role,
  .fighter-hp,
  .fighter-shield,
  .fighter-speed,
  .fighter-status,
  .dead-mark {
    font-size: 10px;
    line-height: 1.22;
  }

  .core-title {
    font-size: 16px;
  }

  .arena-core {
    width: min(196px, 92%);
    padding: 8px;
  }

  .fighter-modal {
    max-height: 90dvh;
  }

  .fighter-modal-head {
    display: grid;
  }

  .modal-close-btn {
    justify-self: start;
  }

  .modal-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-height: 760px) and (min-width: 901px) {
  .battle-shell {
    grid-template-rows: auto minmax(0, 1fr) auto minmax(86px, 0.2fr);
    gap: 8px;
  }

  .battle-stage {
    padding: 10px;
  }

  .formation-grid {
    grid-template-rows: repeat(3, minmax(74px, 1fr));
    gap: 6px;
  }

  .fighter-card {
    min-height: 82px;
    padding: 6px;
  }

  .fighter-name,
  .fighter-role,
  .fighter-hp,
  .fighter-shield,
  .fighter-speed,
  .fighter-status,
  .dead-mark {
    font-size: 10px;
    line-height: 1.18;
  }

  .arena-core {
    width: min(190px, 100%);
    padding: 8px;
    gap: 3px;
  }

  .core-title {
    font-size: 16px;
  }

  .core-round,
  .core-hp,
  .core-tip,
  .core-winner {
    font-size: 11px;
    line-height: 1.35;
  }
}
</style>
