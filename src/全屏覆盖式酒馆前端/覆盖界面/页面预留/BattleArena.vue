<template>
  <section class="battle-shell">
    <header class="battle-toolbar">
      <p class="battle-state">{{ battleStatusText }}</p>

      <div class="toolbar-actions">
        <button type="button" class="toolbar-btn" :disabled="isRunning" @click="resetBattleState">刷新预览</button>
      </div>
    </header>

    <section class="battle-stage">
      <div class="formation-grid enemy-formation">
        <button
          v-for="slot in enemySlots"
          :key="slot.fighter.id"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

const props = defineProps<{
  ignoredStoryBattleSessionId?: string | null;
}>();

type FighterSide = 'ally' | 'enemy';
type SkillKind = 'physical' | 'magic';
type SkillTargetType = 'opponent' | 'ally' | 'any' | 'none';
type SkillTargetMode = 'selected' | 'allOpponents' | 'randomOpponents' | 'none';
type FormationSlot = 'top' | 'left' | 'right' | 'bottom';
type BattleLogKind = 'info' | 'turn' | 'action' | 'result' | 'warn';
type BattleStatusKind =
  | 'attack_buff'
  | 'team_stat_buff'
  | 'defense_buff'
  | 'counter_stance'
  | 'silenced'
  | 'untargetable'
  | 'overload';

type SkillDefinition = {
  id: string;
  name: string;
  kind?: SkillKind;
  ratio?: number;
  cooldown: number;
  description: string;
  targetType: SkillTargetType;
  targetMode: SkillTargetMode;
  randomTargetCount?: number;
  ignoreResistRate?: number;
  selfHealMaxHpRate?: number;
  targetHealMaxHpRate?: number;
  teamHealMaxHpRate?: number;
  teamShieldMaxHpRate?: number;
  cooldownReduction?: number;
  attackBuffRate?: number;
  nextRoundTeamStatBuffRate?: number;
  selfDefenseBuffRate?: number;
  counterStance?: boolean;
  silenceNextRound?: boolean;
  selfUntargetableNextRound?: boolean;
  selfOverloadDebuff?: boolean;
};

