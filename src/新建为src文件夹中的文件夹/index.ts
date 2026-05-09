const PAGE_SCOPE = '.thMapWorldbookBridge';
const SOURCE = '地图世界书联动器';
const DEFAULT_WORLDBOOK_NAME = '地图建筑';
const ARCHIVE_KEY = 'map_worldbook_bridge_archive';
const ARCHIVE_LIMIT = 300;

type BuildingSavedPayload = {
  slotId: string;
  direction: string;
  directionLabel: string;
  name: string;
  feature: string;
  specialRule: string;
};

type ResolveWorldbookNameOptions = {
  allowCreateWhenMissing?: boolean;
};

type SyncBuildingOptions = {
  worldbookName?: string;
  allowCreateWhenMissing?: boolean;
};

function buildEntryContent(payload: BuildingSavedPayload) {
  return [`建造名称：${payload.name}`, `功能：${payload.feature}`, payload.specialRule ? `特殊规则：${payload.specialRule}` : '']
    .filter(Boolean)
    .join('\n');
}

function buildEntryName(payload: BuildingSavedPayload) {
  return `${payload.name}（${payload.direction}）`;
}

function nowLocaleString() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function normalizePayload(raw: unknown): BuildingSavedPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const slotId = typeof candidate.slotId === 'string' ? candidate.slotId.trim() : '';
  const direction = typeof candidate.direction === 'string' ? candidate.direction.trim() : '';
  const directionLabel = typeof candidate.directionLabel === 'string' ? candidate.directionLabel.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const feature = typeof candidate.feature === 'string' ? candidate.feature.trim() : '';
  const specialRule = typeof candidate.specialRule === 'string' ? candidate.specialRule.trim() : '';

  if (!slotId || !direction || !name || !feature) {
    return null;
  }

  return { slotId, direction, directionLabel, name, feature, specialRule };
}

function dedupeArchiveRecords(records: BuildingSavedPayload[]) {
  const recordMap = new Map<string, BuildingSavedPayload>();
  for (const record of records) {
    if (recordMap.has(record.slotId)) {
      recordMap.delete(record.slotId);
    }
    recordMap.set(record.slotId, record);
  }
  return Array.from(recordMap.values());
}

function normalizeArchiveRecords(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as BuildingSavedPayload[];
  }

  const records = value.map(item => normalizePayload(item)).filter((item): item is BuildingSavedPayload => item !== null);
  return dedupeArchiveRecords(records).slice(-ARCHIVE_LIMIT);
}

function getArchiveRecords() {
  const chatVariables = getVariables({ type: 'chat' });
  return normalizeArchiveRecords(chatVariables?.[ARCHIVE_KEY]);
}

function setArchiveRecords(records: BuildingSavedPayload[]) {
  const chatVariables = getVariables({ type: 'chat' });
  replaceVariables(
    {
      ...chatVariables,
      [ARCHIVE_KEY]: normalizeArchiveRecords(records),
    },
    { type: 'chat' },
  );
}

function upsertArchiveRecord(payload: BuildingSavedPayload) {
  const archiveRecords = getArchiveRecords();
  const nextRecords = archiveRecords.filter(record => record.slotId !== payload.slotId);
  nextRecords.push(payload);
  setArchiveRecords(nextRecords);
}

function buildEntry(payload: BuildingSavedPayload, order: number) {
  const primaryKeywords = [payload.name, payload.direction];

  return {
    name: buildEntryName(payload),
    enabled: true,
    strategy: {
      type: 'selective',
      // 建筑名和方向都放在主关键字中，逗号仅作为 UI 展示的分隔符
      keys: primaryKeywords,
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: { type: 'before_character_definition', role: 'system', depth: 4, order },
    content: buildEntryContent(payload),
    probability: 100,
    recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null },
    extra: {
      source: SOURCE,
      slotId: payload.slotId,
      direction: payload.direction,
      keywordsCsv: primaryKeywords.join(','),
      scriptId: getScriptId(),
      updatedAt: nowLocaleString(),
    },
  };
}

function getPreferredWorldbookName() {
  const chatWorldbookName = getChatWorldbookName('current');
  if (chatWorldbookName) {
    return chatWorldbookName;
  }

  const charWorldbooks = getCharWorldbookNames('current');
  return charWorldbooks.primary ?? charWorldbooks.additional[0] ?? null;
}

async function resolveTargetWorldbookName(options: ResolveWorldbookNameOptions = {}) {
  const worldbookName = getPreferredWorldbookName();
  if (worldbookName) {
    return worldbookName;
  }
  if (options.allowCreateWhenMissing === false) {
    return null;
  }
  return getOrCreateChatWorldbook('current', DEFAULT_WORLDBOOK_NAME);
}

function getNextEntryOrder(worldbook: WorldbookEntry[]) {
  return (
    worldbook
      .filter(entry => entry.extra?.source === SOURCE)
      .map(entry => Number(entry.position?.order))
      .filter(Number.isFinite)
      .reduce((maxOrder, order) => Math.max(maxOrder, order), 99) + 1
  );
}

