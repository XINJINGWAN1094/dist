export type SquadMemberRole = 'guard' | 'mage' | 'support' | 'assassin';
export type SquadMemberId = 'shen_xixi' | 'li_yenan' | 'bai_zhi' | 'su_su';
export type SquadMemberStatKey =
  | 'physicalAttack'
  | 'magicAttack'
  | 'hp'
  | 'physicalResist'
  | 'magicResist'
  | 'speed';

export type SquadMemberStats = {
  physicalAttack: number;
  magicAttack: number;
  hp: number;
  physicalResist: number;
  magicResist: number;
  speed: number;
};

export type SquadMember = {
  id: SquadMemberId;
  name: string;
  role: SquadMemberRole;
  stats: SquadMemberStats;
};

export type BattleRosterStoredState = {
  version: number;
  members: SquadMember[];
  baseMembers: SquadMember[];
  trainingBonus: Record<SquadMemberId, SquadMemberStats>;
};

export type TrainingChoice = '是' | '否';
export type StoryTrainingCharacterName = '沈汐汐' | '李叶楠' | '白稚' | '苏酥';
export type StoryTrainingCharacterState = {
  今日进行训练: TrainingChoice;
};
export type StoryTrainingState = {
  version: number;
  characters: Record<StoryTrainingCharacterName, StoryTrainingCharacterState>;
  lastProcessedMessageId: number | null;
  lastSyncedAt: string;
};
export type StoryTrainingChoiceMap = Record<StoryTrainingCharacterName, TrainingChoice>;
export type StoryTrainingChoiceByMemberId = Record<SquadMemberId, TrainingChoice>;

export const BATTLE_ROSTER_STORAGE_KEY = 'th_fullscreen_overlay_battle_roster_v1';
export const BATTLE_ROSTER_VERSION = 2;
export const STORY_TRAINING_STATE_KEY = 'story_training_state';
export const STORY_TRAINING_STATE_VERSION = 1;
export const TRAINING_YES: TrainingChoice = '是';
export const TRAINING_NO: TrainingChoice = '否';
export const STORY_TRAINING_FIELD_KEY = '今日进行训练';

export const STORY_TRAINING_CHARACTER_NAMES = ['沈汐汐', '李叶楠', '白稚', '苏酥'] as const satisfies ReadonlyArray<StoryTrainingCharacterName>;
export const SQUAD_MEMBER_IDS = ['shen_xixi', 'li_yenan', 'bai_zhi', 'su_su'] as const satisfies ReadonlyArray<SquadMemberId>;

export const STORY_TRAINING_CHARACTER_NAME_BY_ID: Record<SquadMemberId, StoryTrainingCharacterName> = {
  shen_xixi: '沈汐汐',
  li_yenan: '李叶楠',
  bai_zhi: '白稚',
  su_su: '苏酥',
};

export const STORY_TRAINING_CHARACTER_ID_BY_NAME: Record<StoryTrainingCharacterName, SquadMemberId> = {
  沈汐汐: 'shen_xixi',
  李叶楠: 'li_yenan',
  白稚: 'bai_zhi',
  苏酥: 'su_su',
};

const DEFAULT_ROSTER_TEMPLATE: SquadMember[] = [
  {
    id: 'shen_xixi',
    name: '沈汐汐',
    role: 'mage',
    stats: {
      physicalAttack: 5,
      magicAttack: 10,
      hp: 80,
      physicalResist: 7,
      magicResist: 3,
      speed: 7,
    },
  },
  {
    id: 'li_yenan',
    name: '李叶楠',
    role: 'guard',
    stats: {
      physicalAttack: 103,
      magicAttack: 30,
      hp: 580,
      physicalResist: 81,
      magicResist: 49,
      speed: 37,
    },
  },
  {
    id: 'bai_zhi',
    name: '白稚',
    role: 'assassin',
    stats: {
      physicalAttack: 13,
      magicAttack: 4,
      hp: 120,
      physicalResist: 9,
      magicResist: 4,
      speed: 3,
    },
  },
  {
    id: 'su_su',
    name: '苏酥',
    role: 'support',
    stats: {
      physicalAttack: 4,
      magicAttack: 6,
      hp: 100,
      physicalResist: 5,
      magicResist: 6,
      speed: 7,
    },
  },
];

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.trunc(numberValue);
}

