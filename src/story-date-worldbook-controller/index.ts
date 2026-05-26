export {};

const PAGE_SCOPE = '.thStoryDateWorldbookController';
const SCRIPT_BUTTON_NAME = '同步日期世界书';
const SETTINGS_KEY = 'story_date_worldbook_controller';
const STATUS_KEY = 'story_date_worldbook_controller_status';
const STORY_DATE_KEY = 'story_date';
const DEFAULT_WORLDBOOK_NAME = '息与梦进行曲';
const INITIAL_DATE = { year: 3197, month: 5, day: 29 } as const;
const DEFAULT_SYNC_DELAYS_MS = [300, 2_000, 5_000, 10_000, 30_000] as const;

type RenderMode = 'debounced' | 'immediate';
type DateParts = {
  year: number;
  month: number;
  day: number;
};
type ControllerSettings = {
  enabled: boolean;
  worldbook: string;
  render: RenderMode;
  debug: boolean;
  entries: Record<string, string>;
  entry_worldbooks: Record<string, string>;
};
type DateRule = {
  label: string;
  from: string;
  to?: string;
  entries: string[];
};
type CompiledDateRule = DateRule & {
  fromValue: number;
  toValue: number | null;
};
type EntryTarget = {
  id: string;
  entryName: string;
  worldbookName: string;
  shouldEnable: boolean;
};
type SyncReport = {
  reason: string;
  date: string;
  active_ids: string[];
  changed_entries: number;
  checked_entries: number;
  warnings: string[];
  last_synced_at: string;
};

const CONTROLLED_ENTRY_IDS = [
  '常驻01',
  '日期01',
  '日期02',
  '日期03',
  '日期04',
  '日期05',
  '日期06',
  '日期07',
  '日期08',
  '日期09',
  '日期10',
  '日期11',
  '日期12',
  '日期13',
  '日期14',
  '日期15',
  '日期16',
  '日期17',
  '日期18',
  '日期19',
  '日期20',
  '日期21',
] as const;

const DATE_RULES: DateRule[] = [
  { label: '常驻01', from: '3197-05-29', to: '3198-11-05', entries: ['常驻01'] },
  { label: '日期01', from: '3197-05-29', to: '3197-06-30', entries: ['日期01'] },
  { label: '日期02', from: '3197-07-01', to: '3197-07-31', entries: ['日期02'] },
  { label: '日期03', from: '3197-08-01', to: '3197-08-05', entries: ['日期03'] },
  { label: '日期04', from: '3197-08-06', to: '3197-09-30', entries: ['日期04'] },
  { label: '日期05', from: '3197-10-01', to: '3197-10-05', entries: ['日期05'] },
  { label: '日期06', from: '3197-10-06', to: '3197-12-21', entries: ['日期06'] },
  { label: '日期07', from: '3197-12-22', to: '3197-12-26', entries: ['日期07'] },
  { label: '日期08', from: '3197-12-27', to: '3198-03-01', entries: ['日期08'] },
  { label: '日期09', from: '3198-03-02', to: '3198-03-08', entries: ['日期09'] },
  { label: '日期10', from: '3198-03-09', to: '3198-06-01', entries: ['日期10'] },
  { label: '日期11', from: '3198-06-02', to: '3198-06-05', entries: ['日期11'] },
  { label: '日期12', from: '3198-06-06', to: '3198-08-01', entries: ['日期12'] },
  { label: '日期13', from: '3198-08-02', to: '3198-08-07', entries: ['日期13'] },
  { label: '日期14', from: '3198-08-08', to: '3198-11-01', entries: ['日期14'] },
  { label: '日期15', from: '3198-11-02', to: '3198-11-04', entries: ['日期15'] },
  { label: '3198-11-05最终组', from: '3198-11-05', entries: ['日期16', '日期17', '日期18'] },
  { label: '3198-11-06最终组', from: '3198-11-06', entries: ['日期19', '日期20', '日期21'] },
];

const COMPILED_DATE_RULES = DATE_RULES.map(rule => ({
  ...rule,
  fromValue: parseIsoDateValue(rule.from),
  toValue: rule.to ? parseIsoDateValue(rule.to) : null,
}));

