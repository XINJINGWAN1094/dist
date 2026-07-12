import {
  ENTRY_SOURCE,
  type OutlineProgressReport,
  type StoryDirectorMode,
  type StoryDirectorState,
  type TimedActiveRange,
} from './types';
import {
  createOutlineProgressReport,
  getEnabledOutlinePage,
  getNonEmptyNodes,
  normalizeState,
  patchState,
  readState,
  writeState,
} from './state';

const SYNC_DELAYS_MS = [250, 1_500, 4_000, 9_000] as const;
const TIMED_COUNTER_EXTRA_KEY = 'xinjingwan_end_counter';
const OUTLINE_STATE_EXTRA_KEY = 'xinjingwan_outline_state';
const OUTLINE_STATE_TAG = 'XJWSD_STATE';
export const RUNTIME_PROMPT_ID = 'xinjingwan-story-director-runtime';

const LEGACY_RUNTIME_ENTRY_NAMES = new Set([
  '[XINJINGWAN-2026] 大纲内容',
  '[XINJINGWAN-2026] 大纲准则',
  '[XINJINGWAN-2026] 大纲状态协议',
  '[XINJINGWAN-2026] 结局参考',
  '[XINJINGWAN-2026] 限时结局',
]);

const LEGACY_RUNTIME_ENTRY_TYPES = new Set([
  'outlineContent',
  'outlineRule',
  'outlineProgress',
  'endingReference',
  'timedEnding',
]);

const LEGACY_RUNTIME_CONTENT_MARKERS = [
  '<XINJINGWAN-2026-大纲状态>',
  '<XINJINGWAN-2026-大纲>',
  '<XJWSD_STATE>',
  '大纲运行ID：XJW_OUTLINE_2026-',
  '每次回复末尾必须输出一次脚本状态块',
  '<XINJINGWAN-2026-结局参考>',
  '<XINJINGWAN-2026-限时结局>',
];

let syncRunning = false;
let queuedManual = false;
let queuedReason = '';
let debounceTimer: number | null = null;
let syncTimers: number[] = [];
let syncContextRevision = 0;
const ignoredOutlineStateWarnings = new Set<string>();

type SyncContext = {
  chatId: string;
  revision: number;
};

class StaleSyncError extends Error {
  constructor() {
    super('当前聊天已切换，本次旧聊天同步已跳过。');
    this.name = 'StaleSyncError';
  }
}

function getCurrentChatIdSafely() {
  try {
    return SillyTavern.getCurrentChatId();
  } catch {
    return '';
  }
}

function captureSyncContext(): SyncContext {
  return {
    chatId: getCurrentChatIdSafely(),
    revision: syncContextRevision,
  };
}

function isCurrentSyncContext(context: SyncContext) {
  return context.chatId === getCurrentChatIdSafely() && context.revision === syncContextRevision;
}

function throwIfStale(context: SyncContext) {
  if (!isCurrentSyncContext(context)) {
    throw new StaleSyncError();
  }
}

