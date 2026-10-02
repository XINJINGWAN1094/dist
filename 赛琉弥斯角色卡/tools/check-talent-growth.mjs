import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import YAML from 'yaml';
import { z } from 'zod';
import { applyEquipmentCommand, gameplayPublicView } from '../src/角色卡玩法规则包/equipment.ts';
import {
  talentNames,
  talentWeights,
  talentMultipliers,
  talentFor,
  settleGameplay,
  recalculatePanel,
  growthPerDay,
  consumeCultivation,
  addProgressionToView,
  protectProgression,
  worldSeconds,
} from '../src/角色卡玩法规则包/progression.ts';
globalThis.z = z;
const { Schema } = await import('../src/角色卡玩法规则包/schema.ts');
const seed = YAML.parse(
  await readFile(new URL('../src/角色卡玩法规则包/世界书/变量/初始人物.yaml', import.meta.url), 'utf8'),
);
const fixture = () => {
  const result = Schema.parse({});
  Object.assign(result.玩法, structuredClone(seed));
  result.玩法.时间.剧情时间 = '第1日00:00';
  return result;
};
const approx = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);
for (let r = 0; r < 8; r++) {
  approx(
    talentWeights[r].reduce((a, b) => a + b),
    100,
    '概率总和',
  );
  for (let tier = 1; tier < 6; tier++)
    if (r)
      assert.ok(
        talentWeights[r].slice(tier).reduce((a, b) => a + b) >=
          talentWeights[r - 1].slice(tier).reduce((a, b) => a + b),
        '高境界的高天赋累计概率不下降',
      );
}
assert.deepEqual(talentFor('chat-a', '云', 1), talentFor('chat-a', '云', 1));
assert.equal(worldSeconds('星辉历 742年02月31日 00:00'), null);
const state = fixture(),
  p = state.玩法.人物.云;
p.生命.当前 = 43;
p.路线.斗气.当前能量 = 61;
settleGameplay(state.玩法, 'chat-a');
const talent = structuredClone(p.天赋);
const once = structuredClone(state);
settleGameplay(state.玩法, 'chat-a');
assert.deepEqual(state, once, '同一时点不重复结算或重抽');
assert.deepEqual(p.天赋, talent);
assert.equal(p.生命.当前, 43);
// 固定为普通天赋的离线夹具，不写入真实初始人物。
p.天赋.等级 = '平常';
state.玩法.时间.剧情时间 = '第361日00:00';
settleGameplay(state.玩法, 'chat-a');
assert.equal(p.路线.斗气.境界, 2);
assert.equal(p.生命.当前, 172);
assert.equal(p.生命.上限, 400);
assert.equal(p.路线.斗气.当前能量, 122);
assert.equal(p.路线.斗气.能量上限, 200);
assert.equal(p.天赋.初始境界, 1);
assert.equal(p._成长.晋升待报.斗气.新境界, 2);
const completed = structuredClone(state);
state.玩法.时间.剧情时间 = '第360日00:00';
settleGameplay(state.玩法, 'chat-a');
assert.deepEqual(state.玩法.人物, completed.玩法.人物, '倒退游标不重新领取');
state.玩法.时间.剧情时间 = '第361日00:00';
settleGameplay(state.玩法, 'chat-a');
assert.deepEqual(state.玩法.人物, completed.玩法.人物, '恢复时间不重复领取');
const chunk = fixture(),
  single = fixture();