let syncRunning = false;
let queuedManual = false;
let queuedReason = '';
let debounceTimer: number | null = null;
let syncTimers: number[] = [];

function createDefaultEntryMap(): Record<string, string> {
  return Object.fromEntries(CONTROLLED_ENTRY_IDS.map(id => [id, id]));
}

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

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(Math.max(coerceInteger(value, fallback), min), max);
}

function normalizeDateParts(value: unknown): DateParts {
  const record = isRecord(value) ? value : {};
  const year = coerceInteger(record.year, INITIAL_DATE.year);
  const month = clampInteger(record.month, INITIAL_DATE.month, 1, 12);
  const day = clampInteger(record.day, INITIAL_DATE.day, 1, getDaysInMonth(year, month));
  return { year, month, day };
}

function formatIsoDate(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function toDateValue(parts: DateParts): number {
  return parts.year * 10_000 + parts.month * 100 + parts.day;
}

function parseIsoDateValue(value: string): number {
  const match = value.match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    throw new Error(`Invalid date rule: ${value}`);
  }
  return toDateValue(
    normalizeDateParts({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    }),
  );
}

function normalizeRenderMode(value: unknown): RenderMode {
  return value === 'immediate' ? 'immediate' : 'debounced';
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => typeof entryValue === 'string')
      .map(([key, entryValue]) => [key.trim(), (entryValue as string).trim()])
      .filter(([key, entryValue]) => key && entryValue),
  );
}

function normalizeSettings(value: unknown): ControllerSettings {
  const record = isRecord(value) ? value : {};
  const rawEntries = normalizeStringMap(record.entries);
  const entries = createDefaultEntryMap();

  for (const id of CONTROLLED_ENTRY_IDS) {
    entries[id] = rawEntries[id] || id;
  }

  return {
    enabled: coerceBoolean(record.enabled, true),
    worldbook:
      typeof record.worldbook === 'string' && record.worldbook.trim()
        ? record.worldbook.trim()
        : DEFAULT_WORLDBOOK_NAME,
    render: normalizeRenderMode(record.render),
    debug: coerceBoolean(record.debug, false),
    entries,
    entry_worldbooks: normalizeStringMap(record.entry_worldbooks),
  };
}

function persistableSettings(settings: ControllerSettings): ControllerSettings {
  return {
    enabled: settings.enabled,
    worldbook: settings.worldbook,
    render: settings.render,
    debug: settings.debug,
    entries: settings.entries,
    entry_worldbooks: settings.entry_worldbooks,
  };
}

function readSettings(persist = false): ControllerSettings {
  const scriptVariables = getVariables({ type: 'script' });
  const rawValue = scriptVariables[SETTINGS_KEY];
  const settings = normalizeSettings(rawValue);
  const nextValue = persistableSettings(settings);

  if (persist && !_.isEqual(rawValue, nextValue)) {
    updateVariablesWith(variables => _.set(variables, SETTINGS_KEY, nextValue), { type: 'script' });
  }

  return settings;
}

function readStoryDate(): DateParts {
  const chatVariables = getVariables({ type: 'chat' });
  return normalizeDateParts(chatVariables[STORY_DATE_KEY]);
}

function getActiveEntryIds(storyDate: DateParts, rules: CompiledDateRule[] = COMPILED_DATE_RULES): Set<string> {
  const currentDateValue = toDateValue(storyDate);
  const activeIds = new Set<string>();

  for (const rule of rules) {
    if (currentDateValue < rule.fromValue) {
      continue;
    }
    if (rule.toValue != null && currentDateValue > rule.toValue) {
      continue;
    }
    rule.entries.forEach(id => activeIds.add(id));
  }

  return activeIds;
}

function getPreferredWorldbookName(settings: ControllerSettings): string | null {
  if (settings.worldbook) {
    return settings.worldbook;
  }

  const chatWorldbookName = getChatWorldbookName('current');
  if (chatWorldbookName) {
    return chatWorldbookName;
  }

  try {
    const charWorldbooks = getCharWorldbookNames('current');
    if (charWorldbooks.primary) {
      return charWorldbooks.primary;
    }
    if (charWorldbooks.additional.length > 0) {
      return charWorldbooks.additional[0];
    }
  } catch (error) {
    console.warn('[story-date-worldbook-controller] unable to read current character worldbooks:', error);
  }

  const worldbookNames = getWorldbookNames();
  return worldbookNames.length === 1 ? worldbookNames[0] : null;
}

