import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceDir = path.join(root, '赛琉弥斯角色卡/src/角色卡玩法规则包');
const variableDir = path.join(sourceDir, '世界书/变量');
globalThis.z = z;
const { Schema } = await import(pathToFileURL(path.join(sourceDir, 'schema.ts')).href);
const initialText = await readFile(path.join(variableDir, 'initvar.yaml'), 'utf8');
const initial = YAML.parse(initialText);
assert.deepEqual(Schema.parse(initial), initial, '空初始化不得新增人物、余额或有效状态');
assert.deepEqual(Schema.parse(Schema.parse(initial)), initial, 'schema 必须幂等');
assert.deepEqual(Schema.parse({ unrelated: { balance: 27 } }).unrelated, { balance: 27 }, '保留无关根字段');
const characterDefaults = YAML.parse(await readFile(path.join(variableDir, '初始人物.yaml'), 'utf8'));
const seeded = structuredClone(initial);
Object.assign(seeded.玩法, characterDefaults);
assert.deepEqual(Schema.parse(seeded), seeded, '用户确认的人物初值必须满足既有结构，不改境界或余额');

// 仅离线格式夹具：数值仍为 N2 待评审基准，不作为 initvar 或提示词导出。
const fixture = structuredClone(initial);
const state = fixture.玩法;
state.技能定义.main = {
  名称: '单体主力技·天空阶',
  确认状态: '待评审',
  路线: '斗气',
  门槛: 'R5、Q16',
  固定消耗: 32,
  固定规格: '伤害5120，射程200米，单体，一个主要行动，无额外准备。',
};
state.技能定义.shield = {
  名称: '个人护盾·天空阶',
  确认状态: '待评审',
  路线: '斗气',
  门槛: 'R5、Q16',
  固定消耗: 32,
  固定规格: '盾值2560，仅自身，一次反应，至含施放当次的第三次交锋结束。',
};
state.技能定义.bind = {
  名称: '地缚术·天空阶',
  确认状态: '暂定通过·实验性',
  路线: '法力',
  门槛: 'R5、Q16',
  固定消耗: 32,
  固定规格: '测试字段引用；完整规则由实验性条目提供。',
};
state.人物.knight = {
  姓名: '校验骑士',
  种族: '人类',
  面板依据: 'N2待评审测试基准',
  体型模板: null,
  生命: { 当前: 16384, 上限: 25600 },
  有效防御: 512,
  无资源攻击: 1280,
  路线: { 斗气: { 境界: 5, 品质: 16, 当前能量: 1440, 能量上限: 1600, 单次投入上限: 320, 修炼进度: 0 } },
  已掌握技能: { main: true, shield: true },
  下次药剂可生效时间: null,
};
state.玩家人物ID = 'knight';
state.库存.camp = { 所属: '营地', 资金: 10, 补给: 4, 材料: 0, 物品: {} };
state.军队.unit = {
  名称: '测试队伍',
  库存ID: 'camp',
  命令: '驻守',
  构成: { soldiers: { 职业: '步兵', 境界: '凡俗', 存活人数: 10, 其中伤员: 2, 累计死亡: 1 } },
  关键人物: {},
};
state.领地.home = { 名称: '测试领地', 等级: 1, 库存ID: 'camp', 产出结算至: '第1日00:00' };
state.护盾.knight = { 技能版本ID: 'shield', 剩余盾值: 2560, 结束交锋: 4 };
state.准备.knight = { 技能版本ID: 'main', 剩余准备行动: 0 };
state.实验性地缚.knight = { 技能版本ID: 'bind', 有效强度: 2560, 结束交锋: 2 };
assert.deepEqual(Schema.parse(fixture), fixture, '解析不得自动回满、扣费、到期清理或重判');
assert.deepEqual(Schema.parse(Schema.parse(fixture)), fixture, '带状态的结构也必须幂等');

const cleared = structuredClone(fixture);
delete cleared.玩法.护盾.knight;
delete cleared.玩法.准备.knight;
delete cleared.玩法.实验性地缚.knight;
assert.deepEqual(Schema.parse(cleared), cleared, 'remove 后不得重建空效果槽');
const zero = structuredClone(fixture);
zero.玩法.人物.knight.生命.当前 = 0;
zero.玩法.人物.knight.路线.斗气.当前能量 = 0;
assert.equal(Schema.parse(zero).玩法.人物.knight.生命.当前, 0, '失能不得自动恢复');
assert.equal(Schema.parse(zero).玩法.人物.knight.路线.斗气.当前能量, 0, '耗尽不得自动回满');
const fresh = Schema.parse({});
assert.deepEqual(fresh.玩法.人物, {}, '两个独立输入不能共享人物余额');
assert.deepEqual(initial.玩法.人物, {}, '解析不得污染初始对象');