export function cloneSquadMember(member: SquadMember): SquadMember {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    stats: { ...member.stats },
  };
}

export function cloneSquadMembers(members: SquadMember[]): SquadMember[] {
  return members.map(cloneSquadMember);
}

export function createDefaultBattleRosterMembers(): SquadMember[] {
  return cloneSquadMembers(DEFAULT_ROSTER_TEMPLATE);
}

export function createEmptySquadMemberStats(): SquadMemberStats {
  return {
    physicalAttack: 0,
    magicAttack: 0,
    hp: 0,
    physicalResist: 0,
    magicResist: 0,
    speed: 0,
  };
}

function normalizeRole(value: unknown, fallback: SquadMemberRole): SquadMemberRole {
  if (value === 'guard' || value === 'mage' || value === 'support' || value === 'assassin') {
    return value;
  }
  return fallback;
}

export function normalizeBattleRosterStatValue(key: SquadMemberStatKey, value: unknown, fallback: number): number {
  if (key === 'hp') {
    return _.clamp(normalizeInteger(value, fallback), 1, 99_999);
  }
  if (key === 'speed') {
    return _.clamp(normalizeInteger(value, fallback), 1, 9_999);
  }
  return _.clamp(normalizeInteger(value, fallback), 0, 9_999);
}

function normalizeBonusStatValue(key: SquadMemberStatKey, value: unknown, fallback: number): number {
  if (key === 'hp') {
    return _.clamp(normalizeInteger(value, fallback), 0, 999_999);
  }
  return _.clamp(normalizeInteger(value, fallback), 0, 99_999);
}

export function normalizeSquadMemberStats(raw: unknown, fallback: SquadMemberStats): SquadMemberStats {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    physicalAttack: normalizeBattleRosterStatValue('physicalAttack', record.physicalAttack, fallback.physicalAttack),
    magicAttack: normalizeBattleRosterStatValue('magicAttack', record.magicAttack, fallback.magicAttack),
    hp: normalizeBattleRosterStatValue('hp', record.hp, fallback.hp),
    physicalResist: normalizeBattleRosterStatValue('physicalResist', record.physicalResist, fallback.physicalResist),
    magicResist: normalizeBattleRosterStatValue('magicResist', record.magicResist, fallback.magicResist),
    speed: normalizeBattleRosterStatValue('speed', record.speed, fallback.speed),
  };
}

function normalizeTrainingBonusStats(raw: unknown): SquadMemberStats {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    physicalAttack: normalizeBonusStatValue('physicalAttack', record.physicalAttack, 0),
    magicAttack: normalizeBonusStatValue('magicAttack', record.magicAttack, 0),
    hp: normalizeBonusStatValue('hp', record.hp, 0),
    physicalResist: normalizeBonusStatValue('physicalResist', record.physicalResist, 0),
    magicResist: normalizeBonusStatValue('magicResist', record.magicResist, 0),
    speed: normalizeBonusStatValue('speed', record.speed, 0),
  };
}

export function normalizeSquadMember(raw: unknown, fallback: SquadMember): SquadMember {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    id: fallback.id,
    name: normalizeString(record.name).trim() || fallback.name,
    role: normalizeRole(record.role, fallback.role),
    stats: normalizeSquadMemberStats(record.stats, fallback.stats),
  };
}

function normalizeSquadMembersFromUnknown(raw: unknown, fallbackMembers: SquadMember[]): SquadMember[] {
  const rawMembers = Array.isArray(raw) ? raw : [];

  return fallbackMembers.map(fallback => {
    const matched = rawMembers.find(item => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const record = item as Record<string, unknown>;
      return record.id === fallback.id || normalizeString(record.name).trim() === fallback.name;
    });

    return normalizeSquadMember(matched, fallback);
  });
}

export function createEmptyTrainingBonusMap(): Record<SquadMemberId, SquadMemberStats> {
  return {
    shen_xixi: createEmptySquadMemberStats(),
    li_yenan: createEmptySquadMemberStats(),
    bai_zhi: createEmptySquadMemberStats(),
    su_su: createEmptySquadMemberStats(),
  };
}

function normalizeTrainingBonusMap(raw: unknown): Record<SquadMemberId, SquadMemberStats> {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    shen_xixi: normalizeTrainingBonusStats(record.shen_xixi),
    li_yenan: normalizeTrainingBonusStats(record.li_yenan),
    bai_zhi: normalizeTrainingBonusStats(record.bai_zhi),
    su_su: normalizeTrainingBonusStats(record.su_su),
  };
}