function clearPendingSyncTimers() {
  if (debounceTimer != null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  syncTimers.forEach(timer => window.clearTimeout(timer));
  syncTimers = [];
}

export function resetSyncContextForCurrentChat() {
  syncContextRevision += 1;
  queuedManual = false;
  queuedReason = '';
  clearPendingSyncTimers();
}

function nowIsoString() {
  return new Date().toISOString();
}

function trimBlock(text: string) {
  return text.trim().replace(/\n{3,}/g, '\n\n');
}

function createOutlineStateBlockPattern() {
  return new RegExp(`<${OUTLINE_STATE_TAG}>\\s*([\\s\\S]*?)\\s*</${OUTLINE_STATE_TAG}>`, 'gi');
}

function createOutlineRunId() {
  return `XJW_OUTLINE_2026-${localDateStamp()}-${Date.now().toString(36)}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return !!value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function coerceString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getOutlineCurrentNode(state: StoryDirectorState) {
  return Math.max(1, Math.trunc(state.outline.progress.nextNode || 1));
}

function getOutlineCompletedNodesLabel(currentNode: number) {
  return currentNode > 1 ? `节点1~节点${currentNode - 1}` : '无';
}

function normalizeJsonPayload(payload: string) {
  return payload
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseOutlineProgressPayload(
  payload: string,
  state: StoryDirectorState,
  messageId: number,
): OutlineProgressReport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonPayload(payload));
  } catch {
    return null;
  }

  const record = toRecord(parsed);
  if (!record) {
    return null;
  }

  const runId = coerceString(record.runId).trim();
  if (!state.outline.runId || runId !== state.outline.runId) {
    return null;
  }

  const page = getEnabledOutlinePage(state);
  const totalNodes = page ? getNonEmptyNodes(page).length : 0;
  const maxNode = Math.max(totalNodes + 1, 1);
  const previousNode = getOutlineCurrentNode(state);
  const currentNode = coerceInteger(record.currentNode, previousNode, 1, maxNode);
  const completed = typeof record.completed === 'boolean'
    ? record.completed
    : coerceString(record.nodeStatus).toLowerCase() === 'complete';
  const nextNodeFallback = completed ? currentNode + 1 : currentNode;
  const nextNode = coerceInteger(record.nextNode, nextNodeFallback, 1, maxNode);
  const completedNode = coerceNullableInteger(record.completedNode, 1, maxNode)
    ?? (nextNode > currentNode ? currentNode : null);
  const status = (
    coerceString(record.status) ||
    coerceString(record.summary) ||
    coerceString(record.reason)
  ).trim().slice(0, 500);
  const confidence = (
    coerceString(record.confidence) ||
    coerceString(record.nodeStatus) ||
    (nextNode > currentNode ? 'complete' : 'partial')
  ).trim().slice(0, 80);

  return {
    runId,
    currentNode,
    nextNode,
    completedNode,
    completed: completed || nextNode > currentNode,
    status,
    confidence,
    messageId,
    updatedAt: nowIsoString(),
  };
}

function stripMessageRanges(message: string, ranges: Array<{ start: number; end: number }>) {
  if (ranges.length === 0) {
    return message;
  }

  let nextMessage = '';
  let cursor = 0;
  for (const range of ranges) {
    nextMessage += message.slice(cursor, range.start);
    cursor = range.end;
  }
  nextMessage += message.slice(cursor);
  return nextMessage
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function warnIgnoredOutlineStateBlock(messageId: number, payload: string) {
  const normalized = normalizeJsonPayload(payload);
  const looksLikeBody = normalized.length > 1200 || /\n\s*\n/.test(normalized);
  const reason = looksLikeBody ? '状态块可能包入了正文，已保留原文。' : '状态块无法解析或 runId 不匹配，已保留原文。';
  const warningKey = `${messageId}:${reason}:${normalized.slice(0, 120)}`;
  const warning = `第${messageId}楼${reason}`;
  if (!ignoredOutlineStateWarnings.has(warningKey)) {
    ignoredOutlineStateWarnings.add(warningKey);
    if (ignoredOutlineStateWarnings.size > 200) {
      ignoredOutlineStateWarnings.clear();
    }
    console.warn(`[xinjingwan-story-director] ignored outline state block in message ${messageId}: ${reason}`);
  }
  return warning;
}

function collectValidOutlineStateBlocks(
  message: string,
  state: StoryDirectorState,
  messageId: number,
  warnings: string[],
) {
  const pattern = createOutlineStateBlockPattern();
  const validBlocks: Array<{ start: number; end: number; progress: OutlineProgressReport }> = [];
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(message)) != null) {
    const payload = match[1]?.trim() ?? '';
    const progress = parseOutlineProgressPayload(payload, state, messageId);
    if (!progress) {
      const warning = warnIgnoredOutlineStateBlock(messageId, payload);
      if (warning) {
        warnings.push(warning);
      }
      continue;
    }
    validBlocks.push({
      start: match.index,
      end: pattern.lastIndex,
      progress,
    });
  }

  return validBlocks;
}

function normalizeStoredOutlineProgress(
  value: unknown,
  state: StoryDirectorState,
  messageId: number,
): OutlineProgressReport | null {
  const record = toRecord(value);
  if (!record || !state.outline.runId || coerceString(record.runId).trim() !== state.outline.runId) {
    return null;
  }

  const currentNode = coerceInteger(record.currentNode, getOutlineCurrentNode(state), 1, 1000);
  const nextNode = coerceInteger(record.nextNode, currentNode, 1, 1000);
  return {
    runId: state.outline.runId,
    currentNode,
    nextNode,
    completedNode: coerceNullableInteger(record.completedNode, 1, 1000),
    completed: typeof record.completed === 'boolean' ? record.completed : nextNode > currentNode,
    status: coerceString(record.status).trim().slice(0, 500),
    confidence: coerceString(record.confidence).trim().slice(0, 80),
    messageId: coerceNullableInteger(record.messageId, 0) ?? messageId,
    updatedAt: coerceString(record.updatedAt).trim(),
  };
}

function safeLastMessageId() {
  try {
    return Math.max(getLastMessageId(), 0);
  } catch {
    return 0;
  }
}

function nextAssistantMessageId() {
  return safeLastMessageId() + 1;
}

function closeTimedOpenRange(state: StoryDirectorState) {
  const lastRange = state.timedEnding.ranges.at(-1);
  if (!lastRange || lastRange.endMessageId != null) {
    return;
  }
  lastRange.endMessageId = safeLastMessageId();
}

function openTimedRange(state: StoryDirectorState) {
  const lastRange = state.timedEnding.ranges.at(-1);
  if (lastRange && lastRange.endMessageId == null) {
    return;
  }
  state.timedEnding.ranges.push({
    startMessageId: nextAssistantMessageId(),
    endMessageId: null,
  });
}

function deactivateOtherModes(state: StoryDirectorState, keepMode: StoryDirectorMode) {
  if (keepMode !== 'outline') {
    state.outline.enabledPageId = null;
    state.outline.runId = null;
    state.outline.progress = createOutlineProgressReport(null, getOutlineCurrentNode(state));
  }
  if (keepMode !== 'endingReference') {
    state.endingReference.enabled = false;
  }
  if (keepMode !== 'timedEnding') {
    if (state.timedEnding.active) {
      closeTimedOpenRange(state);
    }
    state.timedEnding.active = false;
  }
}

function isOutlineRuntimeActive(state: StoryDirectorState) {
  return state.activeMode === 'outline' && Boolean(state.outline.enabledPageId && state.outline.runId);
}

function clearInactiveOutlineRuntime(state: StoryDirectorState) {
  if (isOutlineRuntimeActive(state)) {
    return;
  }
  if (state.activeMode === 'outline') {
    state.activeMode = null;
  }
  state.outline.enabledPageId = null;
  state.outline.runId = null;
  state.outline.progress = createOutlineProgressReport(null, getOutlineCurrentNode(state));
}

function localDateStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function createSessionId(serial: number) {
  return `XJW_END_COUNTER_2026-${localDateStamp()}-${String(serial).padStart(3, '0')}`;
}

function applyOutlineCompletion(state: StoryDirectorState) {
  const page = getEnabledOutlinePage(state);
  if (!page) {
    return false;
  }

  const currentNode = getOutlineCurrentNode(state);
  page.lastKnownNode = currentNode;
  const totalNodes = getNonEmptyNodes(page).length;
  if (totalNodes <= 0 || currentNode <= totalNodes) {
    return false;
  }

  state.activeMode = null;
  state.outline.enabledPageId = null;
  state.outline.runId = null;
  page.completed = true;
  page.lastKnownNode = currentNode;
  toastr.success('该页大纲演绎结束', '剧情指导');
  return true;
}

function buildOutlineContent(state: StoryDirectorState) {
  const page = getEnabledOutlinePage(state);
  if (!page) {
    return null;
  }

  const nodes = getNonEmptyNodes(page);
  if (nodes.length === 0) {
    return null;
  }

  const pageIndex = state.outline.pages.findIndex(candidate => candidate.id === page.id) + 1;
  const currentNode = getOutlineCurrentNode(state);
  const completedNodes = getOutlineCompletedNodesLabel(currentNode);
  const progress = state.outline.progress;
  const lastReport = progress.status
    ? `上次 AI 进度回报：${progress.status}`
    : '上次 AI 进度回报：暂无';
  const reportSource = progress.messageId != null ? `状态来源：第${progress.messageId}楼` : '状态来源：脚本初始状态';
  const nodeContent = nodes.map((node, index) => `节点${index + 1}：${node}。`).join('\n\n---\n');

  return trimBlock(`
<XINJINGWAN-2026-大纲状态>
当前启用页：第${pageIndex}页
大纲运行ID：${state.outline.runId ?? '未开始'}
当前应演绎节点：节点${currentNode}
已完成节点：${completedNodes}
总节点数：${nodes.length}
${lastReport}
${reportSource}
本页完成条件：状态块 nextNode > ${nodes.length}
</XINJINGWAN-2026-大纲状态>

<XINJINGWAN-2026-大纲>
${nodeContent}
</XINJINGWAN-2026-大纲>
`);
}

function buildOutlineRule() {
  return trimBlock(`
你必须以“<XINJINGWAN-2026-大纲></XINJINGWAN-2026-大纲>”标签包裹的文本内容为大纲，严格按照顺序去演绎大纲，每个剧情演绎完则进行下一个剧情的演绎。剧情的演绎必须尊重用户的选择，不无视用户的行动。当用户的选择与剧情冲突时，则以用户的选择为主，并设法让剧情步入正轨。
额外要求：不得对剧情生硬演绎，演绎的过程中可以适当补充合理的情节，以达到在不偏离大纲剧情推进的情况下让剧情生动起来的效果。

角色认知限制：大纲剧情是对你的创作要求，不是角色可感知的事实。你演绎的角色不是全知的，任何角色都不应知道、读到、预知、暗示知道或以任何方式感知大纲存在。在你的描写中，角色对大纲剧情的遵循绝不是来自这个大纲，而应来自剧情内可见的信息、角色动机、外在环境、临场事件或角色自身的心理与关系牵引。

合理化要求：故事不能生硬地按照大纲发展，角色顺应大纲的行为也要尽量合理化。必要时可以补充大纲上没有的小事件、线索、误会、环境变化、外部压力、利益诱因、情绪波动、习惯反应、关系牵制等，让角色以尽可能符合人设的方式自然做出贴近大纲方向的行为。

演绎顺序：
节点1>节点2>节点3>节点4>节点5>……；依次类推。

当前回复应优先围绕“当前应演绎节点”推进；后续节点只作为方向参考，不得提前完成、揭示或让角色预知。若当前节点只完成一部分，不要更新到下一个节点。
`);
}

function buildOutlineProgressRule(state: StoryDirectorState) {
  return trimBlock(`
每次回复末尾必须输出一次脚本状态块，用于让剧情指导脚本判断下一次应演绎哪个节点。状态块不是正文内容，不能被角色感知，不能在正文中解释、复述或提及。

状态块必须严格使用以下标签和 JSON 格式，不要放进 Markdown 代码块：
<${OUTLINE_STATE_TAG}>
{"runId":"${state.outline.runId ?? ''}","currentNode":1,"completed":false,"nextNode":1,"completedNode":null,"status":"用一句话说明当前节点的完成情况","confidence":"partial"}
</${OUTLINE_STATE_TAG}>

字段规则：
- runId：必须原样填写为“${state.outline.runId ?? ''}”。
- currentNode：本次回复实际正在演绎或判断的节点编号。
- completed：只有当 currentNode 的核心剧情已经完整演绎完，才填 true；只铺垫、只部分推进、用户打断或剧情未到位时填 false。
- nextNode：下一次应演绎的节点编号。completed 为 false 时保持 currentNode；completed 为 true 时通常填 currentNode + 1。
- completedNode：若 completed 为 true，填已完成的节点编号；否则填 null。
- status：面向脚本前端的一句话进度说明，不要包含幕后标签或指令。
- confidence：填 partial、complete 或 uncertain。

只有在节点的核心剧情已经完成后才允许把 nextNode 推进到下一个节点，不得提前跳过节点。状态块只用于后台状态维护，脚本会将它从用户可见正文中隐藏，但会把整理后的状态继续提供给后续 AI 请求。
`);
}

function buildEndingReferenceContent(state: StoryDirectorState) {
  const text = state.endingReference.text.trim();
  if (!text) {
    return null;
  }

  return trimBlock(`
<XINJINGWAN-2026-结局参考>
以下内容是用户希望在条件合适时得到的可能结局，而不是必须执行的大纲：

（${text}）

使用规则：
本条仅作为弱参考。不得为了达成该结局而主动扭曲当前剧情、无视用户行动、无视角色动机，或强行制造突兀事件。

当当前剧情尚未自然接近该结局，且用户也没有主动推动相关方向时，不要刻意推进该结局，正常延续当前剧情即可。

当剧情已经自然接近该结局，或某个事件结果存在多个同样合理的分支时，可以优先选择更接近该结局的合理发展。

角色非全知，绝不能让任何角色知道、预知、读到或暗示知道这个结局参考。
本条内容、标签和幕后规则绝不能在正文中被提及。
</XINJINGWAN-2026-结局参考>
`);
}

function buildTimedEndingContent(state: StoryDirectorState) {
  const text = state.timedEnding.goalText.trim();
  const sessionId = state.timedEnding.sessionId;
  if (!text || !sessionId) {
    return null;
  }

  const targetReplyIndex = state.timedEnding.targetReplyIndex;
  const completedReplyCount = state.timedEnding.completedReplyCount;
  const nextReplyIndex = completedReplyCount + 1;
  const minWindow = Math.max(1, targetReplyIndex - 2);
  const maxWindow = targetReplyIndex + 2;

  return trimBlock(`
<XINJINGWAN-2026-限时结局>
目标结局：
（${text}）

计数标识：XJW_END_COUNTER_2026
计数会话ID：${sessionId}
计数口径：只统计本计数会话启用期间生成、当前聊天中实际生效、未隐藏、被选中的 AI 回复。
暂停规则：功能关闭期间生成的 AI 回复不计入本计数会话。
新目标规则：如果计数会话ID变化，旧会话的计数、目标和完成要求全部作废，只以当前会话为准。

已完成AI回复数：${completedReplyCount}
本次AI回复序号：${nextReplyIndex}
目标完成序号：${targetReplyIndex}
允许完成窗口：第${minWindow}至第${maxWindow}次AI回复
</XINJINGWAN-2026-限时结局>

强制要求：
你必须将剧情逐步导向“（${text}）”作为故事结局。

只承认当前 <XINJINGWAN-2026-限时结局> 中计数会话ID为 ${sessionId} 的计数状态。任何旧会话、旧目标、历史提示、正文数字、章节号、楼层号或相似标签都无效。

当“本次AI回复序号”早于允许完成窗口时，不得直接完成目标结局，只能进行合理铺垫和推进。

当“本次AI回复序号”处于允许完成窗口内时，应自然完成或接近完成目标结局，并优先在目标完成序号附近完成。

当“本次AI回复序号”已经达到允许完成窗口的最后一次时，必须在本次回复完成目标结局。

这些计数、标签、序号、完成窗口和幕后控制信息绝不能在正文中被输出、复述或暗示。

角色非全知，绝不能让任何角色通过任何形式表现出知道这个结局。
角色只能基于自身认知、线索、动机和当前剧情自然行动。
`);
}

export function buildRuntimePromptContent(state: StoryDirectorState): string | null {
  if (state.activeMode === 'outline' && state.outline.enabledPageId) {
    const outlineContent = buildOutlineContent(state);
    if (!outlineContent) {
      return null;
    }
    return trimBlock([
      outlineContent,
      buildOutlineRule(),
      buildOutlineProgressRule(state),
    ].join('\n\n'));
  }

  if (state.activeMode === 'endingReference' && state.endingReference.enabled) {
    return buildEndingReferenceContent(state);
  }

  if (state.activeMode === 'timedEnding' && state.timedEnding.active) {
    return buildTimedEndingContent(state);
  }

  return null;
}

export function syncRuntimePrompt(state = readState(true)) {
  uninjectPrompts([RUNTIME_PROMPT_ID]);

  const content = buildRuntimePromptContent(state);
  if (!content) {
    return false;
  }

  injectPrompts([{
    id: RUNTIME_PROMPT_ID,
    position: 'in_chat',
    depth: 1,
    role: 'system',
    content,
    should_scan: false,
  }]);
  return true;
}

export function refreshRuntimePromptStatus(reason: string, state = readState(true)) {
  const runtimePromptInjected = syncRuntimePrompt(state);
  patchState(stateToUpdate => {
    clearInactiveOutlineRuntime(stateToUpdate);
    stateToUpdate.targetWorldbookName = null;
    stateToUpdate.status = {
      ...stateToUpdate.status,
      reason,
      activeMode: stateToUpdate.activeMode,
      targetWorldbookName: null,
      changedEntries: 0,
      runtimePromptInjected,
      outlineCurrentNode: getOutlineCurrentNode(stateToUpdate),
      outlineMvuAvailable: isOutlineRuntimeActive(stateToUpdate),
      timedCompletedReplyCount: stateToUpdate.timedEnding.completedReplyCount,
      timedNextReplyIndex: stateToUpdate.timedEnding.nextReplyIndex,
      lastSyncedAt: nowIsoString(),
    };
  });
  return runtimePromptInjected;
}

function isLegacyRuntimeEntryType(value: unknown) {
  return typeof value === 'string' && LEGACY_RUNTIME_ENTRY_TYPES.has(value);
}

function hasLegacyRuntimeStrongFeature(entry: WorldbookEntry) {
  const content = entry.content ?? '';
  return (
    entry.extra?.source === ENTRY_SOURCE ||
    entry.extra?.scriptId === getScriptId() ||
    isLegacyRuntimeEntryType(entry.extra?.entryType) ||
    LEGACY_RUNTIME_CONTENT_MARKERS.some(marker => content.includes(marker))
  );
}

function shouldCleanupLegacyRuntimeEntry(entry: WorldbookEntry) {
  return LEGACY_RUNTIME_ENTRY_NAMES.has(entry.name) && hasLegacyRuntimeStrongFeature(entry);
}

function addUniqueWorldbookName(names: string[], value: unknown) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name && !names.includes(name)) {
    names.push(name);
  }
}

export function getRuntimeCleanupWorldbookNames(extraTargets?: string | string[]) {
  const names: string[] = [];
  const extras = Array.isArray(extraTargets) ? extraTargets : [extraTargets];
  extras.forEach(target => addUniqueWorldbookName(names, target));

  try {
    addUniqueWorldbookName(names, getChatWorldbookName('current'));
  } catch (error) {
    console.warn('[xinjingwan-story-director] failed to read current chat worldbook for legacy cleanup:', error);
  }

  try {
    const charWorldbooks = getCharWorldbookNames('current');
    addUniqueWorldbookName(names, charWorldbooks.primary);
    charWorldbooks.additional.forEach(name => addUniqueWorldbookName(names, name));
  } catch (error) {
    console.warn('[xinjingwan-story-director] failed to read current character worldbooks for legacy cleanup:', error);
  }

  return names;
}

export async function cleanupLegacyRuntimeWorldbookEntries(worldbookName?: string | string[]) {
  const worldbookNames = getRuntimeCleanupWorldbookNames(worldbookName);
  for (const name of worldbookNames) {
    try {
      const worldbook = await getWorldbook(name);
      const filteredWorldbook = worldbook.filter(entry => !shouldCleanupLegacyRuntimeEntry(entry));
      if (filteredWorldbook.length !== worldbook.length) {
        await replaceWorldbook(name, filteredWorldbook, { render: 'debounced' });
      }
    } catch (error) {
      console.warn(`[xinjingwan-story-director] failed to cleanup legacy worldbook entries in ${name}:`, error);
    }
  }
}

function getVisibleAssistantMessages() {
  return getChatMessages('0-{{lastMessageId}}', { role: 'assistant' })
    .filter(message => message.is_hidden !== true);
}

async function refreshOutlineProgressMessages(context: SyncContext, warnings: string[]) {
  throwIfStale(context);
  let state = readState(true);
  if (state.activeMode !== 'outline' || !state.outline.enabledPageId || !state.outline.runId) {
    return null;
  }

  let selectedAssistantMessages: ChatMessage[] = [];
  try {
    selectedAssistantMessages = getVisibleAssistantMessages();
  } catch (error) {
    console.warn('[xinjingwan-story-director] unable to scan chat messages for outline progress:', error);
  }

  const updates: Array<{ message_id: number; message: string; extra: Record<string, unknown> }> = [];
  let latestProgress: OutlineProgressReport | null = null;

  for (const message of selectedAssistantMessages) {
    const storedProgress = normalizeStoredOutlineProgress(
      message.extra?.[OUTLINE_STATE_EXTRA_KEY],
      state,
      message.message_id,
    );
    if (storedProgress) {
      latestProgress = storedProgress;
    }

    const validBlocks = collectValidOutlineStateBlocks(message.message, state, message.message_id, warnings);
    if (validBlocks.length === 0) {
      continue;
    }

    const parsedProgress = validBlocks.at(-1)!.progress;
    const strippedMessage = stripMessageRanges(message.message, validBlocks);
    const nextExtra = {
      ...message.extra,
      [OUTLINE_STATE_EXTRA_KEY]: parsedProgress,
    };

    updates.push({
      message_id: message.message_id,
      message: strippedMessage,
      extra: nextExtra,
    });

    latestProgress = parsedProgress;
    state = {
      ...state,
      outline: {
        ...state.outline,
        progress: parsedProgress,
      },
    };
  }

  if (updates.length > 0) {
    throwIfStale(context);
    await setChatMessages(updates, { refresh: 'affected' });
    throwIfStale(context);
  }

  if (!latestProgress) {
    return null;
  }

  throwIfStale(context);
  patchState(stateToUpdate => {
    if (stateToUpdate.activeMode !== 'outline' || stateToUpdate.outline.runId !== latestProgress.runId) {
      return;
    }
    stateToUpdate.outline.progress = latestProgress;
    const page = getEnabledOutlinePage(stateToUpdate);
    if (page) {
      page.lastKnownNode = latestProgress.nextNode;
    }
  }, false);
  return latestProgress;
}

function messageInRanges(messageId: number, ranges: TimedActiveRange[]) {
  return ranges.some(range => {
    const endMessageId = range.endMessageId ?? Number.MAX_SAFE_INTEGER;
    return messageId >= range.startMessageId && messageId <= endMessageId;
  });
}

async function refreshTimedCounterMessages(context: SyncContext) {
  throwIfStale(context);
  const state = readState(true);
  const sessionId = state.timedEnding.sessionId;
  if (!sessionId) {
    return { completedReplyCount: 0, nextReplyIndex: 1 };
  }

  let selectedAssistantMessages: ChatMessage[] = [];
  try {
    selectedAssistantMessages = getVisibleAssistantMessages();
  } catch (error) {
    console.warn('[xinjingwan-story-director] unable to scan chat messages for timed counter:', error);
  }

  const eligibleMessages = selectedAssistantMessages.filter(message =>
    messageInRanges(message.message_id, state.timedEnding.ranges),
  );

  const updates = eligibleMessages
    .flatMap((message, index): Array<{ message_id: number } & Partial<ChatMessage>> => {
      const counter = {
        sessionId,
        index: index + 1,
        goalText: state.timedEnding.goalText,
        targetReplyIndex: state.timedEnding.targetReplyIndex,
      };
      if (_.isEqual(message.extra?.[TIMED_COUNTER_EXTRA_KEY], counter)) {
        return [];
      }
      return [{
        message_id: message.message_id,
        extra: {
          ...message.extra,
          [TIMED_COUNTER_EXTRA_KEY]: counter,
        },
      }];
    });

  if (updates.length > 0) {
    throwIfStale(context);
    await setChatMessages(updates, { refresh: 'none' });
    throwIfStale(context);
  }

  const completedReplyCount = eligibleMessages.length;
  const nextReplyIndex = completedReplyCount + 1;
  throwIfStale(context);
  patchState(stateToUpdate => {
    stateToUpdate.timedEnding.completedReplyCount = completedReplyCount;
    stateToUpdate.timedEnding.nextReplyIndex = nextReplyIndex;
  });

  return { completedReplyCount, nextReplyIndex };
}

export async function syncNow(reason: string, manual = false, context = captureSyncContext()) {
  const warnings: string[] = [];
  throwIfStale(context);
  let state = normalizeState(readState(true));
  await refreshOutlineProgressMessages(context, warnings);
  state = normalizeState(readState(true));
  throwIfStale(context);

  const completedOutline = state.activeMode === 'outline' && applyOutlineCompletion(state);
  if (completedOutline) {
    warnings.push('当前页大纲已完成，已自动关闭大纲条目。');
    state = writeState(state);
  }

  if (state.timedEnding.sessionId) {
    await refreshTimedCounterMessages(context);
    state = readState(true);
  }

  throwIfStale(context);
  clearInactiveOutlineRuntime(state);
  const runtimePromptInjected = syncRuntimePrompt(state);
  state.status = {
    reason,
    activeMode: state.activeMode,
    targetWorldbookName: null,
    changedEntries: 0,
    runtimePromptInjected,
    warnings,
    outlineCurrentNode: getOutlineCurrentNode(state),
    outlineMvuAvailable: isOutlineRuntimeActive(state),
    timedCompletedReplyCount: state.timedEnding.completedReplyCount,
    timedNextReplyIndex: state.timedEnding.nextReplyIndex,
    lastSyncedAt: nowIsoString(),
  };
  state.targetWorldbookName = null;
  writeState(state);

  if (manual) {
    if (warnings.length > 0) {
      toastr.warning(`运行提示已刷新，但有 ${warnings.length} 条提醒。`, '剧情指导');
    } else if (runtimePromptInjected) {
      toastr.success('运行提示已注入。', '剧情指导');
    } else {
      toastr.success('运行提示已清除。', '剧情指导');
    }
  }

  return state.status;
}

export function queueSync(reason: string, manual = false, delayMs = 250) {
  queuedManual = queuedManual || manual;
  queuedReason = reason;

  if (debounceTimer != null) {
    window.clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void flushQueuedSync();
  }, delayMs);
}

export async function flushQueuedSync() {
  if (syncRunning) {
    queueSync(queuedReason || '等待当前同步结束', queuedManual, 1_000);
    return;
  }

  const reason = queuedReason || '队列同步';
  const manual = queuedManual;
  queuedReason = '';
  queuedManual = false;
  syncRunning = true;

  try {
    await syncNow(reason, manual);
  } catch (error) {
    if (error instanceof StaleSyncError) {
      console.info('[xinjingwan-story-director] skipped stale sync after chat switch.');
      return;
    }
    console.error('[xinjingwan-story-director] queued sync failed:', error);
  } finally {
    syncRunning = false;
  }
}

export function queueSyncSeries(reason: string) {
  for (const delay of SYNC_DELAYS_MS) {
    const timer = window.setTimeout(() => queueSync(reason, false, 0), delay);
    syncTimers.push(timer);
  }
}

export function clearSyncTimers() {
  clearPendingSyncTimers();
}

export async function enableOutlinePage(pageId: string) {
  const context = captureSyncContext();
  const state = readState(true);
  const page = state.outline.pages.find(candidate => candidate.id === pageId);
  if (!page || getNonEmptyNodes(page).length === 0) {
    throw new Error('请先填写至少一个大纲节点。');
  }
  throwIfStale(context);

  patchState(stateToUpdate => {
    deactivateOtherModes(stateToUpdate, 'outline');
    const runId = createOutlineRunId();
    stateToUpdate.activeMode = 'outline';
    stateToUpdate.ui.tab = 'outline';
    stateToUpdate.outline.selectedPageId = pageId;
    stateToUpdate.outline.enabledPageId = pageId;
    stateToUpdate.outline.runId = runId;
    stateToUpdate.outline.progress = createOutlineProgressReport(runId, 1);
    const targetPage = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (targetPage) {
      targetPage.completed = false;
      targetPage.lastKnownNode = 1;
    }
  });
  await syncNow('启用大纲模式', true, context);
}

export async function closeOutlinePage() {
  const context = captureSyncContext();
  patchState(state => {
    if (state.activeMode === 'outline') {
      state.activeMode = null;
    }
    const page = getEnabledOutlinePage(state);
    if (page) {
      page.completed = true;
    }
    state.outline.enabledPageId = null;
    state.outline.runId = null;
  });
  await syncNow('关闭当前大纲页', true, context);
}

export async function enableEndingReference() {
  const context = captureSyncContext();
  const state = readState(true);
  if (!state.endingReference.text.trim()) {
    throw new Error('请先填写弱结局参考内容。');
  }
  throwIfStale(context);

  patchState(stateToUpdate => {
    deactivateOtherModes(stateToUpdate, 'endingReference');
    stateToUpdate.activeMode = 'endingReference';
    stateToUpdate.ui.tab = 'endingReference';
    stateToUpdate.endingReference.enabled = true;
  });
  await syncNow('启用弱结局参考', true, context);
}

export async function disableEndingReference() {
  const context = captureSyncContext();
  patchState(state => {
    if (state.activeMode === 'endingReference') {
      state.activeMode = null;
    }
    state.endingReference.enabled = false;
  });
  await syncNow('关闭弱结局参考', true, context);
}

export async function startNewTimedGoal() {
  const context = captureSyncContext();
  const state = readState(true);
  if (!state.timedEnding.goalText.trim()) {
    throw new Error('请先填写目标结局。');
  }
  throwIfStale(context);

  patchState(stateToUpdate => {
    deactivateOtherModes(stateToUpdate, 'timedEnding');
    const nextSerial = stateToUpdate.timedEnding.sessionSerial + 1;
    stateToUpdate.activeMode = 'timedEnding';
    stateToUpdate.ui.tab = 'timedEnding';
    stateToUpdate.timedEnding.active = true;
    stateToUpdate.timedEnding.sessionSerial = nextSerial;
    stateToUpdate.timedEnding.sessionId = createSessionId(nextSerial);
    stateToUpdate.timedEnding.ranges = [];
    stateToUpdate.timedEnding.completedReplyCount = 0;
    stateToUpdate.timedEnding.nextReplyIndex = 1;
    openTimedRange(stateToUpdate);
  });
  await syncNow('作为新限时结局目标开始', true, context);
}

export async function continueTimedGoal() {
  const context = captureSyncContext();
  const state = readState(true);
  if (!state.timedEnding.goalText.trim()) {
    throw new Error('请先填写目标结局。');
  }
  if (!state.timedEnding.sessionId) {
    await startNewTimedGoal();
    return;
  }
  throwIfStale(context);

  patchState(stateToUpdate => {
    deactivateOtherModes(stateToUpdate, 'timedEnding');
    stateToUpdate.activeMode = 'timedEnding';
    stateToUpdate.ui.tab = 'timedEnding';
    stateToUpdate.timedEnding.active = true;
    openTimedRange(stateToUpdate);
  });
  await syncNow('继续限时结局目标', true, context);
}

export async function pauseTimedGoal() {
  const context = captureSyncContext();
  patchState(state => {
    if (state.activeMode === 'timedEnding') {
      state.activeMode = null;
    }
    if (state.timedEnding.active) {
      closeTimedOpenRange(state);
    }
    state.timedEnding.active = false;
  });
  await syncNow('暂停限时结局目标', true, context);
}

export async function applyTimedGoalToCurrentSession() {
  const context = captureSyncContext();
  const state = readState(true);
  if (!state.timedEnding.goalText.trim()) {
    throw new Error('请先填写目标结局。');
  }
  if (!state.timedEnding.sessionId) {
    throw new Error('还没有当前计数会话，请先作为新目标开始。');
  }
  await syncNow('应用到当前限时结局目标', true, context);
}