const invalid = [
  [
    '生命溢出',
    value => {
      value.人物.knight.生命.当前 = 30000;
    },
  ],
  [
    '能量透支',
    value => {
      value.人物.knight.路线.斗气.当前能量 = -1;
    },
  ],
  [
    'C 非20%',
    value => {
      value.人物.knight.路线.斗气.单次投入上限 = 999;
    },
  ],
  [
    '伤员超过存活',
    value => {
      value.军队.unit.构成.soldiers.其中伤员 = 11;
    },
  ],
  [
    '负库存',
    value => {
      value.库存.camp.资金 = -1;
    },
  ],
  [
    '缺失人物引用',
    value => {
      value.玩家人物ID = 'missing';
    },
  ],
  [
    '缺失技能引用',
    value => {
      delete value.技能定义.main;
    },
  ],
  [
    '缺失路线',
    value => {
      delete value.人物.knight.路线.斗气;
    },
  ],
  [
    '缺失库存引用',
    value => {
      delete value.库存.camp;
    },
  ],
  [
    '规则状态升格',
    value => {
      value._规则确认.N2基础数值 = '已通过';
    },
  ],
  [
    '非有限数值',
    value => {
      value.人物.knight.生命.当前 = Infinity;
    },
  ],
  [
    '超额日修炼',
    value => {
      value.当日修炼.knight = { 日期: '第1日', 已得进度: 5 };
    },
  ],
];
for (const [name, mutate] of invalid) {
  const candidate = structuredClone(fixture);
  mutate(candidate.玩法);
  assert.equal(Schema.safeParse(candidate).success, false, `应拒绝：${name}`);
}

const updateText = await readFile(path.join(variableDir, '变量更新规则.yaml'), 'utf8');
const formatText = await readFile(path.join(variableDir, '变量输出格式.yaml'), 'utf8');
const listText = await readFile(path.join(variableDir, '变量列表.txt'), 'utf8');
YAML.parse(updateText);
YAML.parse(formatText);
assert.ok(listText.includes('{{format_message_variable::stat_data.玩法正文}}'), 'AI 只读精简视图');
assert.ok(!listText.includes('{{format_message_variable::stat_data}}'), '不得同时发送完整装备存档');
for (const file of ['变量输出格式.yaml']) {
  assert.equal(
    await readFile(path.join(variableDir, file), 'utf8'),
    await readFile(path.join(root, '初始模板/角色卡/新建为src文件夹中的文件夹/世界书/变量', file), 'utf8'),
    `${file} 必须沿用仓库固定模板`,
  );
}
await writeFile(
  path.join(sourceDir, 'schema.json'),
  `${JSON.stringify(z.toJSONSchema(Schema, { io: 'input', reused: 'ref' }), null, 2)}\n`,
);

// 只生成额外的变量世界书，保持原12条规则包的默认开关不变。
const template = JSON.parse(await readFile(new URL('./gameplay-worldbook-entry.json', import.meta.url), 'utf8'));
const entries = {};
const variables = [
  ['[initvar]变量初始化勿开', initialText, true],
  ['变量列表', listText, false],
  ['[mvu_update]变量更新规则', updateText, false],
  ['[mvu_update]变量输出格式', formatText, false],
];
for (const [uid, [comment, content, disable]] of variables.entries()) {
  entries[uid] = {
    ...template,
    uid,
    comment,
    content: content.trim(),
    disable,
    order: 14720 + uid,
    position: uid === 0 ? 0 : 4,
    depth: 0,
    displayIndex: uid,
  };
}
const outputDir = path.join(root, '赛琉弥斯角色卡/output/角色卡玩法规则包');
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, '角色卡玩法_MVU变量.worldbook.json');
await writeFile(outputPath, `${JSON.stringify({ entries }, null, 2)}\n`);
assert.equal(
  Object.values(JSON.parse(await readFile(outputPath, 'utf8')).entries).filter(entry => !entry.disable).length,
  3,
);
console.log(
  'PASS: 初始化、幂等、状态清除、零余额保留、无关字段保留、独立输入与12类非法数据；变量 YAML 与固定模板一致。',
);
console.log('已生成 schema.json 和独立 MVU 变量世界书；未安装到酒馆，未验证实际分支运行。');