function buildEntryTargets(settings: ControllerSettings, activeIds: Set<string>): { targets: EntryTarget[]; warnings: string[] } {
  const defaultWorldbookName = getPreferredWorldbookName(settings);
  const targets: EntryTarget[] = [];
  const warnings: string[] = [];
  const seenTargets = new Map<string, string[]>();

  for (const id of CONTROLLED_ENTRY_IDS) {
    const entryName = settings.entries[id]?.trim() || id;
    const worldbookName = (settings.entry_worldbooks[id] || defaultWorldbookName || '').trim();

    if (!worldbookName) {
      warnings.push(`未能确定 ${id} 所在世界书，请在 ${SETTINGS_KEY}.worldbook 中填写世界书名。`);
      continue;
    }

    const targetKey = `${worldbookName}\u0000${entryName}`;
    const ids = seenTargets.get(targetKey) ?? [];
    ids.push(id);
    seenTargets.set(targetKey, ids);

    targets.push({
      id,
      entryName,
      worldbookName,
      shouldEnable: activeIds.has(id),
    });
  }

  for (const [targetKey, ids] of seenTargets) {
    if (ids.length > 1) {
      const [worldbookName, entryName] = targetKey.split('\u0000');
      warnings.push(`配置中 ${ids.join('、')} 都指向「${worldbookName} / ${entryName}」，将按任一编号启用则开启处理。`);
    }
  }

  return { targets, warnings };
}

function groupTargetsByWorldbook(targets: EntryTarget[]): Map<string, EntryTarget[]> {
  const grouped = new Map<string, EntryTarget[]>();
  for (const target of targets) {
    const existing = grouped.get(target.worldbookName) ?? [];
    existing.push(target);
    grouped.set(target.worldbookName, existing);
  }
  return grouped;
}

async function applyTargetsToWorldbook(
  worldbookName: string,
  targets: EntryTarget[],
  render: RenderMode,
): Promise<{ changed: number; checked: number; warnings: string[] }> {
  const warnings: string[] = [];
  const worldbook = await getWorldbook(worldbookName);
  const entriesByName = new Map<string, WorldbookEntry[]>();
  const desiredEnabledByUid = new Map<number, { enabled: boolean; ids: string[]; name: string }>();

  for (const entry of worldbook) {
    const entries = entriesByName.get(entry.name) ?? [];
    entries.push(entry);
    entriesByName.set(entry.name, entries);
  }

  for (const target of targets) {
    const matches = entriesByName.get(target.entryName) ?? [];
    if (matches.length === 0) {
      warnings.push(`世界书「${worldbookName}」中找不到条目「${target.entryName}」（${target.id}）。`);
      continue;
    }
    if (matches.length > 1) {
      warnings.push(`世界书「${worldbookName}」中有多个同名条目「${target.entryName}」（${target.id}），已跳过以免误控。`);
      continue;
    }

    const entry = matches[0];
    const existing = desiredEnabledByUid.get(entry.uid);
    desiredEnabledByUid.set(entry.uid, {
      enabled: (existing?.enabled ?? false) || target.shouldEnable,
      ids: existing ? [...existing.ids, target.id] : [target.id],
      name: target.entryName,
    });
  }

  let changed = 0;
  const nextWorldbook = worldbook.map(entry => {
    const desired = desiredEnabledByUid.get(entry.uid);
    if (!desired || entry.enabled === desired.enabled) {
      return entry;
    }
    changed += 1;
    return {
      ...entry,
      enabled: desired.enabled,
    };
  });

  if (changed > 0) {
    await replaceWorldbook(worldbookName, nextWorldbook, { render });
  }

  return { changed, checked: desiredEnabledByUid.size, warnings };
}

function debugLog(settings: ControllerSettings, message: string, payload?: unknown) {
  if (!settings.debug) {
    return;
  }
  console.info(`[story-date-worldbook-controller] ${message}`, payload ?? '');
}

function writeStatus(report: SyncReport) {
  updateVariablesWith(variables => _.set(variables, STATUS_KEY, report), { type: 'script' });
}