settleGameplay(chunk.玩法, 'chat-b');
settleGameplay(single.玩法, 'chat-b');
for (let d = 2; d <= 800; d++) {
  chunk.玩法.时间.剧情时间 = `第${d}日00:00`;
  settleGameplay(chunk.玩法, 'chat-b');
}
single.玩法.时间.剧情时间 = '第800日00:00';
settleGameplay(single.玩法, 'chat-b');
assert.equal(chunk.玩法.人物.云.路线.斗气.境界, single.玩法.人物.云.路线.斗气.境界);
approx(chunk.玩法.人物.云.路线.斗气.修炼进度, single.玩法.人物.云.路线.斗气.修炼进度, '分段与整段成长一致');
const items = (state.玩法.库存.fixture = { 所属: '仅离线校验', 资金: 0, 补给: 0, 材料: 0, 物品: {} });
const meta = (category, effects, rank = 1, use = '佩戴') => ({
  大类: category,
  子类: '普通',
  适用路线: '斗气',
  使用方式: use,
  归属人物ID: null,
  品阶: rank,
  效果: effects,
});
function equip(id, value, slot = 'weapon') {
  items.物品[id] = { 名称: id, 数量: 1, 固定规格: '离线夹具', 宝物: value };
  applyEquipmentCommand(state.玩法, {
    type: 'equip',
    personId: '云',
    ref: { 库存ID: 'fixture', 物品ID: id },
    slot,
    splitId: 'unused',
  });
  recalculatePanel(state.玩法, '云');
}
equip('percent', meta('武器', [{ 类型: '比例属性', 属性: '攻击', 份额: 1 }]));
assert.equal(p.无资源攻击, 21, '低阶百分比当前增益');
p._成长.基础面板.攻击 = 2000;
recalculatePanel(state.玩法, '云');
assert.equal(p.无资源攻击, 2001.5, '低阶宝物封顶后不随人物增长');
equip('staff', { ...meta('武器', [{ 类型: '固定属性', 属性: '攻击', 份额: 1 }]), 子类: '法杖', 适用路线: '法力' });
assert.equal(p.无资源攻击, 2000, '骑士法杖全效果无效');
equip('life', meta('防具', [{ 类型: '固定属性', 属性: '生命', 份额: 1 }]), 'armor');
assert.equal(p.生命.上限, 420);
assert.equal(p.生命.当前, 172, '装备不回满');
for (let n = 0; n < 3; n++) {
  applyEquipmentCommand(state.玩法, { type: 'unequip', ref: { 库存ID: 'fixture', 物品ID: 'life' } });
  recalculatePanel(state.玩法, '云');
  equip('life', meta('防具', [{ 类型: '固定属性', 属性: '生命', 份额: 1 }]), 'armor');
}
assert.equal(p.生命.上限, 420);
assert.equal(p.生命.当前, 172, '穿脱不叠加且不恢复');
equip('growth', meta('修为秘宝', [{ 类型: '成长加速', 路线: '斗气', 份额: 1 }]), 'growth');
assert.ok(growthPerDay(state.玩法, '云', '斗气') > 200 / 360);
assert.ok(growthPerDay(state.玩法, '云', '斗气') <= (200 / 360) * 1.5);
items.物品.secret = {
  名称: '修为夹具',
  数量: 3,
  固定规格: '离线',
  宝物: meta('修为秘宝', [{ 类型: '修为', 路线: '斗气', 份额: 1 }], 2, '消耗'),
};
p.路线.斗气.修炼进度 = 390;
consumeCultivation(state.玩法, { 库存ID: 'fixture', 物品ID: 'secret' }, '云', '斗气');
assert.equal(p.路线.斗气.境界, 3);
assert.equal(p.路线.斗气.修炼进度, 30, '晋阶保留溢出');
consumeCultivation(state.玩法, { 库存ID: 'fixture', 物品ID: 'secret' }, '云', '斗气');
const denied = structuredClone(state);
assert.throws(() => consumeCultivation(state.玩法, { 库存ID: 'fixture', 物品ID: 'secret' }, '云', '斗气'), /额度/);
assert.deepEqual(state, denied, '失败不得消耗或改额度；晋阶也不刷新日额度');
state.玩法.时间.剧情时间 = '第360日00:00';
assert.throws(() => consumeCultivation(state.玩法, { 库存ID: 'fixture', 物品ID: 'secret' }, '云', '斗气'), /早于/);
state.玩法.时间.剧情时间 = '第361日00:00';
assert.equal(p._成长.吸收.斗气.上限, 80);
const view = gameplayPublicView(state);
addProgressionToView(view, state.玩法);
assert.equal(view.玩法.人物.云.天赋.等级, '平常');
assert.equal(view.玩法.人物.云._成长, undefined);
assert.ok(view.晋升提示.人物.some(line => line.includes('云')));
assert.deepEqual(view.玩法.库存.fixture.物品, {});
const ai = structuredClone(state);
ai.玩法.人物.云.天赋.等级 = '绝世';
ai.玩法.人物.云.路线.斗气.境界 = 8;
ai.玩法.人物.云.生命.当前 -= 5;
protectProgression(ai, state);
assert.equal(ai.玩法.人物.云.天赋.等级, '平常');
assert.equal(ai.玩法.人物.云.路线.斗气.境界, 3);
assert.equal(ai.玩法.人物.云.生命.当前, p.生命.当前 - 5);
assert.deepEqual(ai.玩法.人物.云._成长.晋升待报, {});
assert.equal(Schema.safeParse(state).success, true);
const invalid = structuredClone(state);
invalid.玩法.库存.fixture.物品.secret.宝物.效果.push({ 类型: '修为', 路线: '斗气', 份额: 1 });
assert.equal(Schema.safeParse(invalid).success, false, '不能叠两条满预算');
const max = fixture();
settleGameplay(max.玩法, 'max');
max.玩法.时间.剧情时间 = '第1000000日00:00';
settleGameplay(max.玩法, 'max');
assert.equal(max.玩法.人物.云.路线.斗气.境界, 8);
const cap = structuredClone(max.玩法.人物.云);
max.玩法.时间.剧情时间 = '第1000001日00:00';
settleGameplay(max.玩法, 'max');
assert.equal(max.玩法.人物.云.路线.斗气.修炼进度, cap.路线.斗气.修炼进度, 'R8 不再积累无用大数');
const report = {
  version: 1,
  scope: '确定性边界检查；未测试实际酒馆、宝物投放与叙事效果，不证明完整世界经济平衡',
  talents: talentNames.map((name, i) => ({
    name,
    multiplier: talentMultipliers[i],
    firstPromotionDays: 360 / talentMultipliers[i],
  })),
  weights: talentWeights,
  passed: [
    '概率单调',
    '同分支抽签固定',
    '无追溯发放',
    '重复与倒退结算',
    '分段一致',
    '晋阶余额比例',
    '品阶绝对上限',
    '路线限制',
    '穿脱不恢复',
    '修为消耗原子性',
    '日额度跨阶不刷新',
    'AI 只读信息与保护',
    'R8 上限',
  ],
};
const output = new URL('../output/角色卡玩法规则包/宝物效果基准/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('天赋成长V1-边界核对.json', output), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: 天赋概率、成长、装备上限、秘宝事务与 AI 视图；未运行剧情模型。');
