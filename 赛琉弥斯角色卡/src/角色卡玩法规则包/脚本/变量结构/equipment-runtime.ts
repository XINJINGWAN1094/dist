import {
  applyEquipmentCommand,
  gameplayPublicView,
  protectEquipmentVariables,
  type EquipmentCommand,
} from '../../equipment';
import {
  addProgressionToView,
  consumeCultivation,
  protectProgression,
  recalculatePanel,
  settleGameplay,
} from '../../progression';
import { Schema } from '../../schema';
import { synchronizeMapTime } from './map-time';
import { replyParentMessagesForGenerationV2 } from '../../../赛琉弥斯地图/phase2/branchHistory';

const API_KEY = '__selyumis_equipment_v1__';
/** 宿主仅共享操作函数。写入串行化，每次重读聊天和有效分支，不共享人物余额。 */
export function installEquipmentRuntime(): () => Promise<void> {
  let stopped = false;
  let generating = false;
  let queue = Promise.resolve();
  const host = window.parent as unknown as Record<string, unknown>;
  const identity = () => JSON.stringify([SillyTavern.characterId, SillyTavern.getCurrentChatId()]);
  const notify = () => window.parent.dispatchEvent(new Event('selyumis-equipment-changed'));
  function readCurrent(generationType?: string) {
    const messages = getChatMessages('0-{{lastMessageId}}', { include_swipes: true });
    const parents = replyParentMessagesForGenerationV2(messages, generationType);
    const message = messages
      .filter(m => parents.some(p => p.message_id === m.message_id))
      .findLast(m => m.swipes_data[m.swipe_id]?.stat_data?.玩法);
    if (!message) throw new Error('当前分支尚未建立玩法变量。');
    const data = _.cloneDeep(Mvu.getMvuData({ type: 'message', message_id: message.message_id }));
    const token = JSON.stringify([identity(), messages.map(m => [m.message_id, m.swipe_id]), data.stat_data]);
    return { token, data, parents, messageId: message.message_id };
  }
  function buildView(data: Mvu.MvuData) {
    const view = gameplayPublicView(data.stat_data);
    addProgressionToView(view, data.stat_data.玩法);
    data.stat_data.玩法正文 = view;
  }
  function synchronize(data: Mvu.MvuData, parents: ReturnType<typeof replyParentMessagesForGenerationV2>) {
    synchronizeMapTime(data, parents);
    settleGameplay(data.stat_data.玩法, identity());
    buildView(data);
    Schema.parse(data.stat_data);
  }
  function enqueue(work: () => Promise<void>) {
    const owner = identity();
    const result = queue.then(async () => {
      if (stopped || owner !== identity()) throw new Error('聊天已切换，本次操作未提交。');
      await work();
    });
    queue = result.catch(() => {});
    return result;
  }
  async function refresh(generationType?: string) {
    try {
      await enqueue(async () => {
        const current = readCurrent(generationType),
          before = structuredClone(current.data.stat_data);
        synchronize(current.data, current.parents);
        if (_.isEqual(before, current.data.stat_data)) return;
        if (current.token !== readCurrent(generationType).token) return;
        await Mvu.replaceMvuData(current.data, { type: 'message', message_id: current.messageId });
      });
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          ['当前分支尚未建立玩法变量。', '聊天已切换，本次操作未提交。'].includes(error.message)
        )
      )
        console.warn('[人物与宝物] 变量同步失败', error);
    } finally {
      notify();
    }
  }
  const api = {
    version: 2,
    read() {
      const current = readCurrent();
      return { token: current.token, gameplay: structuredClone(current.data.stat_data.玩法) };
    },
    async apply(command: EquipmentCommand, expectedToken: string) {
      await enqueue(async () => {
        if (generating) throw new Error('正文正在生成，请结束后再操作装备。');
        const current = readCurrent();
        if (current.token !== expectedToken) throw new Error('聊天或分支状态已改变，请刷新后重试。');
        // 在旧装备与旧成长速度下先结清时间，再原子提交本次变更。
        synchronize(current.data, current.parents);
        if (command.type === 'consume')
          consumeCultivation(current.data.stat_data.玩法, command.ref, command.personId, command.route);
        else applyEquipmentCommand(current.data.stat_data.玩法, command);
        for (const id of Object.keys(current.data.stat_data.玩法.人物))
          recalculatePanel(current.data.stat_data.玩法, id);
        buildView(current.data);
        Schema.parse(current.data.stat_data);
        if (readCurrent().token !== expectedToken) throw new Error('存档已改变，本次操作未提交。');
        await Mvu.replaceMvuData(current.data, { type: 'message', message_id: current.messageId });
      });
      notify();
      return api.read();
    },
  };
  host[API_KEY] = api;
  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_ENDED, (next, before) => {
    protectEquipmentVariables(next.stat_data, before.stat_data);
    protectProgression(next.stat_data, before.stat_data);
    if (next.stat_data.玩法?.人物 && next.stat_data.玩法?.库存 && next.stat_data.玩法?.时间)
      settleGameplay(next.stat_data.玩法, identity());
  });
  eventMakeLast(Mvu.events.VARIABLE_UPDATE_ENDED, data => {
    if (data.stat_data.玩法?.人物 && data.stat_data.玩法?.库存 && data.stat_data.玩法?.时间)
      settleGameplay(data.stat_data.玩法, identity());
    buildView(data);
  });
  eventMakeLast(Mvu.events.VARIABLE_INITIALIZED, data => {
    if (data.stat_data.玩法) {
      settleGameplay(data.stat_data.玩法, identity());
      buildView(data);
    }
  });
  for (const event of [
    tavern_events.CHAT_CHANGED,
    tavern_events.MESSAGE_SWIPED,
    tavern_events.MESSAGE_EDITED,
    tavern_events.MESSAGE_DELETED,
  ])
    eventMakeLast(event, () => refresh());
  eventMakeLast(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dryRun) => {
    if (dryRun) return undefined;
    generating = true;
    return refresh(type);
  });
  for (const event of [tavern_events.GENERATION_ENDED, tavern_events.GENERATION_STOPPED, tavern_events.CHAT_CHANGED])
    eventMakeLast(event, () => {
      generating = false;
      return refresh();
    });
  // 仅检查权威剧情时钟是否前进，不把现实经过的 30 秒换成修为。
  const timer = window.setInterval(() => { if (!generating) void refresh(); }, 30_000);
  $(window).one('pagehide', () => {
    stopped = true;
    window.clearInterval(timer);
    if (host[API_KEY] === api) delete host[API_KEY];
    notify();
  });
  void refresh();
  return () => refresh();
}
