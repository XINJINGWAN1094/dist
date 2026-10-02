import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import YAML from 'yaml';
import {
  applyEquipmentCommand,
  fixedEquipmentBonuses,
  gameplayPublicView,
  protectEquipmentVariables,
} from '../src/角色卡玩法规则包/equipment.ts';

globalThis.z = z;
const { Schema } = await import('../src/角色卡玩法规则包/schema.ts');
const state = Schema.parse({});
const seeded = YAML.parse(
  await readFile(new URL('../src/角色卡玩法规则包/世界书/变量/初始人物.yaml', import.meta.url), 'utf8'),
);
Object.assign(state.玩法, seeded);
const [knight, other] = Object.keys(state.玩法.人物);
const before = structuredClone(state);
const ref = { 库存ID: 'fixture', 物品ID: 'staff' };
state.玩法.库存.fixture = {
  所属: '离线校验',
  资金: 0,
  补给: 0,
  材料: 0,
  物品: {
    staff: {
      名称: '校验法杖',
      数量: 2,
      固定规格: '仅测试路线限制，不作为正式数值',
      宝物: {
        大类: '武器',
        子类: '法杖',
        适用路线: '法力',
        使用方式: '佩戴',
        归属人物ID: null,
        固定加成: { 攻击: 13, 防御: 7 },
      },
    },
  },
};
applyEquipmentCommand(state.玩法, { type: 'equip', ref, personId: knight, slot: 'weapon', splitId: 'one' });
const equippedRef = { 库存ID: 'fixture', 物品ID: 'one' };
assert.equal(state.玩法.库存.fixture.物品.staff.数量, 1);
assert.deepEqual(state.玩法.人物[knight].装备.weapon, equippedRef);
assert.deepEqual(fixedEquipmentBonuses(state.玩法, knight), { 攻击: 0, 防御: 0 }, '骑士佩戴法杖没有任何固定增幅');
assert.equal(Schema.safeParse(state).success, true);
const duplicate = structuredClone(state);
duplicate.玩法.人物[other].装备 = { weapon: equippedRef };
assert.equal(Schema.safeParse(duplicate).success, false, '不能让两人共享同一件装备');
const missing = structuredClone(state);
delete missing.玩法.库存.fixture.物品.one;
assert.equal(Schema.safeParse(missing).success, false, '不能保留失效的装备引用');
const mage = structuredClone(state);
mage.玩法.人物[knight].路线.法力 = structuredClone(mage.玩法.人物[knight].路线.斗气);
delete mage.玩法.人物[knight].路线.斗气;
assert.deepEqual(fixedEquipmentBonuses(mage.玩法, knight), { 攻击: 13, 防御: 7 });
const view = gameplayPublicView(state);
assert.deepEqual(view.玩法.人物[knight].当前武器, ['校验法杖']);
assert.equal(view.玩法.人物[knight].装备, undefined);
assert.deepEqual(view.玩法.库存.fixture.物品, {});
assert.equal(view.玩法正文, undefined);
const aiUpdate = structuredClone(state);
delete aiUpdate.玩法.库存.fixture;
aiUpdate.玩法.人物[knight].装备 = {};
aiUpdate.玩法.人物[knight].生命.当前 -= 1;
protectEquipmentVariables(aiUpdate, state);
assert.deepEqual(aiUpdate.玩法.人物[knight].装备, state.玩法.人物[knight].装备);
assert.deepEqual(aiUpdate.玩法.库存.fixture, state.玩法.库存.fixture);
assert.equal(aiUpdate.玩法.人物[knight].生命.当前, state.玩法.人物[knight].生命.当前 - 1);
applyEquipmentCommand(state.玩法, {
  type: 'equip',
  ref: equippedRef,
  personId: other,
  slot: 'weapon',
  splitId: 'unused',
});
assert.equal(state.玩法.人物[knight].装备.weapon, undefined);
assert.equal(state.玩法.库存.fixture.物品.one.宝物.归属人物ID, other);
applyEquipmentCommand(state.玩法, { type: 'unequip', ref: equippedRef });
assert.equal(state.玩法.人物[other].装备.weapon, undefined);
applyEquipmentCommand(state.玩法, {
  type: 'equip',
  ref: equippedRef,
  personId: other,
  slot: 'weapon',
  splitId: 'unused',
});
applyEquipmentCommand(state.玩法, { type: 'discard', ref: equippedRef, quantity: 1 });
assert.equal(state.玩法.库存.fixture.物品.one, undefined);
assert.equal(state.玩法.人物[other].装备.weapon, undefined);
assert.deepEqual(fixedEquipmentBonuses(state.玩法, other), { 攻击: 0, 防御: 0 });
assert.equal(Schema.safeParse(state).success, true);
assert.deepEqual(Schema.parse(before), before, '旧存档不凭空新增装备');
console.log('PASS: 拆堆、唯一归属、转交、卸下、丢弃、路线限制、AI 精简视图与脚本字段保护；仅离线夹具。');
