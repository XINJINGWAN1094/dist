import {
  applyEquipmentCommand,
  gameplayPublicView,
  protectEquipmentVariables,
  type EquipmentCommand,
} from '../../equipment';
import { Schema } from '../../schema';
import { replyParentMessagesForGenerationV2 } from '../../../赛琉弥斯地图/phase2/branchHistory';

const API_KEY = '__selyumis_equipment_v1__';
/** 共享的只有操作函数。每次都重读当前聊天／有效 swipe，不在全局保留存档。 */
export function installEquipmentRuntime(): void {
  let busy = false;
  let stopped = false;
  const host = window.parent as unknown as Record<string, unknown>;
  const notify = () => window.parent.dispatchEvent(new Event('selyumis-equipment-changed'));
  const identity = () => JSON.stringify([SillyTavern.characterId, SillyTavern.getCurrentChatId()]);
  function readCurrent(generationType?: string) {
    const messages = getChatMessages('0-{{lastMessageId}}', { include_swipes: true });
    const parents = replyParentMessagesForGenerationV2(messages, generationType);
    const message = messages
      .filter(m => parents.some(p => p.message_id === m.message_id))
      .findLast(m => m.swipes_data[m.swipe_id]?.stat_data?.玩法);
    if (!message) throw new Error('当前分支尚未建立玩法变量。');
    const data = _.cloneDeep(Mvu.getMvuData({ type: 'message', message_id: message.message_id }));
    const token = JSON.stringify([identity(), messages.map(m => [m.message_id, m.swipe_id]), data.stat_data.玩法]);
    return { token, data, messageId: message.message_id };
  }
  const api = {
    version: 1,
    read() {
      const current = readCurrent();
      return { token: current.token, gameplay: structuredClone(current.data.stat_data.玩法) };
    },
    async apply(command: EquipmentCommand, expectedToken: string) {
      if (stopped || busy) throw new Error('正在保存，请稍后重试。');
      const current = readCurrent();
      if (current.token !== expectedToken) throw new Error('聊天或分支状态已改变，请刷新后重试。');
      applyEquipmentCommand(current.data.stat_data.玩法, command);
      Schema.parse(current.data.stat_data); // 只校验，不用解析结果覆盖其他模块数据。
      current.data.stat_data.玩法正文 = gameplayPublicView(current.data.stat_data);
      if (readCurrent().token !== expectedToken) throw new Error('存档已改变，本次操作未提交。');
      busy = true;
      try {
        await Mvu.replaceMvuData(current.data, { type: 'message', message_id: current.messageId });
      } finally {
        busy = false;
        notify();
      }
      return api.read();
    },
  };
  host[API_KEY] = api;
  eventMakeFirst(Mvu.events.VARIABLE_UPDATE_ENDED, (next, before) => {
    protectEquipmentVariables(next.stat_data, before.stat_data);
  });
  eventMakeLast(Mvu.events.VARIABLE_UPDATE_ENDED, data => {
    data.stat_data.玩法正文 = gameplayPublicView(data.stat_data);
  });
  async function refreshPublicView(generationType?: string) {
    if (stopped || busy) return;
    try {
      const current = readCurrent(generationType);
      const view = gameplayPublicView(current.data.stat_data);
      if (_.isEqual(view, current.data.stat_data.玩法正文)) return;
      current.data.stat_data.玩法正文 = view;
      if (current.token !== readCurrent(generationType).token) return;
      busy = true;
      try {
        await Mvu.replaceMvuData(current.data, { type: 'message', message_id: current.messageId });
      } finally {
        busy = false;
      }
    } catch (error) {
      // 没有初始化的聊天不补空存档。
      if (!(error instanceof Error && error.message === '当前分支尚未建立玩法变量。'))
        console.warn('[人物与宝物] 正文视图更新失败', error);
    } finally {
      notify();
    }
  }
  for (const event of [
    Mvu.events.VARIABLE_INITIALIZED,
    tavern_events.CHAT_CHANGED,
    tavern_events.MESSAGE_SWIPED,
    tavern_events.MESSAGE_EDITED,
    tavern_events.MESSAGE_DELETED,
    tavern_events.GENERATION_ENDED,
  ])
    eventMakeLast(event, () => refreshPublicView());
  eventMakeLast(tavern_events.GENERATION_AFTER_COMMANDS, (type, _options, dryRun) => {
    if (!dryRun) return refreshPublicView(type);
    return undefined;
  });
  $(window).one('pagehide', () => {
    stopped = true;
    if (host[API_KEY] === api) delete host[API_KEY];
    notify();
  });
  void refreshPublicView();
}