function getSourceSlotIdSet(worldbook: WorldbookEntry[]) {
  const slotIds = worldbook
    .map(entry => {
      if (entry.extra?.source !== SOURCE) {
        return '';
      }
      return typeof entry.extra?.slotId === 'string' ? entry.extra.slotId.trim() : '';
    })
    .filter(Boolean);
  return new Set(slotIds);
}

async function syncBuildingToWorldbook(payload: BuildingSavedPayload, options: SyncBuildingOptions = {}) {
  const worldbookName =
    options.worldbookName ??
    (await resolveTargetWorldbookName({ allowCreateWhenMissing: options.allowCreateWhenMissing ?? true }));
  if (!worldbookName) {
    return null;
  }

  await updateWorldbookWith(
    worldbookName,
    worldbook => {
      const nextOrder = getNextEntryOrder(worldbook);
      let updated = false;
      const nextWorldbook = worldbook.map(entry => {
        if (entry.extra?.source === SOURCE && String(entry.extra?.slotId ?? '') === payload.slotId) {
          const currentOrder = Number(entry.position?.order);
          const replacement = buildEntry(payload, Number.isFinite(currentOrder) ? currentOrder : nextOrder);
          updated = true;
          return {
            ...entry,
            ...replacement,
            extra: { ...entry.extra, ...replacement.extra },
          };
        }
        return entry;
      });

      if (!updated) {
        nextWorldbook.push(buildEntry(payload, nextOrder));
      }

      return nextWorldbook;
    },
    { render: 'debounced' },
  );
  return worldbookName;
}

async function deleteSourceEntriesByWorldbookName(worldbookName: string) {
  await deleteWorldbookEntries(worldbookName, entry => entry.extra?.source === SOURCE, { render: 'debounced' });
}

async function removeStaleWorldbookEntries(worldbookName: string, archiveRecords: BuildingSavedPayload[]) {
  const slotIdSet = new Set(archiveRecords.map(record => record.slotId));
  await deleteWorldbookEntries(
    worldbookName,
    entry => {
      if (entry.extra?.source !== SOURCE) {
        return false;
      }

      const slotId = typeof entry.extra?.slotId === 'string' ? entry.extra.slotId.trim() : '';
      return !slotId || !slotIdSet.has(slotId);
    },
    { render: 'debounced' },
  );
}

async function syncArchiveRecords() {
  const archiveRecords = getArchiveRecords();
  const worldbookName = await resolveTargetWorldbookName({ allowCreateWhenMissing: archiveRecords.length > 0 });
  if (!worldbookName) {
    return null;
  }

  const worldbook = await getWorldbook(worldbookName);
  const sourceSlotIdSet = getSourceSlotIdSet(worldbook);
  const orderedRecords = sourceSlotIdSet.size === 0 ? [...archiveRecords].reverse() : archiveRecords;

  for (const record of orderedRecords) {
    await syncBuildingToWorldbook(record, { worldbookName, allowCreateWhenMissing: false });
  }

  await removeStaleWorldbookEntries(worldbookName, archiveRecords);
  return worldbookName;
}

async function notifyBuildingSaved(payload: BuildingSavedPayload) {
  const directionLabel = payload.directionLabel || `${payload.direction}方`;
  await createChatMessages(
    [
      {
        role: 'system',
        message: `已在房屋（${directionLabel}）建造${payload.name}。`,
        extra: {
          source: SOURCE,
          slotId: payload.slotId,
          direction: payload.direction,
          buildingName: payload.name,
        },
      },
    ],
    { insert_before: 'end', refresh: 'affected' },
  );
}

function mountMapWorldbookBridge() {
  const stopHandles = [] as Array<() => void>;
  let currentChatId = SillyTavern.getCurrentChatId();
  let activeWorldbookName: string | null = getPreferredWorldbookName();

  stopHandles.push(
    eventOn(tavern_events.CHAT_CHANGED, chatId => {
      if (currentChatId === chatId) {
        return;
      }

      currentChatId = chatId;
      const worldbookNameToClear = activeWorldbookName;
      errorCatched(async () => {
        if (worldbookNameToClear) {
          await deleteSourceEntriesByWorldbookName(worldbookNameToClear);
        }
        window.location.reload();
      })();
    }).stop,
  );

  stopHandles.push(
    eventOn('th_map_building_saved', rawPayload => {
      const payload = normalizePayload(rawPayload);
      if (!payload) {
        return;
      }

      errorCatched(async () => {
        upsertArchiveRecord(payload);
        const worldbookName = await syncBuildingToWorldbook(payload);
        if (worldbookName) {
          activeWorldbookName = worldbookName;
        }
        await notifyBuildingSaved(payload);
        toastr.success(`世界书已同步：${payload.name}（${payload.direction}）`, '地图世界书联动');
      })();
    }).stop,
  );

  errorCatched(async () => {
    activeWorldbookName = await syncArchiveRecords();
  })();

  $(window).on(`pagehide${PAGE_SCOPE}`, () => {
    stopHandles.forEach(stop => stop());
    $(window).off(PAGE_SCOPE);
  });
}

$(() => {
  errorCatched(mountMapWorldbookBridge)();
});