export function addSquadMemberStats(base: SquadMemberStats, delta: SquadMemberStats): SquadMemberStats {
  return {
    physicalAttack: normalizeBattleRosterStatValue('physicalAttack', base.physicalAttack + delta.physicalAttack, base.physicalAttack),
    magicAttack: normalizeBattleRosterStatValue('magicAttack', base.magicAttack + delta.magicAttack, base.magicAttack),
    hp: normalizeBattleRosterStatValue('hp', base.hp + delta.hp, base.hp),
    physicalResist: normalizeBattleRosterStatValue(
      'physicalResist',
      base.physicalResist + delta.physicalResist,
      base.physicalResist,
    ),
    magicResist: normalizeBattleRosterStatValue('magicResist', base.magicResist + delta.magicResist, base.magicResist),
    speed: normalizeBattleRosterStatValue('speed', base.speed + delta.speed, base.speed),
  };
}

export function rebuildBattleRosterMembers(
  baseMembers: SquadMember[],
  trainingBonus: Record<SquadMemberId, SquadMemberStats>,
): SquadMember[] {
  return baseMembers.map(baseMember => ({
    ...cloneSquadMember(baseMember),
    stats: addSquadMemberStats(baseMember.stats, trainingBonus[baseMember.id]),
  }));
}

export function cloneBattleRosterStoredState(state: BattleRosterStoredState): BattleRosterStoredState {
  return {
    version: state.version,
    members: cloneSquadMembers(state.members),
    baseMembers: cloneSquadMembers(state.baseMembers),
    trainingBonus: {
      shen_xixi: { ...state.trainingBonus.shen_xixi },
      li_yenan: { ...state.trainingBonus.li_yenan },
      bai_zhi: { ...state.trainingBonus.bai_zhi },
      su_su: { ...state.trainingBonus.su_su },
    },
  };
}

export function resetBattleRosterTrainingBonus(state: BattleRosterStoredState): BattleRosterStoredState {
  const nextState = cloneBattleRosterStoredState(state);
  nextState.version = BATTLE_ROSTER_VERSION;
  nextState.trainingBonus = createEmptyTrainingBonusMap();
  nextState.members = rebuildBattleRosterMembers(nextState.baseMembers, nextState.trainingBonus);
  return nextState;
}

export function createDefaultBattleRosterStoredState(): BattleRosterStoredState {
  const baseMembers = createDefaultBattleRosterMembers();
  const trainingBonus = createEmptyTrainingBonusMap();

  return {
    version: BATTLE_ROSTER_VERSION,
    baseMembers,
    trainingBonus,
    members: rebuildBattleRosterMembers(baseMembers, trainingBonus),
  };
}

export function normalizeBattleRosterStoredState(raw: unknown): BattleRosterStoredState {
  const defaults = createDefaultBattleRosterStoredState();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const rawBaseMembers = record.baseMembers ?? record.base_members ?? record.members;
  const baseMembers = normalizeSquadMembersFromUnknown(rawBaseMembers, defaults.baseMembers);
  const trainingBonus = normalizeTrainingBonusMap(record.trainingBonus ?? record.training_bonus);

  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version)
        ? Math.floor(record.version)
        : BATTLE_ROSTER_VERSION,
    baseMembers,
    trainingBonus,
    members: rebuildBattleRosterMembers(baseMembers, trainingBonus),
  };
}

export function setBattleRosterDisplayedStat(
  state: BattleRosterStoredState,
  memberId: SquadMemberId,
  statKey: SquadMemberStatKey,
  value: unknown,
): BattleRosterStoredState {
  const nextState = cloneBattleRosterStoredState(state);
  const baseMember = nextState.baseMembers.find(item => item.id === memberId);
  const displayedMember = nextState.members.find(item => item.id === memberId);
  if (!baseMember || !displayedMember) {
    return nextState;
  }

  const currentDisplayedValue = displayedMember.stats[statKey];
  const desiredDisplayedValue = normalizeBattleRosterStatValue(statKey, value, currentDisplayedValue);
  const trainingBonusValue = nextState.trainingBonus[memberId][statKey];
  const minimumBaseValue = statKey === 'hp' || statKey === 'speed' ? 1 : 0;

  baseMember.stats[statKey] = normalizeBattleRosterStatValue(
    statKey,
    Math.max(minimumBaseValue, desiredDisplayedValue - trainingBonusValue),
    baseMember.stats[statKey],
  );

  nextState.members = rebuildBattleRosterMembers(nextState.baseMembers, nextState.trainingBonus);
  return nextState;
}