type BattleFighter = {
  id: string;
  side: FighterSide;
  role: SquadMemberRole;
  name: string;
  stats: SquadMemberStats;
  currentHp: number;
  isDead: boolean;
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

type EnemyActionChoice = {
  skill: SkillDefinition;
  target: BattleFighter;
  score: number;
};

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

const ENEMY_ROLE_SKILLS: Record<SquadMemberRole, SkillDefinition[]> = {
  guard: [
    {
      id: 'guard_shield_bash',
      name: '盾击',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'guard_iron_crash',
      name: '钢铁冲撞',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'guard_counter_wall',
      name: '反击壁垒',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'guard_crushing_roar',
      name: '压制怒吼',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
    },
  ],
  mage: [
    {
      id: 'mage_fire_lance',
      name: '炎枪术',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'mage_arcane_burst',
      name: '奥术爆裂',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'mage_frost_spike',
      name: '霜锥',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'mage_meteor_fall',
      name: '陨星落',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
  ],
  support: [
    {
      id: 'support_light_bolt',
      name: '辉光箭',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'support_judgment',
      name: '裁决光束',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'support_holy_pulse',
      name: '圣息脉冲',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'support_grace_mark',
      name: '恩典刻印',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 法术伤害。',
    },
  ],
  assassin: [
    {
      id: 'assassin_backstab',
      name: '背刺',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'assassin_shadow_combo',
      name: '影连斩',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'assassin_poison_edge',
      name: '毒刃',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'assassin_execute',
      name: '处决',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      targetType: 'opponent',
      targetMode: 'selected',
      description: '造成 200% 物理伤害。',
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

const maxRounds = 7;
const battleDelayMs = 420;

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

let pendingManualResolver: ((action: ManualAction | null) => void) | null = null;
let storyBattlePollTimer: number | null = null;
let pendingRoundHeals: PendingRoundHeal[] = [];

const selectedAlly = computed(() => fighters.value.find(fighter => fighter.id === selectedAllyId.value && fighter.side === 'ally') ?? null);
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
    return `当前状态：比赛进行中（第 ${currentRound.value} 回合）`;
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
  if (isRunning.value) {
    return '本场比赛已锁定触发时的我方属性；战队页后续修改会在下一次剧情比赛触发时生效。';
  }
  return '战队页中的属性会实时同步到这里，剧情变量触发比赛时会按当前值创建我方战斗单位。';
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

function createInitialFighters() {
  return [...createEnemyFighters(), ...createAllyFightersFromRoster()];
}

function createEnemyFighters() {
  const enemyRoles: SquadMemberRole[] = ['guard', 'mage', 'support', 'assassin'];
  return enemyRoles.map(role => {
    const stats = cloneSquadStats(ENEMY_STATS[role]);
    return {
      id: `enemy_${role}`,
      side: 'enemy',
      role,
      name: `敌方${getRoleLabel(role)}`,
      stats,
      currentHp: stats.hp,
      isDead: false,
      cooldowns: createCooldownsForFighter('enemy', role, `enemy_${role}`),
      shield: 0,
      shieldExpiresAtRoundStart: null,
      statuses: [],
    } satisfies BattleFighter;
  });
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
      cooldowns: createCooldownsForFighter('ally', member.role, member.id),
      shield: 0,
      shieldExpiresAtRoundStart: null,
      statuses: [],
    } satisfies BattleFighter;
  });
}

function createCooldownsForFighter(side: FighterSide, role: SquadMemberRole, fighterId: string) {
  const cooldowns: Record<string, number> = {};
  getSkillDefinitionsFor(side, role, fighterId).forEach(skill => {
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
  return ENEMY_ROLE_SKILLS[role];
}

function getSkillsForFighter(fighter: BattleFighter) {
  return getSkillDefinitionsFor(fighter.side, fighter.role, fighter.id);
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
  return {
    dead: fighter.isDead,
    selected: selectedAllyId.value === fighter.id,
    pending: pendingActorId.value === fighter.id,
    enemy: fighter.side === 'enemy',
    ally: fighter.side === 'ally',
    'slot-top': getSlotClass(fighter.side, fighter.role) === 'top',
    'slot-left': getSlotClass(fighter.side, fighter.role) === 'left',
    'slot-right': getSlotClass(fighter.side, fighter.role) === 'right',
    'slot-bottom': getSlotClass(fighter.side, fighter.role) === 'bottom',
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
  pendingRoundHeals = [];
  selectedAllyId.value = fighters.value.find(fighter => fighter.side === 'ally')?.id ?? null;
  turnHint.value = getIdleTurnHint();
  appendLog('赛场预览已刷新。', 'info');
}

function syncStoryBattleState() {
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
    void startBattle();
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
  pendingRoundHeals = [];
}

async function startBattle() {
  const sessionId = currentStoryBattleSessionId.value;
  if (!isStoryBattleActive(storyBattleState.value) || isCurrentStoryBattleIgnored.value || !sessionId) {
    return;
  }
  if (isRunning.value) {
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
  pendingRoundHeals = [];
  isRunning.value = true;
  lastAutoStartedStoryBattleSessionId.value = sessionId;
  turnHint.value = '比赛开始：按速度决定出手顺序。';
  appendLog('比赛开始。', 'info');

  const token = battleToken.value;
  await runBattleLoop(token);
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
    getSelectableTargetsForSkill(actor, skill).forEach(target => {
      choices.push({
        skill,
        target,
        score: estimateSkillDamage(actor, target, skill),
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

function estimateSkillDamage(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition) {
  if (!skill.kind || !skill.ratio) {
    return 0;
  }
  return calculateDamageNumbers(attacker, target, skill).finalDamage;
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

  applyPreDamageSkillEffects(attacker, skill);
  appendLog(`${attacker.name}${target ? ` 对 ${target.name}` : ''}释放「${skill.name}」。`, 'action');
  await sleepStep(battleDelayMs, token);
  if (!isRunning.value || token !== battleToken.value) {
    return;
  }

  applyUtilitySkillEffects(attacker, skill, target);
  const damageTargets = resolveDamageTargets(attacker, skill, target);
  damageTargets.forEach(damageTarget => {
    applySkillDamage(attacker, damageTarget, skill);
  });
  applyPostDamageSkillEffects(attacker, skill, target, damageTargets);

  attacker.cooldowns[skill.id] = skill.cooldown + 1;
  await sleepStep(battleDelayMs, token);
}

function applyPreDamageSkillEffects(attacker: BattleFighter, skill: SkillDefinition) {
  if (skill.selfDefenseBuffRate) {
    addStatus(attacker, {
      id: 'li_yenan_guarded_defense',
      kind: 'defense_buff',
      label: '双抗+10%',
      startsAtRound: currentRound.value,
      expiresAtRoundEnd: currentRound.value,
      statMultipliers: {
        physicalResist: 1 + skill.selfDefenseBuffRate,
        magicResist: 1 + skill.selfDefenseBuffRate,
      },
    });
    appendLog(`${attacker.name} 进入守势，本回合双抗提高 10%。`, 'info');
  }

  if (skill.counterStance) {
    addStatus(attacker, {
      id: 'li_yenan_counter_stance',
      kind: 'counter_stance',
      label: '返伤壁垒',
      startsAtRound: currentRound.value,
      expiresAtRoundEnd: currentRound.value,
      incomingDamageMultiplier: 0.8,
      counterReflectRate: 0.3,
    });
    pendingRoundHeals.push({
      fighterId: attacker.id,
      round: currentRound.value + 1,
      maxHpRate: 0.15,
      sourceName: '返伤壁垒',
    });
    appendLog(`${attacker.name} 架起返伤壁垒，并将在下一回合回复生命。`, 'info');
  }

  if (skill.selfOverloadDebuff) {
    addStatus(attacker, {
      id: 'bai_zhi_overload',
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
    appendLog(`${attacker.name} 进入破限负荷，负面效果持续到下回合结束。`, 'warn');
  }
}

function applyUtilitySkillEffects(attacker: BattleFighter, skill: SkillDefinition, target: BattleFighter | null) {
  if (skill.teamShieldMaxHpRate) {
    const team = getAliveTeam(attacker.side);
    team.forEach(member => {
      member.shield = Math.max(member.shield, Math.round(member.stats.hp * skill.teamShieldMaxHpRate!));
      member.shieldExpiresAtRoundStart = currentRound.value + 1;
    });
    appendLog(`我方全体获得护盾，下一回合开始时清除。`, 'info');
  }

  if (skill.teamHealMaxHpRate) {
    getAliveTeam(attacker.side).forEach(member => {
      healFighter(member, Math.round(member.stats.hp * skill.teamHealMaxHpRate!), skill.name);
    });
  }

  if (skill.nextRoundTeamStatBuffRate) {
    getAliveTeam(attacker.side).forEach(member => {
      addStatus(member, {
        id: 'su_su_next_round_stat_boost',
        kind: 'team_stat_buff',
        label: '下回合全属性+10%',
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
    });
    appendLog(`我方全体将在下一回合获得除生命外全属性 +10%。`, 'info');
  }

  if (!target || target.side !== attacker.side) {
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
    addStatus(target, {
      id: 'su_su_attack_boost',
      kind: 'attack_buff',
      label: '攻击+20%',
      startsAtRound: currentRound.value,
      expiresAtRoundStart: currentRound.value + 2,
      statMultipliers: {
        physicalAttack: 1 + skill.attackBuffRate,
        magicAttack: 1 + skill.attackBuffRate,
      },
    });
    appendLog(`${target.name} 获得 20% 攻击提升，持续到下回合结束。`, 'info');
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
        id: 'su_su_silenced',
        kind: 'silenced',
        label: '下回合沉默',
        startsAtRound: currentRound.value + 1,
        expiresAtRoundStart: currentRound.value + 2,
      });
      appendLog(`${damageTarget.name} 下回合无法释放技能。`, 'info');
    });
  }

  if (skill.selfUntargetableNextRound && target && target.side !== attacker.side) {
    addStatus(attacker, {
      id: 'bai_zhi_untargetable',
      kind: 'untargetable',
      label: '下回合不可选中',
      startsAtRound: currentRound.value + 1,
      expiresAtRoundStart: currentRound.value + 2,
    });
    appendLog(`${attacker.name} 将在下回合无法被敌方选中。`, 'info');
  }
}

function resolveDamageTargets(attacker: BattleFighter, skill: SkillDefinition, selectedTarget: BattleFighter | null) {
  if (!skill.kind || !skill.ratio) {
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
  if (!skill.kind || !skill.ratio || target.isDead) {
    return;
  }

  const damage = calculateDamageNumbers(attacker, target, skill);
  const result = applyDamage(attacker, target, damage, true);
  const damageText = `${target.name} 受到 ${result.hpDamage} 点${damage.kind === 'magic' ? '法术' : '物理'}伤害`;
  const shieldText = result.shieldDamage > 0 ? `，护盾抵消 ${result.shieldDamage}` : '';
  appendLog(`${damageText}${shieldText}（${result.beforeHp} → ${result.afterHp}）。`, 'action');

  if (result.defeated) {
    appendLog(`${target.name} 已被击倒，角色框进入灰暗状态。`, 'result');
  }
}

function calculateDamageNumbers(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition): DamageNumbers {
  const kind = skill.kind ?? 'physical';
  const ratio = skill.ratio ?? 0;
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
  if (!skill.kind || !skill.ratio || skill.targetMode !== 'selected') {
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
    if (fighter.side !== 'ally') {
      toastr.warning(getManualTargetHint(fighter), '战斗场');
      return;
    }
  }

  if (fighter.side === 'enemy') {
    return;
  }

  selectedAllyId.value = fighter.id;
  fighterDetailOpen.value = true;

  if (!isRunning.value) {
    turnHint.value = `${fighter.name}：等待剧情比赛触发，可预览技能。`;
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
    return;
  }
  if (pendingActorId.value !== selectedAlly.value.id) {
    const pending = pendingActorId.value ? findFighterById(pendingActorId.value) : null;
    if (pending) {
      toastr.info(`当前轮到 ${pending.name} 行动。`, '战斗场');
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
  },
  { deep: true },
);

watch(
  () => [storyBattleState.value.status, storyBattleState.value.sessionId, props.ignoredStoryBattleSessionId],
  () => {
    syncStoryBattleState();
  },
);

onMounted(() => {
  ensureBattleRosterLoaded();
  syncIdleBattlePreviewFromRoster();
  refreshStoryBattleState();
  storyBattlePollTimer = window.setInterval(refreshStoryBattleState, 1_000);
});

onBeforeUnmount(() => {
  battleToken.value += 1;
  resolvePendingManualAction(null);
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
  grid-template-rows: auto auto auto 1fr;
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

.battle-stage {
  padding: 12px;
  display: grid;
  grid-template-rows: auto auto auto;
  justify-items: center;
  gap: 8px;
}

.formation-grid {
  width: min(520px, 100%);
  display: grid;
  grid-template-columns: repeat(3, minmax(80px, 1fr));
  grid-template-rows: repeat(3, 138px);
  gap: 8px;
  align-items: center;
  justify-items: center;
}

.arena-core {
  width: min(290px, 86%);
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
  width: min(128px, 100%);
  min-height: 130px;
  border: 1px solid var(--line-color);
  border-radius: 10px;
  padding: 8px;
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
  font-size: 12px;
  line-height: 1.4;
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

.fighter-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
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

.fighter-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.fighter-modal-head h3 {
  margin: 0;
  font-size: 18px;
}

.modal-close-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 7px 12px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  cursor: pointer;
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
  max-height: 190px;
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

  .formation-grid {
    grid-template-columns: repeat(3, minmax(70px, 1fr));
    grid-template-rows: repeat(3, 126px);
    gap: 6px;
  }

  .fighter-card {
    min-height: 120px;
    padding: 7px;
  }

  .arena-core {
    width: min(250px, 92%);
  }
}

@media (max-width: 720px) {
  .roster-grid {
    grid-template-columns: 1fr;
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
</style>
