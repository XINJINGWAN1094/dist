import {
  applyTrainingSettlementToBattleRoster,
  BATTLE_ROSTER_STORAGE_KEY,
  createDefaultStoryTrainingState,
  mergeStoryTrainingState,
  normalizeBattleRosterStoredState,
  normalizeStoryTrainingChoices,
  normalizeStoryTrainingState,
  resetBattleRosterTrainingBonus,
  resetStoryTrainingState,
  STORY_TRAINING_FIELD_KEY,
  STORY_TRAINING_STATE_KEY,
  TRAINING_NO,
  TRAINING_YES,
  storyTrainingStateToChoiceByMemberId,
  type BattleRosterStoredState,
  type StoryTrainingState,
} from '../全屏覆盖式酒馆前端/共享/训练结算';
import {
  createDefaultStoryBattleState,
  normalizeStoryBattleState,
  STORY_BATTLE_ACTIVE,
  STORY_BATTLE_INACTIVE,
  STORY_BATTLE_STATE_KEY,
  STORY_BATTLE_STATE_VERSION,
  type StoryBattleState,
} from '../全屏覆盖式酒馆前端/共享/比赛状态';

const PAGE_SCOPE = '.thStoryDateSync';
const SCRIPT_BUTTON_NAME = '重算日期';
const STATUS_BAR_ID = 'th-story-date-sync-bar';
const STORY_DATE_KEY = 'story_date';
const STORY_DATE_SETTINGS_KEY = 'story_date_settings';
const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_REQUEST_RETRY_DELAYS_MS = [1_500, 4_000, 8_000] as const;
const INITIAL_DATE = { year: 3197, month: 5, day: 29 } as const;
const INITIAL_TIME_PERIOD = 'unknown' as const;

const TimePeriodSchema = z.enum(['unknown', 'morning', 'noon', 'afternoon', 'evening', 'night']);
const TrainingChoiceSchema = z.enum([TRAINING_YES, TRAINING_NO]);
const BattleStatusSchema = z.enum([STORY_BATTLE_ACTIVE, STORY_BATTLE_INACTIVE]);
const StoryDateSchema = z
  .object({
    calendar: z.literal('gregorian').prefault('gregorian'),
    year: z.coerce.number().int().prefault(INITIAL_DATE.year),
    month: z.coerce.number().int().prefault(INITIAL_DATE.month),
    day: z.coerce.number().int().prefault(INITIAL_DATE.day),
    iso_date: z.string().prefault(''),
    display_text: z.string().prefault(''),
    time_period: TimePeriodSchema.prefault(INITIAL_TIME_PERIOD),
    last_processed_message_id: z.union([z.coerce.number().int(), z.null()]).prefault(null),
    last_processed_message_hash: z.string().prefault(''),
    last_reason: z.string().prefault(''),
    last_confidence: z.coerce.number().prefault(0).transform(value => _.clamp(value, 0, 1)),
    last_synced_at: z.string().prefault(''),
  })
  .transform(data => {
    const year = coerceInteger(data.year, INITIAL_DATE.year);
    const month = _.clamp(coerceInteger(data.month, INITIAL_DATE.month), 1, 12);
    const day = _.clamp(coerceInteger(data.day, INITIAL_DATE.day), 1, getDaysInMonth(year, month));
    const lastProcessedMessageId = Number.isFinite(data.last_processed_message_id) ? data.last_processed_message_id : null;

    return {
      calendar: 'gregorian' as const,
      year,
      month,
      day,
      iso_date: formatIsoDate({ year, month, day }),
      display_text: formatDisplayDate({ year, month, day }),
      time_period: data.time_period,
      last_processed_message_id: lastProcessedMessageId,
      last_processed_message_hash: data.last_processed_message_hash.trim(),
      last_reason: data.last_reason.trim(),
      last_confidence: _.clamp(data.last_confidence, 0, 1),
      last_synced_at: data.last_synced_at.trim(),
    };
  });
const StoryDateSettingsSchema = z
  .object({
    enabled: z.union([z.boolean(), z.number(), z.string()]).prefault(true).transform(value => coerceBoolean(value, true)),
    base_url: z.string().prefault(''),
    api_key: z.string().prefault(''),
    model: z.string().prefault(''),
    timeout_ms: z.coerce
      .number()
      .prefault(DEFAULT_TIMEOUT_MS)
      .transform(value => _.clamp(Number.isFinite(value) ? Math.trunc(value) : DEFAULT_TIMEOUT_MS, 3_000, 120_000)),
    debug: z.union([z.boolean(), z.number(), z.string()]).prefault(false).transform(value => coerceBoolean(value, false)),
  })
  .transform(data => ({
    enabled: data.enabled,
    base_url: data.base_url.trim(),
    api_key: data.api_key.trim(),
    model: data.model.trim(),
    timeout_ms: data.timeout_ms,
    debug: data.debug,
  }));
