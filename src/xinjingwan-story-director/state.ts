import {
  CHAT_STATE_KEY,
  type OutlinePage,
  type OutlineProgressReport,
  type StateListener,
  type StoryDirectorMode,
  type StoryDirectorState,
  type TimedActiveRange,
  type UiTab,
} from './types';

const DEFAULT_STATUS = {
  reason: '初始化',
  activeMode: null,
  targetWorldbookName: null,
  changedEntries: 0,
  runtimePromptInjected: false,
  warnings: [],
  outlineCurrentNode: 1,
  outlineMvuAvailable: false,
  timedCompletedReplyCount: 0,
  timedNextReplyIndex: 1,
  lastSyncedAt: '',
} satisfies StoryDirectorState['status'];

const listeners = new Set<StateListener>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function coerceInteger(value: unknown, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(numberValue), min), max);
}

function coerceNullableInteger(value: unknown, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  if (value == null || value === '') {
    return null;
  }
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return Math.min(Math.max(Math.trunc(numberValue), min), max);
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isMode(value: unknown): value is StoryDirectorMode {
  return value === 'outline' || value === 'endingReference' || value === 'timedEnding';
}

function normalizeTab(value: unknown): UiTab {
  return isMode(value) ? value : 'outline';
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultPage(): OutlinePage {
  return {
    id: createId('outline-page'),
    nodes: [''],
    completed: false,
    lastKnownNode: 1,
  };
}

export function createOutlineProgressReport(
  runId: string | null = null,
  currentNode = 1,
): OutlineProgressReport {
  return {
    runId,
    currentNode,
    nextNode: currentNode,
    completedNode: null,
    completed: false,
    status: '',
    confidence: '',
    messageId: null,
    updatedAt: '',
  };
}

function normalizePage(value: unknown): OutlinePage | null {
  if (!isRecord(value)) {
    return null;
  }

  const nodes = Array.isArray(value.nodes)
    ? value.nodes.map(node => coerceString(node)).filter((_, index) => index < 100)
    : [''];

  return {
    id: coerceString(value.id).trim() || createId('outline-page'),
    nodes: nodes.length > 0 ? nodes : [''],
    completed: coerceBoolean(value.completed, false),
    lastKnownNode: coerceInteger(value.lastKnownNode, 1, 1),
  };
}

function normalizeOutlineProgress(
  value: unknown,
  fallbackRunId: string | null,
  fallbackCurrentNode: number,
): OutlineProgressReport {
  if (!isRecord(value)) {
    return createOutlineProgressReport(fallbackRunId, fallbackCurrentNode);
  }

  const currentNode = coerceInteger(value.currentNode, fallbackCurrentNode, 1, 1000);
  const nextNode = coerceInteger(value.nextNode, currentNode, 1, 1000);
  return {
    runId: coerceString(value.runId).trim() || fallbackRunId,
    currentNode,
    nextNode,
    completedNode: coerceNullableInteger(value.completedNode, 1, 1000),
    completed: coerceBoolean(value.completed, false),
    status: coerceString(value.status).trim().slice(0, 500),
    confidence: coerceString(value.confidence).trim().slice(0, 80),
    messageId: coerceNullableInteger(value.messageId, 0),
    updatedAt: coerceString(value.updatedAt).trim(),
  };
}

function normalizeRanges(value: unknown): TimedActiveRange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(range => {
      if (!isRecord(range)) {
        return null;
      }
      const startMessageId = coerceInteger(range.startMessageId, 0, 0);
      const rawEnd = range.endMessageId;
      const endMessageId = rawEnd == null || rawEnd === '' ? null : coerceInteger(rawEnd, startMessageId, 0);
      return { startMessageId, endMessageId };
    })
    .filter((range): range is TimedActiveRange => range !== null)
    .slice(-100);
}

export function normalizeState(value: unknown): StoryDirectorState {
  const record = isRecord(value) ? value : {};
  const outlineRecord = isRecord(record.outline) ? record.outline : {};
  const rawPages = Array.isArray(outlineRecord.pages) ? outlineRecord.pages : [];
  const pages = rawPages.map(normalizePage).filter((page): page is OutlinePage => page !== null);
  if (pages.length === 0) {
    pages.push(createDefaultPage());
  }

  const selectedPageId = pages.some(page => page.id === outlineRecord.selectedPageId)
    ? String(outlineRecord.selectedPageId)
    : pages[0].id;
  const enabledPageId = pages.some(page => page.id === outlineRecord.enabledPageId)
    ? String(outlineRecord.enabledPageId)
    : null;
  const enabledPage = enabledPageId ? pages.find(page => page.id === enabledPageId) : null;
  const progressRecord = isRecord(outlineRecord.progress) ? outlineRecord.progress : {};
  const outlineRunId = coerceString(outlineRecord.runId).trim() || coerceString(progressRecord.runId).trim() || null;
  const outlineProgress = normalizeOutlineProgress(
    progressRecord,
    outlineRunId,
    enabledPage?.lastKnownNode ?? 1,
  );

  const endingRecord = isRecord(record.endingReference) ? record.endingReference : {};
  const timedRecord = isRecord(record.timedEnding) ? record.timedEnding : {};
  const uiRecord = isRecord(record.ui) ? record.ui : {};
  const statusRecord = isRecord(record.status) ? record.status : {};
  const activeMode = isMode(record.activeMode) ? record.activeMode : null;
  const targetWorldbookName = coerceString(record.targetWorldbookName).trim() || null;

  return {
    version: 1,
    activeMode,
    targetWorldbookName,
    ui: {
      visible: coerceBoolean(uiRecord.visible, false),
      tab: normalizeTab(uiRecord.tab),
    },
    outline: {
      pages,
      selectedPageId,
      enabledPageId,
      runId: outlineRunId,
      progress: outlineProgress,
    },
    endingReference: {
      text: coerceString(endingRecord.text),
      enabled: coerceBoolean(endingRecord.enabled, activeMode === 'endingReference'),
    },
    timedEnding: {
      goalText: coerceString(timedRecord.goalText),
      targetReplyIndex: coerceInteger(timedRecord.targetReplyIndex, 5, 1, 999),
      active: coerceBoolean(timedRecord.active, activeMode === 'timedEnding'),
      sessionId: coerceString(timedRecord.sessionId).trim() || null,
      sessionSerial: coerceInteger(timedRecord.sessionSerial, 0, 0, 999),
      ranges: normalizeRanges(timedRecord.ranges),
      completedReplyCount: coerceInteger(timedRecord.completedReplyCount, 0, 0),
      nextReplyIndex: coerceInteger(timedRecord.nextReplyIndex, 1, 1),
    },
    status: {
      reason: coerceString(statusRecord.reason) || DEFAULT_STATUS.reason,
      activeMode: isMode(statusRecord.activeMode) ? statusRecord.activeMode : activeMode,
      targetWorldbookName: coerceString(statusRecord.targetWorldbookName).trim() || targetWorldbookName,
      changedEntries: coerceInteger(statusRecord.changedEntries, 0, 0),
      runtimePromptInjected: coerceBoolean(statusRecord.runtimePromptInjected, false),
      warnings: Array.isArray(statusRecord.warnings) ? statusRecord.warnings.map(coerceString).filter(Boolean) : [],
      outlineCurrentNode: coerceInteger(statusRecord.outlineCurrentNode, 1, 1),
      outlineMvuAvailable: coerceBoolean(statusRecord.outlineMvuAvailable, false),
      timedCompletedReplyCount: coerceInteger(statusRecord.timedCompletedReplyCount, 0, 0),
      timedNextReplyIndex: coerceInteger(statusRecord.timedNextReplyIndex, 1, 1),
      lastSyncedAt: coerceString(statusRecord.lastSyncedAt),
    },
  };
}

export function readState(persist = false): StoryDirectorState {
  const variables = getVariables({ type: 'chat' });
  const rawState = variables[CHAT_STATE_KEY];
  const state = normalizeState(rawState);

  if (persist && !_.isEqual(rawState, state)) {
    updateVariablesWith(nextVariables => _.set(nextVariables, CHAT_STATE_KEY, state), { type: 'chat' });
  }

  return state;
}

export function writeState(state: StoryDirectorState, notify = true): StoryDirectorState {
  const normalized = normalizeState(state);
  updateVariablesWith(variables => _.set(variables, CHAT_STATE_KEY, normalized), { type: 'chat' });
  if (notify) {
    emitStateChanged(normalized);
  }
  return normalized;
}

export function patchState(mutator: (state: StoryDirectorState) => void, notify = true): StoryDirectorState {
  const state = _.cloneDeep(readState(true));
  mutator(state);
  return writeState(state, notify);
}

export function onStateChanged(listener: StateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitStateChanged(state = readState(false)) {
  for (const listener of listeners) {
    listener(state);
  }
}

export function getSelectedOutlinePage(state: StoryDirectorState): OutlinePage {
  return state.outline.pages.find(page => page.id === state.outline.selectedPageId) ?? state.outline.pages[0];
}

export function getEnabledOutlinePage(state: StoryDirectorState): OutlinePage | null {
  if (!state.outline.enabledPageId) {
    return null;
  }
  return state.outline.pages.find(page => page.id === state.outline.enabledPageId) ?? null;
}

export function getNonEmptyNodes(page: OutlinePage): string[] {
  return page.nodes.map(node => node.trim()).filter(Boolean);
}

export function addOutlinePage(): StoryDirectorState {
  return patchState(state => {
    const page = createDefaultPage();
    state.outline.pages.push(page);
    state.outline.selectedPageId = page.id;
    state.ui.tab = 'outline';
  });
}