export function createDefaultStoryTrainingState(): StoryTrainingState {
  return {
    version: STORY_TRAINING_STATE_VERSION,
    characters: {
      沈汐汐: { 今日进行训练: TRAINING_NO },
      李叶楠: { 今日进行训练: TRAINING_NO },
      白稚: { 今日进行训练: TRAINING_NO },
      苏酥: { 今日进行训练: TRAINING_NO },
    },
    lastProcessedMessageId: null,
    lastSyncedAt: '',
  };
}

export function normalizeTrainingChoice(value: unknown, fallback: TrainingChoice = TRAINING_NO): TrainingChoice {
  if (value === TRAINING_YES || value === TRAINING_NO) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? TRAINING_YES : TRAINING_NO;
  }
  if (typeof value === 'number') {
    return value !== 0 ? TRAINING_YES : TRAINING_NO;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['是', 'yes', 'true', '1', 'on'].includes(normalized)) {
      return TRAINING_YES;
    }
    if (['否', 'no', 'false', '0', 'off', ''].includes(normalized)) {
      return TRAINING_NO;
    }
  }
  return fallback;
}

export function normalizeStoryTrainingChoices(raw: unknown): StoryTrainingChoiceMap {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    沈汐汐: normalizeTrainingChoice(record.沈汐汐, TRAINING_NO),
    李叶楠: normalizeTrainingChoice(record.李叶楠, TRAINING_NO),
    白稚: normalizeTrainingChoice(record.白稚, TRAINING_NO),
    苏酥: normalizeTrainingChoice(record.苏酥, TRAINING_NO),
  };
}

export function normalizeStoryTrainingState(raw: unknown): StoryTrainingState {
  const defaults = createDefaultStoryTrainingState();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const characterRecord =
    record.characters && typeof record.characters === 'object'
      ? (record.characters as Record<string, unknown>)
      : (record as Record<string, unknown>);

  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version)
        ? Math.floor(record.version)
        : STORY_TRAINING_STATE_VERSION,
    characters: {
      沈汐汐: {
        今日进行训练: normalizeTrainingChoice(
          _.get(characterRecord, ['沈汐汐', STORY_TRAINING_FIELD_KEY], _.get(characterRecord, '沈汐汐')),
          defaults.characters.沈汐汐.今日进行训练,
        ),
      },
      李叶楠: {
        今日进行训练: normalizeTrainingChoice(
          _.get(characterRecord, ['李叶楠', STORY_TRAINING_FIELD_KEY], _.get(characterRecord, '李叶楠')),
          defaults.characters.李叶楠.今日进行训练,
        ),
      },
      白稚: {
        今日进行训练: normalizeTrainingChoice(
          _.get(characterRecord, ['白稚', STORY_TRAINING_FIELD_KEY], _.get(characterRecord, '白稚')),
          defaults.characters.白稚.今日进行训练,
        ),
      },
      苏酥: {
        今日进行训练: normalizeTrainingChoice(
          _.get(characterRecord, ['苏酥', STORY_TRAINING_FIELD_KEY], _.get(characterRecord, '苏酥')),
          defaults.characters.苏酥.今日进行训练,
        ),
      },
    },
    lastProcessedMessageId:
      typeof record.lastProcessedMessageId === 'number' && Number.isFinite(record.lastProcessedMessageId)
        ? Math.trunc(record.lastProcessedMessageId)
        : typeof record.last_processed_message_id === 'number' && Number.isFinite(record.last_processed_message_id)
          ? Math.trunc(record.last_processed_message_id)
          : null,
    lastSyncedAt: normalizeString(record.lastSyncedAt, normalizeString(record.last_synced_at)).trim(),
  };
}