const StoryTrainingStateSchema = z
  .object({
    version: z.coerce.number().int().prefault(1),
    characters: z
      .object({
        沈汐汐: z.object({ [STORY_TRAINING_FIELD_KEY]: TrainingChoiceSchema.prefault(TRAINING_NO) }).prefault({}),
        李叶楠: z.object({ [STORY_TRAINING_FIELD_KEY]: TrainingChoiceSchema.prefault(TRAINING_NO) }).prefault({}),
        白稚: z.object({ [STORY_TRAINING_FIELD_KEY]: TrainingChoiceSchema.prefault(TRAINING_NO) }).prefault({}),
        苏酥: z.object({ [STORY_TRAINING_FIELD_KEY]: TrainingChoiceSchema.prefault(TRAINING_NO) }).prefault({}),
      })
      .prefault({}),
    lastProcessedMessageId: z.union([z.coerce.number().int(), z.null()]).optional(),
    last_processed_message_id: z.union([z.coerce.number().int(), z.null()]).optional(),
    lastSyncedAt: z.string().optional(),
    last_synced_at: z.string().optional(),
  })
  .transform(data =>
    normalizeStoryTrainingState({
      version: data.version,
      characters: data.characters,
      lastProcessedMessageId: data.lastProcessedMessageId,
      last_processed_message_id: data.last_processed_message_id,
      lastSyncedAt: data.lastSyncedAt,
      last_synced_at: data.last_synced_at,
    }),
  );
const ChatVariableSchema = z
  .object({
    [STORY_DATE_KEY]: StoryDateSchema.prefault({}),
    [STORY_TRAINING_STATE_KEY]: StoryTrainingStateSchema.prefault({}),
    [STORY_BATTLE_STATE_KEY]: z
      .object({
        version: z.unknown().optional(),
        status: z.unknown().optional(),
        sessionId: z.unknown().optional(),
        session_id: z.unknown().optional(),
        lastProcessedMessageId: z.unknown().optional(),
        last_processed_message_id: z.unknown().optional(),
        reason: z.unknown().optional(),
        confidence: z.unknown().optional(),
        lastSyncedAt: z.unknown().optional(),
        last_synced_at: z.unknown().optional(),
      })
      .prefault({})
      .transform(data => normalizeStoryBattleState(data)),
  })
  .prefault({});
const ModelTrainingSchema = z
  .object({
    沈汐汐: TrainingChoiceSchema.prefault(TRAINING_NO),
    李叶楠: TrainingChoiceSchema.prefault(TRAINING_NO),
    白稚: TrainingChoiceSchema.prefault(TRAINING_NO),
    苏酥: TrainingChoiceSchema.prefault(TRAINING_NO),
  })
  .prefault({});
const ModelActionSchema = z
  .object({
    action: z.enum(['keep', 'advance_days', 'set_date', 'uncertain']),
    days: z.union([z.coerce.number(), z.null()]).optional(),
    target_date: z
      .union([
        z.object({
          year: z.coerce.number().int(),
          month: z.coerce.number().int(),
          day: z.coerce.number().int(),
        }),
        z.null(),
      ])
      .optional(),
    time_period: z.union([TimePeriodSchema, z.null()]).optional(),
    confidence: z.coerce.number().prefault(0).transform(value => _.clamp(value, 0, 1)),
    reason: z.string().prefault(''),
    training_today: ModelTrainingSchema.prefault({}),
    battle_status: BattleStatusSchema.prefault(STORY_BATTLE_INACTIVE),
    battle_reason: z.string().prefault(''),
    battle_confidence: z.coerce.number().optional(),
  })
  .transform(data => ({
    action: data.action,
    days: data.days == null ? null : Math.max(0, Math.trunc(data.days)),
    target_date: data.target_date
      ? normalizeDateParts({
          year: data.target_date.year,
          month: data.target_date.month,
          day: data.target_date.day,
        })
      : null,
    time_period: data.time_period,
    confidence: data.confidence,
    reason: data.reason.trim(),
    training_today: normalizeStoryTrainingChoices(data.training_today),
    battle_status: data.battle_status,
    battle_reason: data.battle_reason.trim() || data.reason.trim(),
    battle_confidence: _.clamp(data.battle_confidence ?? data.confidence, 0, 1),
  }));

type TimePeriod = z.output<typeof TimePeriodSchema>;
type StoryDate = z.output<typeof StoryDateSchema>;
type StoryDateSettings = z.output<typeof StoryDateSettingsSchema>;
type ModelAction = z.output<typeof ModelActionSchema>;
type SyncSnapshot = {
  storyDate: StoryDate;
  trainingState: StoryTrainingState;
  battleRosterState: BattleRosterStoredState;
  battleState: StoryBattleState;
};
type RuntimeStatus = 'synced' | 'syncing' | 'missing' | 'failed' | 'disabled';
type PendingTask =
  | { mode: 'none'; manual: false; reason: ''; messageId: null }
  | { mode: 'incremental'; manual: boolean; reason: string; messageId: number }
  | { mode: 'full'; manual: boolean; reason: string; messageId: null };

class StaleSyncError extends Error {
  constructor() {
    super('story-date sync task is stale');
    this.name = 'StaleSyncError';
  }
}

class ModelRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseText: string,
  ) {
    super(message);
    this.name = 'ModelRequestError';
  }
}

let currentChatId = SillyTavern.getCurrentChatId();
let syncRunning = false;
let desiredRevision = 0;
let pendingTask: PendingTask = emptyTask();
let runtimeStatus: RuntimeStatus = 'synced';
let unregisterMacro: (() => void) | null = null;

function emptyTask(): PendingTask {
  return { mode: 'none', manual: false, reason: '', messageId: null };
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

function coerceInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.trunc(numberValue);
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function normalizeDateParts(parts: { year: number; month: number; day: number }) {
  const year = coerceInteger(parts.year, INITIAL_DATE.year);
  const month = _.clamp(coerceInteger(parts.month, INITIAL_DATE.month), 1, 12);
  const day = _.clamp(coerceInteger(parts.day, INITIAL_DATE.day), 1, getDaysInMonth(year, month));
  return { year, month, day };
}

function formatIsoDate(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatDisplayDate(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

function advanceDate(parts: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function countAdvancedStoryDays(
  current: Pick<StoryDate, 'year' | 'month' | 'day'>,
  next: Pick<StoryDate, 'year' | 'month' | 'day'>,
): number {
  const currentTime = Date.UTC(current.year, current.month - 1, current.day);
  const nextTime = Date.UTC(next.year, next.month - 1, next.day);
  if (nextTime <= currentTime) {
    return 0;
  }
  return Math.trunc((nextTime - currentTime) / 86_400_000);
}

function needsTrainingBootstrap(chatVariables = getVariables({ type: 'chat' })): boolean {
  const rawTrainingState = _.get(chatVariables, STORY_TRAINING_STATE_KEY);
  const rawBattleRosterState = _.get(chatVariables, BATTLE_ROSTER_STORAGE_KEY);
  const trainingStateExists =
    !!rawTrainingState && typeof rawTrainingState === 'object' && Object.keys(rawTrainingState as Record<string, unknown>).length > 0;

  if (!rawBattleRosterState || typeof rawBattleRosterState !== 'object') {
    return true;
  }

  const battleRosterRecord = rawBattleRosterState as Record<string, unknown>;
  const hasBaseMembers = Array.isArray(battleRosterRecord.baseMembers) || Array.isArray(battleRosterRecord.base_members);
  const hasTrainingBonus = 'trainingBonus' in battleRosterRecord || 'training_bonus' in battleRosterRecord;

  return !trainingStateExists || !hasBaseMembers || !hasTrainingBonus;
}

function normalizeMessageText(message: string): string {
  return message.replace(/\r\n/g, '\n').trim();
}

function hashMessage(message: string): string {
  const normalized = normalizeMessageText(message);
  let hash = 5381;
  for (const char of normalized) {
    hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function buildSyncSnapshot(chatVariables: Record<string, any>): SyncSnapshot {
  return {
    storyDate: StoryDateSchema.parse(_.get(chatVariables, STORY_DATE_KEY, {})),
    trainingState: StoryTrainingStateSchema.parse(_.get(chatVariables, STORY_TRAINING_STATE_KEY, {})),
    battleRosterState: normalizeBattleRosterStoredState(_.get(chatVariables, BATTLE_ROSTER_STORAGE_KEY)),
    battleState: normalizeStoryBattleState(_.get(chatVariables, STORY_BATTLE_STATE_KEY)),
  };
}

function writeSyncSnapshot(snapshot: SyncSnapshot) {
  const normalizedStoryDate = StoryDateSchema.parse(snapshot.storyDate);
  const normalizedTrainingState = StoryTrainingStateSchema.parse(snapshot.trainingState);
  const normalizedBattleState = normalizeStoryBattleState(snapshot.battleState);

  updateVariablesWith(variables => {
    _.set(variables, STORY_DATE_KEY, normalizedStoryDate);
    _.set(variables, STORY_TRAINING_STATE_KEY, normalizedTrainingState);
    _.set(variables, BATTLE_ROSTER_STORAGE_KEY, snapshot.battleRosterState);
    _.set(variables, STORY_BATTLE_STATE_KEY, normalizedBattleState);
    return variables;
  }, { type: 'chat' });
}

function readSyncSnapshot(persist = false): SyncSnapshot {
  const chatVariables = getVariables({ type: 'chat' });
  const snapshot = buildSyncSnapshot(chatVariables);

  if (
    persist &&
    (!_.isEqual(_.get(chatVariables, STORY_DATE_KEY, {}), snapshot.storyDate) ||
      !_.isEqual(_.get(chatVariables, STORY_TRAINING_STATE_KEY, {}), snapshot.trainingState) ||
      !_.isEqual(_.get(chatVariables, BATTLE_ROSTER_STORAGE_KEY), snapshot.battleRosterState) ||
      !_.isEqual(_.get(chatVariables, STORY_BATTLE_STATE_KEY), snapshot.battleState))
  ) {
    writeSyncSnapshot(snapshot);
  }

  return snapshot;
}

function readStoryDate(persist = false): StoryDate {
  return readSyncSnapshot(persist).storyDate;
}

function readStoryDateSettings(persist = false): StoryDateSettings {
  const scriptVariables = getVariables({ type: 'script' });
  const rawValue = _.get(scriptVariables, STORY_DATE_SETTINGS_KEY, {});
  const settings = StoryDateSettingsSchema.parse(rawValue);

  if (persist && !_.isEqual(rawValue, settings)) {
    updateVariablesWith(variables => _.set(variables, STORY_DATE_SETTINGS_KEY, settings), { type: 'script' });
  }
  return settings;
}

function ensureVariableSchemas() {
  registerVariableSchema(ChatVariableSchema, { type: 'chat' });
}

function ensureStateInitialized() {
  readSyncSnapshot(true);
  readStoryDateSettings(true);
}

function hasModelConfig(settings: StoryDateSettings): boolean {
  return Boolean(settings.base_url && settings.api_key && settings.model);
}

function resolveOpenAIEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return '';
  }
  if (/\/chat\/completions(?:\?.*)?$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed.replace(/\/+$/, '')}/chat/completions`;
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map(item => {
      if (typeof item === 'string') {
        return item;
      }
      if (!item || typeof item !== 'object') {
        return '';
      }
      const text = _.get(item, 'text');
      if (typeof text === 'string') {
        return text;
      }
      const content = _.get(item, 'content');
      return typeof content === 'string' ? content : '';
    })
    .join('');
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const jsonStart = trimmed.indexOf('{');
  if (jsonStart < 0) {
    return trimmed;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(jsonStart, index + 1);
      }
    }
  }

  return trimmed;
}

function parseModelAction(rawContent: string): ModelAction {
  const parsed = JSON.parse(stripJsonFence(rawContent)) as unknown;
  const action = ModelActionSchema.parse(parsed);

  if (action.action === 'advance_days' && action.days == null) {
    throw new Error('模型返回了 advance_days，但没有提供 days');
  }
  if (action.action === 'set_date' && action.target_date == null) {
    throw new Error('模型返回了 set_date，但没有提供 target_date');
  }
  return action;
}

export function buildPrompt(message: ChatMessage, current: StoryDate): string {
  return [
    '你是一个只负责解析剧情日期变化的助手。',
    '你只能根据当前这一条 AI 回复正文判断日期变化，不能参考用户意图，也不能脑补未来计划。',
    '你必须只返回一个 JSON 对象，不能输出任何解释、Markdown、代码块标题或额外文本。',
    '允许的 action 只有 keep、advance_days、set_date、uncertain。',
    '规则：',
    '- “当天晚上/午后/清晨”等默认不跨日，只在必要时更新 time_period。',
    '- “第二天/次日/翌日/隔天/三天后”等明确时间跳转才推进日期。',
    '- 回忆、假设、愿望、计划、比喻不改变真实日期。',
    '- 若正文明确写出年月日，可用 set_date；否则优先用 advance_days。',
    '- confidence 取 0 到 1 之间的小数，reason 简短说明依据。',
    '',
    '返回 JSON schema：',
    '{"action":"keep|advance_days|set_date|uncertain","days":number|null,"target_date":{"year":number,"month":number,"day":number}|null,"time_period":"unknown|morning|noon|afternoon|evening|night"|null,"confidence":0.0,"reason":"..."}',
    '',
    '当前日期状态：',
    JSON.stringify(
      {
        calendar: current.calendar,
        iso_date: current.iso_date,
        display_text: current.display_text,
        time_period: current.time_period,
      },
      null,
      2,
    ),
    '',
    `当前消息编号：${message.message_id}`,
    '当前 AI 回复正文：',
    message.message,
  ].join('\n');
}

function buildTrainingAwarePrompt(message: ChatMessage, current: StoryDate, currentBattleState: StoryBattleState): string {
  return [
    '你是一个只负责解析剧情日期变化、训练变量和比赛状态的助手。',
    '你只能根据当前这一条 AI 回复正文判断日期变化、四名角色今天是否训练，以及我方战队当前是否处于比赛战斗中；不能参考用户意图，也不能脑补未来计划。',
    '你必须只返回一个 JSON 对象，不能输出任何解释、Markdown、代码块标题或额外文本。',
    '允许的 action 只有 keep、advance_days、set_date、uncertain。',
    '规则：',
    '- “当天晚些时候/下午/清晨”等默认不跨日，只在必要时更新 time_period。',
    '- “第二天/次日/翌日/隔天/三天后”等明确时间跳转才推进日期。',
    '- 回忆、假设、愿望、计划、比喻不改变真实日期。',
    '- 若正文明确写出年月日，可用 set_date；否则优先用 advance_days。',
    '- training_today 必须包含：沈汐汐、李叶楠、白稚、苏酥；值只能是“是”或“否”。',
    '- 如果正文没有明确说明某人今天训练，返回“否”。',
    '- 如果同一条正文直接跨到下一天，training_today 按跨天前这一天是否训练来判断。',
    '- 如果正文一次跳过多天，你仍只返回离开当前日这一天的 training_today。',
    '- battle_status 必须是“比赛中”或“非比赛”。',
    '- 只有正文明确表示我方战队（沈汐汐、李叶楠、白稚、苏酥、我方战队或同义表达）和其他战队/敌方战队开始、进入或正在进行比赛战斗时，才能返回“比赛中”。',
    '- 赛前准备、训练、观战、他队之间战斗、单人冲突、回忆、计划、假设、普通聊天，都必须返回“非比赛”。',
    '- 如果当前比赛状态已经是“比赛中”，正文仍在描写这场比赛的战斗过程、出招、受伤、回合、战斗控制或赛场行动，则继续返回“比赛中”。',
    '- 当正文明确表示战斗结束、比赛结束、胜负已分、裁判宣布结束、离开赛场或不再战斗时，battle_status 必须返回“非比赛”。',
    '- 如果无法确定是否满足“我方战队和其他战队开始/正在战斗”，battle_status 返回“非比赛”。',
    '- battle_reason 用一句短句说明比赛状态判断依据，battle_confidence 是 0 到 1 之间的小数。',
    '- confidence 是 0 到 1 之间的小数，reason 用一句短句说明依据。',
    '',
    '返回 JSON schema：',
    '{"action":"keep|advance_days|set_date|uncertain","days":number|null,"target_date":{"year":number,"month":number,"day":number}|null,"time_period":"unknown|morning|noon|afternoon|evening|night"|null,"confidence":0.0,"reason":"...","training_today":{"沈汐汐":"是|否","李叶楠":"是|否","白稚":"是|否","苏酥":"是|否"},"battle_status":"比赛中|非比赛","battle_reason":"...","battle_confidence":0.0}',
    '',
    '当前日期状态：',
    JSON.stringify(
      {
        calendar: current.calendar,
        iso_date: current.iso_date,
        display_text: current.display_text,
        time_period: current.time_period,
      },
      null,
      2,
    ),
    '',
    '当前比赛状态变量：',
    JSON.stringify(
      {
        status: currentBattleState.status,
        sessionId: currentBattleState.sessionId,
        reason: currentBattleState.reason,
      },
      null,
      2,
    ),
    '',
    `当前消息编号：${message.message_id}`,
    '当前 AI 回复正文：',
    message.message,
  ].join('\n');
}

function debugLog(message: string, payload?: unknown) {
  if (!readStoryDateSettings(false).debug) {
    return;
  }
  console.info(`[story-date-sync] ${message}`, payload ?? '');
}

async function requestModelAction(
  message: ChatMessage,
  current: StoryDate,
  currentBattleState: StoryBattleState,
  settings: StoryDateSettings,
  revision: number,
): Promise<ModelAction> {
  for (let attempt = 0; attempt <= MODEL_REQUEST_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await requestModelActionOnce(message, current, currentBattleState, settings, revision);
    } catch (error) {
      if (error instanceof StaleSyncError || !shouldRetryModelRequest(error) || attempt >= MODEL_REQUEST_RETRY_DELAYS_MS.length) {
        throw error;
      }

      const delayMs = MODEL_REQUEST_RETRY_DELAYS_MS[attempt];
      debugLog(`model request retry after ${delayMs}ms`, {
        message_id: message.message_id,
        attempt: attempt + 1,
        status: error instanceof ModelRequestError ? error.status : null,
      });
      await delay(delayMs);
      throwIfStale(revision);
    }
  }

  throw new Error('外接 AI 请求失败：重试结束但没有返回结果');
}

async function requestModelActionOnce(
  message: ChatMessage,
  current: StoryDate,
  currentBattleState: StoryBattleState,
  settings: StoryDateSettings,
  revision: number,
): Promise<ModelAction> {
  const normalizedMessage = normalizeMessageText(message.message);
  if (!normalizedMessage) {
    return ModelActionSchema.parse({
      action: 'keep',
      confidence: 1,
      reason: 'assistant message is empty',
      time_period: current.time_period,
      training_today: {
        沈汐汐: TRAINING_NO,
        李叶楠: TRAINING_NO,
        白稚: TRAINING_NO,
        苏酥: TRAINING_NO,
      },
      battle_status: currentBattleState.status,
      battle_reason: 'assistant message is empty',
      battle_confidence: 1,
    });
  }

  throwIfStale(revision);

  const endpoint = resolveOpenAIEndpoint(settings.base_url);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort('timeout'), settings.timeout_ms);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.api_key}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        stream: false,
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: 'Return JSON only. You parse story date progression, training flags, and battle status from one assistant reply.',
          },
          {
            role: 'user',
            content: buildTrainingAwarePrompt(message, current, currentBattleState),
          },
        ],
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new ModelRequestError(
        `外接 AI 请求失败 (${response.status})：${responseText.slice(0, 400)}`,
        response.status,
        responseText,
      );
    }

    const payload = JSON.parse(responseText) as unknown;
    const content =
      extractTextContent(_.get(payload, 'choices[0].message.content')) ||
      extractTextContent(_.get(payload, 'choices[0].text')) ||
      extractTextContent(_.get(payload, 'output_text'));

    if (!content) {
      throw new Error('外接 AI 返回中没有可解析的消息内容');
    }

    debugLog('model raw content', content);
    throwIfStale(revision);
    return parseModelAction(content);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`外接 AI 请求超时（>${settings.timeout_ms}ms）`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function shouldRetryModelRequest(error: unknown): boolean {
  if (!(error instanceof ModelRequestError)) {
    return false;
  }
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function applyModelAction(current: StoryDate, action: ModelAction, message: ChatMessage): StoryDate {
  const messageHash = hashMessage(message.message);
  let nextDate = {
    year: current.year,
    month: current.month,
    day: current.day,
  };
  let nextTimePeriod: TimePeriod = current.time_period;

  switch (action.action) {
    case 'keep':
      nextTimePeriod = action.time_period ?? current.time_period;
      break;
    case 'advance_days':
      nextDate = advanceDate(current, action.days ?? 0);
      nextTimePeriod = action.time_period ?? INITIAL_TIME_PERIOD;
      break;
    case 'set_date':
      nextDate = action.target_date ?? nextDate;
      nextTimePeriod = action.time_period ?? INITIAL_TIME_PERIOD;
      break;
    case 'uncertain':
      break;
  }

  return StoryDateSchema.parse({
    ...current,
    ...nextDate,
    time_period: nextTimePeriod,
    last_processed_message_id: message.message_id,
    last_processed_message_hash: messageHash,
    last_reason: action.reason,
    last_confidence: action.confidence,
    last_synced_at: new Date().toISOString(),
  });
}

function createStoryBattleSessionId(message: ChatMessage): string {
  return `story_battle_${message.message_id}_${hashMessage(message.message)}`;
}

function applyModelBattleStatus(current: StoryBattleState, action: ModelAction, message: ChatMessage, syncedAt: string): StoryBattleState {
  const nextStatus = action.battle_status;
  const sessionId =
    nextStatus === STORY_BATTLE_ACTIVE
      ? current.status === STORY_BATTLE_ACTIVE && current.sessionId
        ? current.sessionId
        : createStoryBattleSessionId(message)
      : current.sessionId;

  return normalizeStoryBattleState({
    version: STORY_BATTLE_STATE_VERSION,
    status: nextStatus,
    sessionId,
    lastProcessedMessageId: message.message_id,
    reason: action.battle_reason,
    confidence: action.battle_confidence,
    lastSyncedAt: syncedAt,
  });
}

function applyModelActionToSnapshot(currentSnapshot: SyncSnapshot, action: ModelAction, message: ChatMessage): SyncSnapshot {
  const syncedAt = new Date().toISOString();
  const nextStoryDate = applyModelAction(currentSnapshot.storyDate, action, message);
  const mergedTrainingState = mergeStoryTrainingState(currentSnapshot.trainingState, action.training_today, message.message_id, syncedAt);
  const nextBattleState = applyModelBattleStatus(currentSnapshot.battleState, action, message, syncedAt);
  const settlementDays = countAdvancedStoryDays(currentSnapshot.storyDate, nextStoryDate);
  const nextBattleRosterState =
    settlementDays > 0
      ? applyTrainingSettlementToBattleRoster(
          currentSnapshot.battleRosterState,
          storyTrainingStateToChoiceByMemberId(mergedTrainingState),
          settlementDays,
        )
      : currentSnapshot.battleRosterState;

  return {
    storyDate: nextStoryDate,
    trainingState: settlementDays > 0 ? resetStoryTrainingState(message.message_id, syncedAt) : mergedTrainingState,
    battleRosterState: nextBattleRosterState,
    battleState: nextBattleState,
  };
}

function createRecalculationSeedSnapshot(currentBattleRosterState: BattleRosterStoredState): SyncSnapshot {
  return {
    storyDate: StoryDateSchema.parse({}),
    trainingState: createDefaultStoryTrainingState(),
    battleRosterState: resetBattleRosterTrainingBonus(currentBattleRosterState),
    battleState: createDefaultStoryBattleState(),
  };
}

function getAssistantMessages(): ChatMessage[] {
  return getChatMessages('0-{{lastMessageId}}', { role: 'assistant' }) as ChatMessage[];
}

function getLatestAssistantMessage(): ChatMessage | null {
  return getAssistantMessages().at(-1) ?? null;
}

function isMessageAlreadyProcessed(storyDate: StoryDate, message: ChatMessage): boolean {
  return (
    storyDate.last_processed_message_id === message.message_id &&
    storyDate.last_processed_message_hash === hashMessage(message.message)
  );
}

function buildTask(mode: 'incremental' | 'full', reason: string, manual = false, messageId: number | null = null): PendingTask {
  if (mode === 'incremental') {
    if (messageId == null) {
      throw new Error('incremental task requires a messageId');
    }
    return { mode, reason, manual, messageId };
  }
  return { mode, reason, manual, messageId: null };
}

function combineTasks(current: PendingTask, next: PendingTask): PendingTask {
  if (current.mode === 'none') {
    return next;
  }
  if (current.mode === 'full') {
    return { ...current, manual: current.manual || next.manual, reason: next.reason };
  }
  if (next.mode === 'full') {
    return { ...next, manual: current.manual || next.manual };
  }
  return {
    mode: 'full',
    manual: current.manual || next.manual,
    reason: `${current.reason}; ${next.reason}`,
    messageId: null,
  };
}

function queueTask(task: PendingTask) {
  if (task.mode === 'none') {
    return;
  }
  const nextTask =
    syncRunning && task.mode === 'incremental'
      ? buildTask('full', `${task.reason}; escalated to full recalculation while busy`, task.manual)
      : task;

  pendingTask = combineTasks(pendingTask, nextTask);
  desiredRevision += 1;
  debugLog('queue task', pendingTask);
  if (!syncRunning) {
    void flushQueue();
  }
}

function throwIfStale(revision: number) {
  if (revision !== desiredRevision || currentChatId !== SillyTavern.getCurrentChatId()) {
    throw new StaleSyncError();
  }
}

function setRuntimeStatus(status: RuntimeStatus, _detail = '') {
  runtimeStatus = status;
}

function markSyncFailure(detail: string) {
  setRuntimeStatus('failed', detail);
  console.error('[story-date-sync] sync failed:', detail);
}

function removeLegacyStatusBar() {
  $(`#${STATUS_BAR_ID}`).remove();
}

function refreshIdleStatus() {
  if (syncRunning || runtimeStatus === 'failed') {
    return;
  }

  const settings = readStoryDateSettings(false);
  if (!settings.enabled) {
    setRuntimeStatus('disabled', '已在脚本变量中关闭外接 AI 日期同步。');
    return;
  }

  const chatVariables = getVariables({ type: 'chat' });
  const latestAssistantMessage = getLatestAssistantMessage();
  const storyDate = buildSyncSnapshot(chatVariables).storyDate;
  if (!latestAssistantMessage) {
    setRuntimeStatus('synced', `当前时段：${storyDate.time_period}`);
    return;
  }

  if (needsTrainingBootstrap(chatVariables)) {
    setRuntimeStatus('synced', '已检测到训练变量升级，等待自动补全训练结算。');
    return;
  }

  if (isMessageAlreadyProcessed(storyDate, latestAssistantMessage)) {
    setRuntimeStatus('synced', `褰撳墠鏃舵锛?{storyDate.time_period}`);
    return;
  }

  if (!hasModelConfig(settings)) {
    setRuntimeStatus('missing', '请在 script 变量 story_date_settings 中填写 base_url、api_key、model。');
    return;
  }

  setRuntimeStatus('synced', `待同步最新 AI 回复 #${latestAssistantMessage.message_id}`);
}

async function runIncrementalSync(messageId: number, revision: number): Promise<boolean> {
  const message = getChatMessages(messageId, { role: 'assistant' })[0] as ChatMessage | undefined;
  if (!message || message.role !== 'assistant') {
    return false;
  }

  const settings = readStoryDateSettings(false);
  if (!settings.enabled) {
    setRuntimeStatus('disabled', '已在脚本变量中关闭外接 AI 日期同步。');
    return false;
  }
  if (!hasModelConfig(settings)) {
    setRuntimeStatus('missing', '请在 script 变量 story_date_settings 中填写 base_url、api_key、model。');
    return false;
  }

  const currentSnapshot = readSyncSnapshot(false);
  if (isMessageAlreadyProcessed(currentSnapshot.storyDate, message) && !needsTrainingBootstrap()) {
    setRuntimeStatus('synced', `AI 回复 #${message.message_id} 已同步。`);
    return true;
  }

  const action = await requestModelAction(message, currentSnapshot.storyDate, currentSnapshot.battleState, settings, revision);
  throwIfStale(revision);
  const nextSnapshot = applyModelActionToSnapshot(currentSnapshot, action, message);
  writeSyncSnapshot(nextSnapshot);
  setRuntimeStatus('synced', `已同步 AI 回复 #${message.message_id}。`);
  return true;
}

async function runFullRecalculation(revision: number): Promise<number> {
  const settings = readStoryDateSettings(false);
  if (!settings.enabled) {
    setRuntimeStatus('disabled', '已在脚本变量中关闭外接 AI 日期同步。');
    return 0;
  }
  if (!hasModelConfig(settings)) {
    setRuntimeStatus('missing', '请在 script 变量 story_date_settings 中填写 base_url、api_key、model。');
    return 0;
  }

  const messages = getAssistantMessages();
  const currentSnapshot = readSyncSnapshot(false);
  let nextSnapshot = createRecalculationSeedSnapshot(currentSnapshot.battleRosterState);

  for (const message of messages) {
    throwIfStale(revision);
    const action = await requestModelAction(message, nextSnapshot.storyDate, nextSnapshot.battleState, settings, revision);
    throwIfStale(revision);
    nextSnapshot = applyModelActionToSnapshot(nextSnapshot, action, message);
    writeSyncSnapshot(nextSnapshot);
  }

  setRuntimeStatus('synced', messages.length > 0 ? `已重算 ${messages.length} 条 AI 回复。` : '当前聊天还没有 AI 回复，已保留初始日期。');
  return messages.length;
}

async function runTask(task: Exclude<PendingTask, { mode: 'none' }>, revision: number) {
  setRuntimeStatus('syncing', task.mode === 'full' ? '正在从初始日期全量重算剧情日期。' : `正在同步 AI 回复 #${task.messageId}。`);

  let processedCount = 0;
  try {
    if (task.mode === 'full') {
      processedCount = await runFullRecalculation(revision);
    } else {
      const synced = await runIncrementalSync(task.messageId, revision);
      processedCount = synced ? 1 : 0;
    }

    if (task.manual) {
      toastr.success(`日期同步完成，处理了 ${processedCount} 条 AI 回复。`, '剧情日期');
    }
  } catch (error) {
    if (error instanceof StaleSyncError) {
      debugLog('task stale, skip result');
      return;
    }

    const detail = error instanceof Error ? error.message : String(error);
    markSyncFailure(detail);
    if (task.manual) {
      toastr.error(detail, '剧情日期');
    }
  }
}

async function flushQueue() {
  if (syncRunning) {
    return;
  }

  while (pendingTask.mode !== 'none') {
    const task = pendingTask;
    const revision = desiredRevision;
    pendingTask = emptyTask();
    syncRunning = true;

    try {
      await runTask(task, revision);
    } finally {
      syncRunning = false;
    }
  }

  refreshIdleStatus();
}

function handleAssistantMessageReceived(messageId: number) {
  const message = getChatMessages(messageId)[0] as ChatMessage | undefined;
  if (!message || message.role !== 'assistant') {
    return;
  }

  queueTask(buildTask('incremental', `message received #${messageId}`, false, messageId));
}

function handleAssistantMessageChanged(messageId: number, source: 'updated' | 'edited') {
  const message = getChatMessages(messageId)[0] as ChatMessage | undefined;
  if (!message || message.role !== 'assistant') {
    return;
  }

  queueTask(buildTask('full', `assistant message ${source} #${messageId}`));
}

function handleChatChanged() {
  currentChatId = SillyTavern.getCurrentChatId();
  desiredRevision += 1;
  pendingTask = emptyTask();

  ensureStateInitialized();
  refreshIdleStatus();

  const latestAssistantMessage = getLatestAssistantMessage();
  const storyDate = readStoryDate(false);
  const trainingBootstrapNeeded = needsTrainingBootstrap();
  if (!latestAssistantMessage) {
    return;
  }
  if (trainingBootstrapNeeded || !isMessageAlreadyProcessed(storyDate, latestAssistantMessage)) {
    queueTask(buildTask('full', 'chat changed bootstrap'));
  }
}

function bootstrapCurrentChat() {
  currentChatId = SillyTavern.getCurrentChatId();
  ensureStateInitialized();
  refreshIdleStatus();

  const latestAssistantMessage = getLatestAssistantMessage();
  const trainingBootstrapNeeded = needsTrainingBootstrap();
  if (!latestAssistantMessage) {
    return;
  }

  const storyDate = readStoryDate(false);
  if (trainingBootstrapNeeded || !isMessageAlreadyProcessed(storyDate, latestAssistantMessage)) {
    queueTask(buildTask('full', 'startup bootstrap'));
  }
}

function installCurrentDateMacro() {
  const regex = /<当前日期\s*\/>/g;
  unregisterMacro?.();
  unregisterMacro = registerMacroLike(regex, () => readStoryDate(false).display_text).unregister;
}

function mountStoryDateSync() {
  appendInexistentScriptButtons([{ name: SCRIPT_BUTTON_NAME, visible: true }]);
  ensureVariableSchemas();
  removeLegacyStatusBar();
  installCurrentDateMacro();
  bootstrapCurrentChat();

  const stopHandles = [
    eventOn(
      tavern_events.MESSAGE_RECEIVED,
      errorCatched((messageId: number) => {
        handleAssistantMessageReceived(messageId);
      }),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_UPDATED,
      errorCatched((messageId: number) => {
        handleAssistantMessageChanged(messageId, 'updated');
      }),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_EDITED,
      errorCatched((messageId: number) => {
        handleAssistantMessageChanged(messageId, 'edited');
      }),
    ).stop,
    eventOn(
      tavern_events.CHAT_CHANGED,
      errorCatched(() => {
        handleChatChanged();
      }),
    ).stop,
    eventOn(
      getButtonEvent(SCRIPT_BUTTON_NAME),
      errorCatched(() => {
        if (syncRunning) {
          toastr.info('已有同步任务正在运行，已为你追加一次全量重算。', '剧情日期');
        }
        queueTask(buildTask('full', 'manual button recalculation', true));
      }),
    ).stop,
  ];

  $(window).on(`pagehide${PAGE_SCOPE}`, () => {
    stopHandles.forEach(stop => stop());
    unregisterMacro?.();
    unregisterMacro = null;
    removeLegacyStatusBar();
    $(window).off(PAGE_SCOPE);
  });
}

$(() => {
  errorCatched(mountStoryDateSync)();
});
