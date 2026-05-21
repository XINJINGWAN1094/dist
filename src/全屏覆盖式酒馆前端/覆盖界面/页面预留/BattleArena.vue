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
          <p class="fighter-speed">速度 {{ slot.fighter.stats.speed }}</p>
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
          <p class="fighter-speed">速度 {{ slot.fighter.stats.speed }}</p>
          <p v-if="slot.fighter.isDead" class="dead-mark">已阵亡</p>
        </button>
      </div>
    </section>

    <section class="roster-panel">
      <header class="panel-headline">
        <div>
          <h3>我方属性面板</h3>
          <p class="panel-note">{{ rosterSyncHint }}</p>
        </div>
      </header>

      <div class="roster-grid">
        <article v-for="member in allyRosterPreview" :key="member.id" class="roster-card">
          <div class="roster-card-head">
            <strong>{{ member.name }}</strong>
            <span>{{ roleLabel(member.role) }}</span>
          </div>
          <p>物攻 {{ member.stats.physicalAttack }} · 法攻 {{ member.stats.magicAttack }}</p>
          <p>生命 {{ member.stats.hp }} · 速度 {{ member.stats.speed }}</p>
          <p>物抗 {{ member.stats.physicalResist }} · 法抗 {{ member.stats.magicResist }}</p>
        </article>
      </div>
    </section>

    <section class="skill-panel">
      <header class="panel-headline">
        <div>
          <h3>{{ selectedAlly ? selectedAlly.name : '我方角色技能' }}</h3>
          <p v-if="selectedAlly" class="attr-line">
            法攻 {{ selectedAlly.stats.magicAttack }} · 物攻 {{ selectedAlly.stats.physicalAttack }} · 生命
            {{ selectedAlly.currentHp }}/{{ selectedAlly.stats.hp }} · 物抗 {{ selectedAlly.stats.physicalResist }} · 法抗
            {{ selectedAlly.stats.magicResist }} · 速度 {{ selectedAlly.stats.speed }}
          </p>
        </div>
      </header>

      <div v-if="selectedAlly" class="skill-grid">
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
            冷却：{{ getSkillCooldown(selectedAlly, skill.id) }} 回合
            <span v-if="getSkillCooldown(selectedAlly, skill.id) > 0">（不可释放）</span>
          </p>
        </button>
      </div>

      <div class="target-zone">
        <p class="target-title">目标选择（敌方）</p>
        <div class="target-grid">
          <button
            v-for="target in aliveEnemyFighters"
            :key="target.id"
            type="button"
            class="target-btn"
            :disabled="!canChooseEnemyTarget"
            @click="onEnemyTargetChosen(target.id)"
          >
            {{ target.name }} · {{ target.currentHp }}/{{ target.stats.hp }}
          </button>
        </div>
      </div>
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
  type SquadMember,
  type SquadMemberRole,
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
type FormationSlot = 'top' | 'left' | 'right' | 'bottom';
type BattleLogKind = 'info' | 'turn' | 'action' | 'result' | 'warn';

type SkillDefinition = {
  id: string;
  name: string;
  kind: SkillKind;
  ratio: number;
  cooldown: number;
  description: string;
  hitCount?: number;
  ignoreResistRate?: number;
  lowHpBonusRate?: number;
  selfHealRate?: number;
  allyHealRate?: number;
  speedDebuff?: number;
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
};

type BattleLogEntry = {
  id: string;
  text: string;
  kind: BattleLogKind;
};

type ManualAction = {
  actorId: string;
  skillId: string;
  targetId: string;
};

