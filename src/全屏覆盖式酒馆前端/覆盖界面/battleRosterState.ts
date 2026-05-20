import { ref } from 'vue';
import {
  BATTLE_ROSTER_STORAGE_KEY,
  cloneBattleRosterStoredState,
  cloneSquadMembers,
  createDefaultBattleRosterStoredState,
  normalizeBattleRosterStoredState,
  setBattleRosterDisplayedStat,
  type BattleRosterStoredState,
  type SquadMember,
  type SquadMemberId,
  type SquadMemberRole,
  type SquadMemberStatKey,
  type SquadMemberStats,
} from '../共享/训练结算';

export type { SquadMember, SquadMemberId, SquadMemberRole, SquadMemberStatKey, SquadMemberStats };

type HostRuntime = Window &
  typeof globalThis & {
    eventOn?: (eventType: string, listener: (...args: any[]) => void) => EventOnReturn;
    tavern_events?: Partial<Record<'CHAT_CHANGED', string>>;
  };

const FALLBACK_CHAT_CHANGED_EVENT = 'chat_id_changed';

let battleRosterStoredState: BattleRosterStoredState = createDefaultBattleRosterStoredState();

export const battleRosterMembers = ref<SquadMember[]>(cloneSquadMembers(battleRosterStoredState.members));
export const battleRosterLoaded = ref(false);

let hasAttachedChatChangedListener = false;
const persistBattleRosterDebounced = _.debounce(() => {
  persistBattleRosterToVariables();
}, 80);

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
  return withTavernHelper('读取战队聊天变量', {}, helper => helper.getVariables({ type: 'chat' }));
}

function syncBattleRosterMembersRef() {
  battleRosterMembers.value = cloneSquadMembers(battleRosterStoredState.members);
}

function loadBattleRosterFromVariables() {
  const variables = readChatVariables();
  const stored = _.get(variables, BATTLE_ROSTER_STORAGE_KEY);
  battleRosterStoredState = normalizeBattleRosterStoredState(stored);
  syncBattleRosterMembersRef();
  battleRosterLoaded.value = true;
}

function persistBattleRosterToVariables() {
  const variables = readChatVariables();
  _.set(variables, BATTLE_ROSTER_STORAGE_KEY, cloneBattleRosterStoredState(battleRosterStoredState));

  void withTavernHelper('写入战队聊天变量', false, helper => {
    helper.replaceVariables(variables, { type: 'chat' });
    return true;
  });
}

function ensureChatChangedListener() {
  if (hasAttachedChatChangedListener) {
    return;
  }

  const runtime = resolveHostRuntime();
  if (!runtime?.eventOn) {
    return;
  }

  const eventName = runtime.tavern_events?.CHAT_CHANGED || FALLBACK_CHAT_CHANGED_EVENT;
  runtime.eventOn(eventName, () => {
    loadBattleRosterFromVariables();
  });
  hasAttachedChatChangedListener = true;
}

export function ensureBattleRosterLoaded() {
  if (!battleRosterLoaded.value) {
    loadBattleRosterFromVariables();
  }
  ensureChatChangedListener();
}

export function getBattleRosterStoredStateSnapshot(): BattleRosterStoredState {
  ensureBattleRosterLoaded();
  return cloneBattleRosterStoredState(battleRosterStoredState);
}

export function getRoleLabel(role: SquadMemberRole): string {
  if (role === 'guard') {
    return '战士';
  }
  if (role === 'mage') {
    return '法师';
  }
  if (role === 'support') {
    return '辅助';
  }
  return '刺客';
}

export function resetBattleRosterToDefaults() {
  battleRosterStoredState = createDefaultBattleRosterStoredState();
  syncBattleRosterMembersRef();
  persistBattleRosterDebounced();
}

export function updateBattleRosterStat(memberId: SquadMemberId, statKey: SquadMemberStatKey, value: unknown) {
  ensureBattleRosterLoaded();
  battleRosterStoredState = setBattleRosterDisplayedStat(battleRosterStoredState, memberId, statKey, value);
  syncBattleRosterMembersRef();
  persistBattleRosterDebounced();
}