export function mergeStoryTrainingState(
  current: StoryTrainingState,
  nextChoices: StoryTrainingChoiceMap,
  messageId: number | null,
  syncedAt: string,
): StoryTrainingState {
  return {
    version: STORY_TRAINING_STATE_VERSION,
    characters: {
      沈汐汐: {
        今日进行训练:
          current.characters.沈汐汐.今日进行训练 === TRAINING_YES || nextChoices.沈汐汐 === TRAINING_YES ? TRAINING_YES : TRAINING_NO,
      },
      李叶楠: {
        今日进行训练:
          current.characters.李叶楠.今日进行训练 === TRAINING_YES || nextChoices.李叶楠 === TRAINING_YES ? TRAINING_YES : TRAINING_NO,
      },
      白稚: {
        今日进行训练:
          current.characters.白稚.今日进行训练 === TRAINING_YES || nextChoices.白稚 === TRAINING_YES ? TRAINING_YES : TRAINING_NO,
      },
      苏酥: {
        今日进行训练:
          current.characters.苏酥.今日进行训练 === TRAINING_YES || nextChoices.苏酥 === TRAINING_YES ? TRAINING_YES : TRAINING_NO,
      },
    },
    lastProcessedMessageId: messageId,
    lastSyncedAt: syncedAt,
  };
}

export function resetStoryTrainingState(messageId: number | null, syncedAt: string): StoryTrainingState {
  return {
    ...createDefaultStoryTrainingState(),
    lastProcessedMessageId: messageId,
    lastSyncedAt: syncedAt,
  };
}

export function storyTrainingStateToChoiceByMemberId(state: StoryTrainingState): StoryTrainingChoiceByMemberId {
  return {
    shen_xixi: state.characters.沈汐汐.今日进行训练,
    li_yenan: state.characters.李叶楠.今日进行训练,
    bai_zhi: state.characters.白稚.今日进行训练,
    su_su: state.characters.苏酥.今日进行训练,
  };
}

export function createAllTrainedChoiceByMemberId(): StoryTrainingChoiceByMemberId {
  return {
    shen_xixi: TRAINING_YES,
    li_yenan: TRAINING_YES,
    bai_zhi: TRAINING_YES,
    su_su: TRAINING_YES,
  };
}

function chance(rate: number, random: () => number): boolean {
  return random() < rate;
}

export function createDailyTrainingDelta(memberId: SquadMemberId, random: () => number = Math.random): SquadMemberStats {
  const delta: SquadMemberStats = {
    physicalAttack: 2,
    magicAttack: 2,
    hp: 5,
    physicalResist: 1,
    magicResist: 1,
    speed: 1,
  };

  if (memberId === 'bai_zhi' && chance(0.5, random)) {
    delta.physicalAttack += 1;
    delta.speed += 1;
  }

  if (memberId === 'li_yenan' && chance(0.3, random)) {
    delta.physicalResist += 1;
    delta.magicResist += 1;
  }

  if (memberId === 'shen_xixi' && chance(0.6, random)) {
    delta.magicAttack += 2;
  }

  return delta;
}

function addTrainingBonus(
  trainingBonus: Record<SquadMemberId, SquadMemberStats>,
  memberId: SquadMemberId,
  delta: SquadMemberStats,
) {
  trainingBonus[memberId] = {
    physicalAttack: trainingBonus[memberId].physicalAttack + delta.physicalAttack,
    magicAttack: trainingBonus[memberId].magicAttack + delta.magicAttack,
    hp: trainingBonus[memberId].hp + delta.hp,
    physicalResist: trainingBonus[memberId].physicalResist + delta.physicalResist,
    magicResist: trainingBonus[memberId].magicResist + delta.magicResist,
    speed: trainingBonus[memberId].speed + delta.speed,
  };
}

export function applyTrainingSettlementToBattleRoster(
  state: BattleRosterStoredState,
  trainingChoices: StoryTrainingChoiceByMemberId,
  settlementDays: number,
  random: () => number = Math.random,
): BattleRosterStoredState {
  if (settlementDays <= 0) {
    return cloneBattleRosterStoredState(state);
  }

  const nextState = cloneBattleRosterStoredState(state);
  const effectiveChoices = settlementDays > 1 ? createAllTrainedChoiceByMemberId() : trainingChoices;

  for (let day = 0; day < settlementDays; day += 1) {
    for (const memberId of SQUAD_MEMBER_IDS) {
      if (effectiveChoices[memberId] !== TRAINING_YES) {
        continue;
      }
      addTrainingBonus(nextState.trainingBonus, memberId, createDailyTrainingDelta(memberId, random));
    }
  }

  nextState.members = rebuildBattleRosterMembers(nextState.baseMembers, nextState.trainingBonus);
  return nextState;
}
