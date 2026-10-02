import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import _ from 'lodash';
import YAML from 'yaml';

// 仅为 Node 离线导入补齐本仓 TS 扩展名，不连接浏览器或酒馆。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const ts = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(ts))) return next(ts.href, context);
    }
    return next(specifier, context);
  },
});
globalThis.z = z;
globalThis._ = _;
const { Schema } = await import('../src/角色卡玩法规则包/schema.ts');
const seed = YAML.parse(
  readFileSync(new URL('../src/角色卡玩法规则包/世界书/变量/初始人物.yaml', import.meta.url), 'utf8'),
);
function createData() {
  const stat_data = Schema.parse({});
  Object.assign(stat_data.玩法, structuredClone(seed));
  stat_data.玩法.时间.剧情时间 = '第1日00:00';
  stat_data.玩法.库存.test = {
    所属: '离线',
    资金: 0,
    补给: 0,
    材料: 0,
    物品: {
      weapon: {
        名称: '校验剑',
        数量: 2,
        固定规格: '仅测试',
        宝物: {
          大类: '武器',
          子类: '普通',
          适用路线: '斗气',
          使用方式: '佩戴',
          归属人物ID: null,
          品阶: 1,
          效果: [{ 类型: '固定属性', 属性: '攻击', 份额: 1 }],
        },
      },
    },
  };
  return { stat_data };
}
const storage = { a: [createData(), createData()], b: [createData()] };
let chat = 'a',
  swipe = 0;
const listeners = new Map();
const register = (event, fn, first) => {
  const list = listeners.get(event) ?? [];
  first ? list.unshift(fn) : list.push(fn);
  listeners.set(event, list);
  return { stop() {} };
};
globalThis.eventMakeFirst = (e, f) => register(e, f, true);
globalThis.eventMakeLast = (e, f) => register(e, f, false);
globalThis.eventOn = (e, f) => register(e, f, false);
const emit = async (e, ...args) => {
  for (const fn of listeners.get(e) ?? []) await fn(...args);
};
globalThis.SillyTavern = { characterId: 1, getCurrentChatId: () => chat };
let clockCheck;
globalThis.window = { parent: { dispatchEvent: () => true }, setInterval: fn => { clockCheck = fn; return 1; }, clearInterval() {} };
globalThis.$ = () => ({ one() {}, on() {} });
globalThis.getVariables = () => ({});
globalThis.getChatMessages = () => [
  {
    message_id: 0,
    role: 'assistant',
    name: 'fixture',
    is_hidden: false,
    swipe_id: swipe,
    swipes: storage[chat].map((_, i) => String(i)),
    swipes_data: storage[chat],
  },
];
globalThis.tavern_events = Object.fromEntries(
  [
    'CHAT_CHANGED',
    'MESSAGE_SWIPED',
    'MESSAGE_EDITED',
    'MESSAGE_DELETED',
    'GENERATION_ENDED',
    'GENERATION_STOPPED',
    'GENERATION_AFTER_COMMANDS',
  ].map(x => [x, x]),
);
globalThis.Mvu = {
  events: { VARIABLE_UPDATE_ENDED: 'update', VARIABLE_INITIALIZED: 'init' },
  getMvuData: () => structuredClone(storage[chat][swipe]),
  replaceMvuData: async data => {
    storage[chat][swipe] = structuredClone(data);
  },
};
const { installEquipmentRuntime } = await import('../src/角色卡玩法规则包/脚本/变量结构/equipment-runtime.ts');
const refresh = installEquipmentRuntime();
await refresh();
const api = window.parent.__selyumis_equipment_v1__;
const initial = api.read();
assert.equal(typeof clockCheck, 'function', '后台检查已注册且不读取现实时间累计修为');
assert.ok(initial.gameplay.人物.云.天赋);
assert.equal(initial.gameplay.人物.云.路线.斗气.修炼进度, 0);
assert.ok(storage.a[0].stat_data.玩法正文.玩法.人物.云.天赋);
const command = {
  type: 'equip',
  ref: { 库存ID: 'test', 物品ID: 'weapon' },
  personId: '云',
  slot: 'weapon',
  splitId: 'single',
};
const attempts = await Promise.allSettled([api.apply(command, initial.token), api.apply(command, initial.token)]);
assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1, '同时点击不能重复拆堆/提交');
assert.equal(storage.a[0].stat_data.玩法.库存.test.物品.weapon.数量, 1);
assert.equal(storage.a[0].stat_data.玩法.人物.云.无资源攻击, 6);
const stale = api.read().token;
swipe = 1;
await refresh();
await assert.rejects(api.apply(command, stale), /分支/);
assert.equal(storage.a[1].stat_data.玩法.人物.云.装备, undefined);
assert.deepEqual(
  storage.a[1].stat_data.玩法.人物.云.天赋,
  storage.a[0].stat_data.玩法.人物.云.天赋,
  '同人物平行同源建档抽签固定',
);
chat = 'b';
swipe = 0;
await refresh();
await assert.rejects(api.apply(command, stale), /分支/);
assert.equal(storage.b[0].stat_data.玩法.库存.test.物品.weapon.数量, 2);
await emit(tavern_events.GENERATION_AFTER_COMMANDS, 'normal', {}, false);
await assert.rejects(api.apply(command, api.read().token), /正文正在生成/);
await emit(tavern_events.GENERATION_STOPPED);
await api.apply(command, api.read().token);
const previous = structuredClone(storage.b[0]);
const next = structuredClone(previous);
next.stat_data.玩法.人物.云.天赋.等级 = '绝世';
next.stat_data.玩法.人物.云.路线.斗气.修炼进度 = 999999;
next.stat_data.玩法.人物.云.生命.当前 = 73;
await emit(Mvu.events.VARIABLE_UPDATE_ENDED, next, previous);
assert.deepEqual(next.stat_data.玩法.人物.云.天赋, previous.stat_data.玩法.人物.云.天赋);
assert.equal(next.stat_data.玩法.人物.云.路线.斗气.修炼进度, previous.stat_data.玩法.人物.云.路线.斗气.修炼进度);
assert.equal(next.stat_data.玩法.人物.云.生命.当前, 73);
assert.equal(next.stat_data.玩法正文.玩法.人物.云._成长, undefined);
assert.equal(Schema.safeParse(next.stat_data).success, true);
console.log('PASS: 当前分支写入、串行操作、跨聊天拒绝、生成中锁定与 MVU 字段保护；使用隔离内存宿主。');
