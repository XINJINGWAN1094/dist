import { branchPointFromMessages, restoreStoreForBranch } from '../../../赛琉弥斯地图/phase2/branchHistory';
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
  return (
    Boolean((host[CLOCK_RUNTIME_KEY] as { service?: unknown } | undefined)?.service) ||
    _.has(getVariables({ type: 'chat' }), MAP_STORE_KEY)
  );
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

/** 由唯一的玩法写入入口调用，避免时间同步覆盖装备或成长结果。 */
export function synchronizeMapTime(
  data: Mvu.MvuData,
  parents: Parameters<typeof branchPointFromMessages>[0],
  previous?: Mvu.MvuData,
): void {
  if (!clockIsActive()) return;
  const time = mapTimeForBranch(getVariables({ type: 'chat' })[MAP_STORE_KEY], branchPointFromMessages(parents));
  setGameplayTime(data, time ?? _.get(previous ?? data, 'stat_data.玩法.时间.剧情时间', null), previous);
}

export function installMapTimeBridge(refresh: () => Promise<void>): void {
  let timer: number | undefined;
  let stopped = false;
  function queueSynchronization(): void {
    if (timer !== undefined) window.clearTimeout(timer);
    const identity = JSON.stringify([SillyTavern.characterId, SillyTavern.getCurrentChatId()]);
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!stopped && identity === JSON.stringify([SillyTavern.characterId, SillyTavern.getCurrentChatId()]))
        void refresh().catch(error => console.error('[角色卡玩法] 时间与成长同步失败', error));
    }, 50);
  }
  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_ENDED, (data, previous) => {
    if (clockIsActive())
      setGameplayTime(data, currentMapTime() ?? _.get(previous, 'stat_data.玩法.时间.剧情时间', null), previous);
  });
  eventOn(Mvu.events.VARIABLE_INITIALIZED, queueSynchronization);
  for (const event of [
    tavern_events.GENERATION_ENDED,
    tavern_events.MESSAGE_SWIPED,
    tavern_events.MESSAGE_EDITED,
    tavern_events.MESSAGE_DELETED,
    tavern_events.CHAT_CHANGED,
  ])
    eventMakeLast(event, queueSynchronization);
  $(window).on('pagehide', () => {
    stopped = true;
    if (timer !== undefined) window.clearTimeout(timer);
  });
  queueSynchronization();
}
