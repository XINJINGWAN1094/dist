import {
  branchPointFromMessages,
  replyParentMessagesForGenerationV2,
  restoreStoreForBranch,
} from '../../../赛琉弥斯地图/phase2/branchHistory';
import { ChatStoreV2Schema, type BranchPoint } from '../../../赛琉弥斯地图/phase2/model';

const CLOCK_RUNTIME_KEY = '__selyumis_clock_runtime_v1__';
const MAP_STORE_KEY = '赛琉弥斯地图V2';

/** Read the selected branch only. This never starts a clock or changes the map store. */
export function mapTimeForBranch(rawStore: unknown, branch: BranchPoint): string | null {
  const parsed = ChatStoreV2Schema.safeParse(rawStore);
  if (!parsed.success) return null;
  return restoreStoreForBranch(parsed.data, branch).store.current.world_time;
}

function clockIsActive(): boolean {
  const host = window.parent as unknown as Record<string, unknown>;
  return Boolean((host[CLOCK_RUNTIME_KEY] as { service?: unknown } | undefined)?.service)
    || _.has(getVariables({ type: 'chat' }), MAP_STORE_KEY);
}

function selectedBranch(): BranchPoint {
  return branchPointFromMessages(getChatMessages('0-{{lastMessageId}}', { include_swipes: true }));
}

function currentMapTime(): string | null {
  return mapTimeForBranch(getVariables({ type: 'chat' })[MAP_STORE_KEY], selectedBranch());
}

export function setGameplayTime(data: Mvu.MvuData, time: string | null, previous?: Mvu.MvuData): boolean {
  if (!_.isPlainObject(data.stat_data)) return false;
  if (!_.isPlainObject(_.get(data, 'stat_data.玩法'))) _.set(data, 'stat_data.玩法', {});
  let gameplayTime = _.get(data, 'stat_data.玩法.时间');
  if (!_.isPlainObject(gameplayTime)) {
    const previousTime = _.get(previous, 'stat_data.玩法.时间');
    gameplayTime = _.isPlainObject(previousTime) ? _.cloneDeep(previousTime) : { 已结束交锋: 0 };
    _.set(data, 'stat_data.玩法.时间', gameplayTime);
    gameplayTime.剧情时间 = time;
    return true;
  }
  if (gameplayTime.剧情时间 === time) return false;
  gameplayTime.剧情时间 = time;
  return true;
}

export function installMapTimeBridge(): void {
  let stopped = false;
  let timer: number | undefined;
  let writing = false;
  let rerun = false;

  const identity = () => JSON.stringify([SillyTavern.characterId, SillyTavern.getCurrentChatId()]);

  async function synchronizeLatest(generationType?: string): Promise<void> {
    if (stopped || !clockIsActive()) return;
    if (writing) {
      rerun = true;
      return;
    }
    const selected = getChatMessages('0-{{lastMessageId}}', { include_swipes: true });
    const parents = replyParentMessagesForGenerationV2(selected, generationType);
    const message = selected.filter(m => parents.some(p => p.message_id === m.message_id))
      .findLast(m => _.has(m.swipes_data[m.swipe_id], 'stat_data.玩法.时间'));
    if (!message) return;
    // Do not initialize an existing chat or write a previous message to fill a missing latest state.
    if (!_.has(message.swipes_data[message.swipe_id], 'stat_data.玩法.时间')) return;
    const time = mapTimeForBranch(getVariables({ type: 'chat' })[MAP_STORE_KEY], branchPointFromMessages(parents));
    if (time === null) return;
    const chatIdentity = identity();
    const branchIdentity = JSON.stringify(selectedBranch().tokens);
    const data = _.cloneDeep(Mvu.getMvuData({ type: 'message', message_id: message.message_id }));
    if (!setGameplayTime(data, time)) return;
    if (chatIdentity !== identity() || branchIdentity !== JSON.stringify(selectedBranch().tokens)) return;
    writing = true;
    try {
      await Mvu.replaceMvuData(data, { type: 'message', message_id: message.message_id });
    } finally {
      writing = false;
      if (rerun && !stopped) {
        rerun = false;
        queueSynchronization();
      }
    }
  }

  function queueSynchronization(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    const chatIdentity = identity();
    // Map report settlement uses a zero-delay task; read its committed result after that task.
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!stopped && chatIdentity === identity()) {
        void synchronizeLatest().catch(error => console.error('[角色卡玩法] 地图时间同步失败', error));
      }
    }, 50);
  }

  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_ENDED, (data, previous) => {
    if (!clockIsActive()) return;
    const time = currentMapTime() ?? _.get(previous, 'stat_data.玩法.时间.剧情时间', null);
    // Runs before schema validation. AI cannot overwrite the clock-owned field.
    setGameplayTime(data, time, previous);
  });
  eventOn(Mvu.events.VARIABLE_INITIALIZED, queueSynchronization);
  eventMakeLast(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dryRun) => {
    if (!dryRun) return synchronizeLatest(type);
    return undefined;
  });
  for (const event of [
    tavern_events.GENERATION_ENDED,
    tavern_events.MESSAGE_SWIPED,
    tavern_events.MESSAGE_EDITED,
    tavern_events.MESSAGE_DELETED,
    tavern_events.CHAT_CHANGED,
  ]) eventMakeLast(event, queueSynchronization);

  $(window).on('pagehide', () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  });
  queueSynchronization();
}
