import {
  ChatStoreV2Schema,
  MapSettingsPatchV2Schema,
  type BranchPoint,
  type ChatStoreV2,
  type MapSettingsPatchV2,
  type MapSettingsV2,
  type StateSnapshotV2,
  type WorldStateV2,
} from './model';

export type MessagePageInput = {
  message_id: number;
  role: string;
  is_hidden: boolean;
  swipe_id: number;
  swipes: string[];
  swipes_info?: Record<string, unknown>[];
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(text: string): string {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    fnv ^= code;
    fnv = Math.imul(fnv, 0x01000193);
    djb = Math.imul(djb, 33) ^ code;
  }
  return `${(fnv >>> 0).toString(36)}-${(djb >>> 0).toString(36)}`;
}

const MAP_REPORT_TAGS = ['selyumis_time_v1', 'selyumis_travel_v1', 'selyumis_location_v1'] as const;

function canonicalReportPayload(payload: string): string {
  const trimmed = payload.trim();
  try {
    return canonicalJson(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

function mapReportIdentity(pageText: string): Record<string, string[]> {
  return Object.fromEntries(
    MAP_REPORT_TAGS.map(tag => {
      const matches = [...pageText.matchAll(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'giu'))];
      return [tag, matches.map(match => canonicalReportPayload(match[1] ?? ''))];
    }),
  );
}

export function branchPointFromMessages(messages: readonly MessagePageInput[]): BranchPoint {
  return {
    tokens: messages.map(message => {
      const pageText = message.swipes[message.swipe_id] ?? '';
      const identity = canonicalJson({
        message_id: message.message_id,
        role: message.role,
        hidden: message.is_hidden,
        swipe_id: message.swipe_id,
        map_reports: mapReportIdentity(pageText),
      });
      return `v2:${message.message_id}:${fingerprint(identity)}`;
    }),
    last_message_id: messages.at(-1)?.message_id ?? -1,
  };
}

/** Bounded to the current selected pages. Rechecks exact inputs, including in-place edits. */
export function createMessageBranchReaderV2(
  tokenize: (message: MessagePageInput) => string = message => branchPointFromMessages([message]).tokens[0],
) {
  let scope = '';
  const cached: Array<{ id: number; role: string; hidden: boolean; swipe: number; text: string; token: string }> = [];
  return (messages: readonly MessagePageInput[], identity: string): BranchPoint => {
    if (scope !== identity) {
      cached.length = 0;
      scope = identity;
    }
    const tokens = messages.map((message, index) => {
      const text = message.swipes[message.swipe_id] ?? '';
      const previous = cached[index];
      if (
        previous &&
        previous.id === message.message_id &&
        previous.role === message.role &&
        previous.hidden === message.is_hidden &&
        previous.swipe === message.swipe_id &&
        previous.text === text
      )
        return previous.token;
      const token = tokenize(message);
      cached[index] = {
        id: message.message_id,
        role: message.role,
        hidden: message.is_hidden,
        swipe: message.swipe_id,
        text,
        token,
      };
      return token;
    });
    cached.length = messages.length;
    return { tokens, last_message_id: messages.at(-1)?.message_id ?? -1 };
  };
}

export function replyParentMessagesForGenerationV2(
  messages: readonly MessagePageInput[],
  generationType: string | undefined,
): MessagePageInput[] {
  const lastMessage = messages.at(-1);
  const replacesLatestAssistant = generationType === 'regenerate' || generationType === 'swipe';
  if (replacesLatestAssistant && lastMessage?.role === 'assistant') return messages.slice(0, -1);
  return [...messages];
}

export function replyParentBranchForGenerationV2(
  messages: readonly MessagePageInput[],
  generationType: string | undefined,
): BranchPoint {
  return branchPointFromMessages(replyParentMessagesForGenerationV2(messages, generationType));
}

export function isBranchPrefix(prefix: readonly string[], branch: readonly string[]): boolean {
  return prefix.length <= branch.length && prefix.every((token, index) => token === branch[index]);
}

export function bestSnapshotForBranch(
  history: readonly StateSnapshotV2[],
  branch: BranchPoint,
): StateSnapshotV2 | null {
  let best: StateSnapshotV2 | null = null;
  for (const snapshot of history) {
    if (!isBranchPrefix(snapshot.branch.tokens, branch.tokens)) continue;
    if (!best || snapshot.branch.tokens.length >= best.branch.tokens.length) best = snapshot;
  }
  return best;
}

export function restoreStoreForBranch(
  store: ChatStoreV2,
  branch: BranchPoint,
): { store: ChatStoreV2; changed: boolean } {
  const snapshot = bestSnapshotForBranch(store.history, branch);
  const nextActiveId = snapshot?.snapshot_id ?? null;
  if (store.active_snapshot_id === nextActiveId) return { store, changed: false };
  return {
    store: ChatStoreV2Schema.parse({
      ...store,
      current: snapshot?.state ?? store.baseline,
      active_snapshot_id: nextActiveId,
    }),
    changed: true,
  };
}

export function appendStateSnapshot(
  store: ChatStoreV2,
  branch: BranchPoint,
  state: WorldStateV2,
  snapshotId: string,
  savedAt: string,
  historyLimit = 120,
): ChatStoreV2 {
  const snapshot: StateSnapshotV2 = {
    snapshot_id: snapshotId,
    branch,
    state,
    saved_at: savedAt,
  };
  return ChatStoreV2Schema.parse({
    ...store,
    current: state,
    active_snapshot_id: snapshotId,
    // Realtime ticks on an unchanged leaf share a checkpoint; they must not evict every older floor.
    history: (store.history.at(-1)?.branch.tokens.length === branch.tokens.length &&
    store.history.at(-1)?.branch.tokens.every((token, index) => token === branch.tokens[index]) &&
    store.active_snapshot_id === store.history.at(-1)?.snapshot_id
      ? [...store.history.slice(0, -1), snapshot]
      : [...store.history, snapshot]
    ).slice(-historyLimit),
  });
}

export function settingsPatchFromDefaults(settings: MapSettingsV2, defaults: MapSettingsV2): MapSettingsPatchV2 {
  const patch: Record<string, unknown> = {};
  for (const key of MapSettingsPatchV2Schema.keyof().options) {
    if (JSON.stringify(settings[key]) !== JSON.stringify(defaults[key])) patch[key] = settings[key];
  }
  return MapSettingsPatchV2Schema.parse(patch);
}