async function syncWorldbookEntries(reason: string, manual = false): Promise<SyncReport> {
  const settings = readSettings(true);
  const storyDate = readStoryDate();
  const date = formatIsoDate(storyDate);
  const warnings: string[] = [];
  let changedEntries = 0;
  let checkedEntries = 0;

  if (!settings.enabled) {
    const report = {
      reason,
      date,
      active_ids: [],
      changed_entries: 0,
      checked_entries: 0,
      warnings: ['日期世界书条目控制器已在脚本变量中关闭。'],
      last_synced_at: new Date().toISOString(),
    };
    writeStatus(report);
    return report;
  }

  const activeIds = getActiveEntryIds(storyDate);
  const { targets, warnings: targetWarnings } = buildEntryTargets(settings, activeIds);
  warnings.push(...targetWarnings);

  for (const [worldbookName, worldbookTargets] of groupTargetsByWorldbook(targets)) {
    try {
      const result = await applyTargetsToWorldbook(worldbookName, worldbookTargets, settings.render);
      changedEntries += result.changed;
      checkedEntries += result.checked;
      warnings.push(...result.warnings);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warnings.push(`同步世界书「${worldbookName}」失败：${detail}`);
    }
  }

  const report = {
    reason,
    date,
    active_ids: [...activeIds],
    changed_entries: changedEntries,
    checked_entries: checkedEntries,
    warnings,
    last_synced_at: new Date().toISOString(),
  };
  writeStatus(report);
  debugLog(settings, 'sync report', report);

  if (manual) {
    if (warnings.length > 0) {
      toastr.warning(`同步完成，但有 ${warnings.length} 条提醒，请查看脚本变量 ${STATUS_KEY}。`, '日期世界书');
    } else {
      toastr.success(`已按 ${date} 同步，改动 ${changedEntries} 个条目。`, '日期世界书');
    }
  }

  return report;
}

function queueSync(reason: string, manual = false, delayMs = 150) {
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

async function flushQueuedSync() {
  if (syncRunning) {
    queueSync(queuedReason || 'rerun after active sync', queuedManual, 1_000);
    return;
  }

  const reason = queuedReason || 'queued sync';
  const manual = queuedManual;
  queuedReason = '';
  queuedManual = false;
  syncRunning = true;

  try {
    await syncWorldbookEntries(reason, manual);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[story-date-worldbook-controller] sync failed:', detail);
    if (manual) {
      toastr.error(detail, '日期世界书');
    }
  } finally {
    syncRunning = false;
  }
}

function queueSyncSeries(reason: string) {
  for (const delay of DEFAULT_SYNC_DELAYS_MS) {
    const timer = window.setTimeout(() => queueSync(reason, false, 0), delay);
    syncTimers.push(timer);
  }
}

function clearTimers() {
  if (debounceTimer != null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  syncTimers.forEach(timer => window.clearTimeout(timer));
  syncTimers = [];
}

function mountStoryDateWorldbookController() {
  appendInexistentScriptButtons([{ name: SCRIPT_BUTTON_NAME, visible: true }]);
  readSettings(true);
  queueSync('startup', false, 100);

  const stopHandles = [
    eventOn(
      tavern_events.CHAT_CHANGED,
      errorCatched(() => queueSyncSeries('chat changed')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_RECEIVED,
      errorCatched(() => queueSyncSeries('message received')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_UPDATED,
      errorCatched(() => queueSyncSeries('message updated')),
    ).stop,
    eventOn(
      tavern_events.MESSAGE_EDITED,
      errorCatched(() => queueSyncSeries('message edited')),
    ).stop,
    eventOn(
      tavern_events.GENERATION_ENDED,
      errorCatched(() => queueSyncSeries('generation ended')),
    ).stop,
    eventOn(
      getButtonEvent(SCRIPT_BUTTON_NAME),
      errorCatched(() => queueSync('manual button sync', true, 0)),
    ).stop,
  ];

  $(window).on(`pagehide${PAGE_SCOPE}`, () => {
    stopHandles.forEach(stop => stop());
    clearTimers();
    $(window).off(PAGE_SCOPE);
  });
}

$(() => {
  errorCatched(mountStoryDateWorldbookController)();
});