type FormationCell = {
  slot: FormationSlot;
  fighter: BattleFighter;
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

const ROLE_SKILLS: Record<SquadMemberRole, SkillDefinition[]> = {
  guard: [
    {
      id: 'guard_shield_bash',
      name: '盾击',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'guard_iron_crash',
      name: '钢铁冲撞',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'guard_counter_wall',
      name: '反击壁垒',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'guard_crushing_roar',
      name: '压制怒吼',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
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
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'mage_arcane_burst',
      name: '奥术爆裂',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'mage_frost_spike',
      name: '霜锥',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'mage_meteor_fall',
      name: '陨星落',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
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
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'support_judgment',
      name: '裁决光束',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'support_holy_pulse',
      name: '圣息脉冲',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 法术伤害。',
    },
    {
      id: 'support_grace_mark',
      name: '恩典刻印',
      kind: 'magic',
      ratio: 2,
      cooldown: 2,
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
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'assassin_shadow_combo',
      name: '影连斩',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'assassin_poison_edge',
      name: '毒刃',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
      description: '造成 200% 物理伤害。',
    },
    {
      id: 'assassin_execute',
      name: '处决',
      kind: 'physical',
      ratio: 2,
      cooldown: 2,
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

let pendingManualResolver: ((action: ManualAction | null) => void) | null = null;
let storyBattlePollTimer: number | null = null;

const selectedAlly = computed(() => fighters.value.find(fighter => fighter.id === selectedAllyId.value && fighter.side === 'ally') ?? null);
const selectedAllySkills = computed(() => {
  if (!selectedAlly.value) {
    return [];
  }
  return ROLE_SKILLS[selectedAlly.value.role];
});
const aliveEnemyFighters = computed(() => fighters.value.filter(fighter => fighter.side === 'enemy' && !fighter.isDead));
const allyTotalHp = computed(() =>
  fighters.value.filter(fighter => fighter.side === 'ally').reduce((total, fighter) => total + fighter.currentHp, 0),
);
const enemyTotalHp = computed(() =>
  fighters.value.filter(fighter => fighter.side === 'enemy').reduce((total, fighter) => total + fighter.currentHp, 0),
);
const enemySlots = computed(() => buildFormationCells('enemy', ENEMY_POSITION));
const allySlots = computed(() => buildFormationCells('ally', ALLY_POSITION));
const allyRosterPreview = computed(() => battleRosterMembers.value.map(member => cloneSquadMember(member)));
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
const canChooseEnemyTarget = computed(() => {
  if (!isRunning.value) {
    return false;
  }
  if (!pendingActorId.value || !selectedAlly.value || !selectedSkillId.value) {
    return false;
  }
  return pendingActorId.value === selectedAlly.value.id;
});
const rosterSyncHint = computed(() => {
  if (isRunning.value) {
    return '本场比赛已锁定触发时的我方属性；战队页后续修改会在下一次剧情比赛触发时生效。';
  }
  return '战队页中的属性会实时同步到这里，剧情变量触发比赛时会按当前值创建我方战斗单位。';
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

function cloneSquadMember(member: SquadMember): SquadMember {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    stats: cloneSquadStats(member.stats),
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
      cooldowns: createCooldowns(role),
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
      cooldowns: createCooldowns(member.role),
    } satisfies BattleFighter;
  });
}

function createCooldowns(role: SquadMemberRole) {
  const cooldowns: Record<string, number> = {};
  ROLE_SKILLS[role].forEach(skill => {
    cooldowns[skill.id] = 0;
  });
  return cooldowns;
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
  roundQueueText.value = '';
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
  currentRound.value = 1;
  winnerText.value = '';
  roundQueueText.value = '';
  battleLogs.value = [];
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
  selectedSkillId.value = null;
  pendingActorId.value = null;
  turnHint.value = `第 ${currentRound.value} 回合进行中。`;
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

  const minSpeed = Math.min(...alive.map(fighter => fighter.stats.speed));
  const ordered = [...alive].sort((left, right) => right.stats.speed - left.stats.speed);
  const normalQueue = ordered.map(fighter => fighter.id);
  const bonusQueue = ordered.filter(fighter => fighter.stats.speed - minSpeed > 100).map(fighter => fighter.id);
  const queue = [...normalQueue, ...bonusQueue];
  roundQueueText.value = `出手顺序：${queue.map(actorId => findFighterById(actorId)?.name ?? actorId).join(' → ')}`;
  return queue;
}

async function handleAllyTurn(actor: BattleFighter, token: number) {
  const available = getAvailableSkills(actor);
  if (available.length === 0) {
    appendLog(`${actor.name} 因技能冷却中，本回合跳过。`, 'warn');
    await sleepStep(battleDelayMs, token);
    return true;
  }

  selectedAllyId.value = actor.id;
  selectedSkillId.value = null;
  pendingActorId.value = actor.id;
  turnHint.value = `轮到 ${actor.name}：请选择技能并点击敌方目标。`;
  appendLog(`轮到 ${actor.name} 行动。`, 'turn');

  const action = await waitForManualAction(actor.id);
  if (!action || token !== battleToken.value || !isRunning.value) {
    return false;
  }

  await executeSkill(action.actorId, action.skillId, action.targetId, token);
  return true;
}

async function handleEnemyTurn(actor: BattleFighter, token: number) {
  const available = getAvailableSkills(actor);
  if (available.length === 0) {
    appendLog(`${actor.name} 因技能冷却中，本回合跳过。`, 'warn');
    await sleepStep(battleDelayMs, token);
    return;
  }

  const targets = fighters.value.filter(fighter => fighter.side === 'ally' && !fighter.isDead);
  if (targets.length === 0) {
    return;
  }

  const target = [...targets].sort((left, right) => left.currentHp - right.currentHp)[0];
  const pickedSkill = pickEnemySkill(actor, available, target);
  turnHint.value = `${actor.name} 正在释放技能…`;
  await executeSkill(actor.id, pickedSkill.id, target.id, token);
}

function getAvailableSkills(actor: BattleFighter) {
  return ROLE_SKILLS[actor.role].filter(skill => getSkillCooldown(actor, skill.id) <= 0);
}

function pickEnemySkill(actor: BattleFighter, available: SkillDefinition[], target: BattleFighter) {
  const scored = available.map(skill => ({
    skill,
    score: estimateSkillDamage(actor, target, skill),
  }));
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.skill ?? available[0];
}

function estimateSkillDamage(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition) {
  const hitCount = skill.hitCount ?? 1;
  let totalDamage = 0;

  for (let index = 0; index < hitCount; index += 1) {
    totalDamage += calculateSingleHitDamage(attacker, target, skill);
  }

  return totalDamage;
}

async function executeSkill(actorId: string, skillId: string, targetId: string, token: number) {
  if (!isRunning.value || token !== battleToken.value) {
    return;
  }

  const attacker = findFighterById(actorId);
  const target = findFighterById(targetId);
  if (!attacker || !target || attacker.isDead || target.isDead) {
    return;
  }

  const skill = ROLE_SKILLS[attacker.role].find(item => item.id === skillId);
  if (!skill) {
    return;
  }
  if (getSkillCooldown(attacker, skill.id) > 0) {
    appendLog(`${attacker.name} 尝试释放 ${skill.name}，但技能仍在冷却。`, 'warn');
    return;
  }

  appendLog(`${attacker.name} 对 ${target.name} 释放「${skill.name}」。`, 'action');
  await sleepStep(battleDelayMs, token);
  if (!isRunning.value || token !== battleToken.value) {
    return;
  }

  const beforeHp = target.currentHp;
  const hitCount = skill.hitCount ?? 1;
  let totalDamage = 0;

  for (let index = 0; index < hitCount; index += 1) {
    if (target.isDead) {
      break;
    }

    const damage = calculateSingleHitDamage(attacker, target, skill);
    totalDamage += damage;
    target.currentHp = Math.max(0, target.currentHp - damage);

    if (target.currentHp <= 0) {
      target.currentHp = 0;
      target.isDead = true;
    }
  }

  attacker.cooldowns[skill.id] = skill.cooldown + 1;
  appendLog(
    `${target.name} 受到 ${totalDamage} 点${skill.kind === 'magic' ? '法术' : '物理'}伤害（${beforeHp} → ${target.currentHp}）。`,
    'action',
  );

  if (skill.lowHpBonusRate && beforeHp / target.stats.hp <= 0.4) {
    appendLog('低生命斩杀加成已生效。', 'info');
  }
  if (skill.speedDebuff && !target.isDead) {
    target.stats.speed = Math.max(1, target.stats.speed - skill.speedDebuff);
    appendLog(`${target.name} 速度下降 ${skill.speedDebuff}。`, 'info');
  }
  if (skill.selfHealRate) {
    const healed = Math.round(attacker.stats.hp * skill.selfHealRate);
    const oldHp = attacker.currentHp;
    attacker.currentHp = Math.min(attacker.stats.hp, attacker.currentHp + healed);
    appendLog(`${attacker.name} 回复生命 ${attacker.currentHp - oldHp}。`, 'info');
  }
  if (skill.allyHealRate) {
    const team = fighters.value.filter(fighter => fighter.side === attacker.side && !fighter.isDead);
    const lowest = [...team].sort((left, right) => left.currentHp / left.stats.hp - right.currentHp / right.stats.hp)[0];
    if (lowest) {
      const healed = Math.round(attacker.stats.magicAttack * skill.allyHealRate);
      const oldHp = lowest.currentHp;
      lowest.currentHp = Math.min(lowest.stats.hp, lowest.currentHp + healed);
      appendLog(`${lowest.name} 因辅助技能回复生命 ${lowest.currentHp - oldHp}。`, 'info');
    }
  }

  if (target.isDead) {
    appendLog(`${target.name} 已被击倒，角色框进入灰暗状态。`, 'result');
  }

  await sleepStep(battleDelayMs, token);
}

function calculateSingleHitDamage(attacker: BattleFighter, target: BattleFighter, skill: SkillDefinition) {
  const attackValue = skill.kind === 'magic' ? attacker.stats.magicAttack : attacker.stats.physicalAttack;
  const targetResist = skill.kind === 'magic' ? target.stats.magicResist : target.stats.physicalResist;
  const effectiveResist = Math.round(targetResist * (1 - (skill.ignoreResistRate ?? 0)));
  let damage = Math.round(attackValue * skill.ratio - effectiveResist);

  if (skill.lowHpBonusRate && target.currentHp / target.stats.hp <= 0.4) {
    damage = Math.round(damage * (1 + skill.lowHpBonusRate));
  }

  return Math.max(1, damage);
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
  if (fighter.side === 'enemy') {
    if (!isRunning.value || fighter.isDead || !canChooseEnemyTarget.value) {
      return;
    }
    onEnemyTargetChosen(fighter.id);
    return;
  }

  selectedAllyId.value = fighter.id;

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

  turnHint.value = '已选择技能，点击敌方目标释放。';
}

function onEnemyTargetChosen(targetId: string) {
  if (!selectedAlly.value || !selectedSkillId.value || !pendingActorId.value) {
    return;
  }
  if (!isRunning.value) {
    return;
  }
  if (pendingActorId.value !== selectedAlly.value.id) {
    return;
  }

  const target = findFighterById(targetId);
  if (!target || target.side !== 'enemy' || target.isDead) {
    return;
  }
  if (getSkillCooldown(selectedAlly.value, selectedSkillId.value) > 0) {
    toastr.warning('技能正在冷却，无法释放。', '战斗场');
    return;
  }

  resolvePendingManualAction({
    actorId: selectedAlly.value.id,
    skillId: selectedSkillId.value,
    targetId,
  });
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
  grid-template-rows: auto auto auto auto 1fr;
  gap: 10px;
}

.battle-toolbar,
.battle-stage,
.roster-panel,
.skill-panel,
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
  grid-template-rows: repeat(3, 124px);
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
  height: 120px;
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
.fighter-speed,
.dead-mark {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.fighter-name {
  font-weight: 700;
}

.fighter-role,
.fighter-speed,
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
    grid-template-rows: repeat(3, 112px);
    gap: 6px;
  }

  .fighter-card {
    height: 108px;
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
}
</style>
