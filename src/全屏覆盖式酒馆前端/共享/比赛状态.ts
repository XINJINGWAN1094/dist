export type StoryBattleStatus = '比赛中' | '非比赛';

export type StoryBattleState = {
  version: number;
  status: StoryBattleStatus;
  sessionId: string;
  lastProcessedMessageId: number | null;
  reason: string;
  confidence: number;
  lastSyncedAt: string;
};

export const STORY_BATTLE_STATE_KEY = 'story_battle_state';
export const STORY_BATTLE_STATE_VERSION = 1;
export const STORY_BATTLE_ACTIVE: StoryBattleStatus = '比赛中';
export const STORY_BATTLE_INACTIVE: StoryBattleStatus = '非比赛';

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

function normalizeNullableInteger(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return Math.trunc(numberValue);
}

function normalizeConfidence(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }
  return _.clamp(numberValue, 0, 1);
}

export function normalizeStoryBattleStatus(value: unknown, fallback: StoryBattleStatus = STORY_BATTLE_INACTIVE): StoryBattleStatus {
  if (value === STORY_BATTLE_ACTIVE || value === STORY_BATTLE_INACTIVE) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? STORY_BATTLE_ACTIVE : STORY_BATTLE_INACTIVE;
  }
  if (typeof value === 'number') {
    return value !== 0 ? STORY_BATTLE_ACTIVE : STORY_BATTLE_INACTIVE;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['比赛中', '比赛', '战斗中', '战斗', 'active', 'competition', 'match', 'battle', 'true', '1', 'on'].includes(normalized)) {
      return STORY_BATTLE_ACTIVE;
    }
    if (['非比赛', '未比赛', '无比赛', '非战斗', '结束', 'inactive', 'idle', 'none', 'false', '0', 'off', ''].includes(normalized)) {
      return STORY_BATTLE_INACTIVE;
    }
  }
  return fallback;
}

export function createDefaultStoryBattleState(): StoryBattleState {
  return {
    version: STORY_BATTLE_STATE_VERSION,
    status: STORY_BATTLE_INACTIVE,
    sessionId: '',
    lastProcessedMessageId: null,
    reason: '',
    confidence: 0,
    lastSyncedAt: '',
  };
}

export function normalizeStoryBattleState(raw: unknown): StoryBattleState {
  const defaults = createDefaultStoryBattleState();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const record = raw as Record<string, unknown>;
  const lastProcessedMessageId = normalizeNullableInteger(record.lastProcessedMessageId ?? record.last_processed_message_id);

  return {
    version: normalizeInteger(record.version, STORY_BATTLE_STATE_VERSION),
    status: normalizeStoryBattleStatus(record.status ?? record.battle_status, defaults.status),
    sessionId: normalizeString(record.sessionId, normalizeString(record.session_id)).trim(),
    lastProcessedMessageId,
    reason: normalizeString(record.reason).trim(),
    confidence: normalizeConfidence(record.confidence),
    lastSyncedAt: normalizeString(record.lastSyncedAt, normalizeString(record.last_synced_at)).trim(),
  };
}

export function isStoryBattleActive(state: StoryBattleState): boolean {
  return state.status === STORY_BATTLE_ACTIVE;
}
