import type { EquipmentState, EquipmentRef, TreasureMetadata } from './equipment';

export const talentNames = ['平常', '良好', '优秀', '卓越', '天才', '绝世'] as const;
export const talentMultipliers = [1, 1.5, 2, 3, 4.5, 6] as const;
/** 各行合计 100；初始境界提高时，各高档天赋的累计概率均不下降。 */
export const talentWeights = [
  [60, 25, 10, 4, 0.9, 0.1],
  [42, 30, 18, 8, 1.8, 0.2],
  [25, 30, 27, 14, 3.5, 0.5],
  [12, 23, 32, 24, 8, 1],
  [5, 13, 27, 36, 16, 3],
  [2, 6, 17, 36, 32, 7],
  [0.5, 2.5, 9, 28, 43, 17],
  [0.1, 0.9, 4, 15, 45, 35],
] as const;
export type Talent = { 等级: (typeof talentNames)[number]; 初始境界: number; 规则版本: 1 };
export type Route = {
  境界: number;
  品质: number;
  当前能量: number;
  能量上限: number;
  单次投入上限: number;
  修炼进度: number;
};
type BasePanel = { 生命上限: number; 防御: number; 攻击: number; 路线能量: Record<string, number> };
type Growth = {
  结算至: string | null;
  基础面板: BasePanel;
  吸收: Record<string, { 日期: string; 上限: number; 已用: number }>;
  晋升待报: Record<string, { 原境界: number; 新境界: number }>;
};
export type GrowingPerson = EquipmentState['人物'][string] & {
  面板依据: string;
  生命: { 当前: number; 上限: number };
  有效防御: number;
  无资源攻击: number;
  路线: Record<string, Route>;
  天赋?: Talent;
  _成长?: Growth;
};
export type Gameplay = EquipmentState & {
  时间: { 剧情时间: string | null };
  人物: Record<string, GrowingPerson>;
};
const DAY = 86400;
const EPSILON = 1e-9;
const round = (value: number) => Math.round(value * 1e9) / 1e9;
export const threshold = (route: Route) => 100 * route.境界 * route.品质;
export const talentMultiplier = (person: GrowingPerson) =>
  person.天赋 ? talentMultipliers[talentNames.indexOf(person.天赋.等级)] : 0;

/** 星辉历每月 30 天、每年 360 天；另兼容独立玩法“第N日”。不读取现实时间。 */
export function worldSeconds(time: string | null): number | null {
  if (!time) return null;
  const star = /^星辉历\s*(\d+)年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  const day = /^第(\d+)日\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!star && !day) return null;
  const y = star ? Number(star[1]) : 0,
    m = star ? Number(star[2]) : 1;
  const d = Number(star ? star[3] : day![1]);
  const h = Number(star ? star[4] : day![2]),
    min = Number(star ? star[5] : day![3]);
  const sec = Number((star ? star[6] : day![4]) ?? 0);
  if (m < 1 || m > 12 || d < 1 || (star && d > 30) || h > 23 || min > 59 || sec > 59) return null;
  const result = ((y * 360 + (m - 1) * 30 + d - 1) * 24 + h) * 3600 + min * 60 + sec;
  return Number.isSafeInteger(result) ? result : null;
}

/** 按聊天身份与稳定人物 ID 固定抽签；无全局抽签表，刷新/同分支重生成不会刷结果。 */
export function talentFor(scope: string, personId: string, initialRank: number): Talent {
  const rank = Math.max(1, Math.min(8, initialRank));
  let hash = 2166136261;
  for (const char of `talent-v1|${scope}|${personId}`) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  let pick = ((hash >>> 0) / 4294967296) * 100;
  let index = 0;
  for (; index < talentNames.length - 1; index++) {
    pick -= talentWeights[rank - 1][index];
    if (pick < 0) break;
  }
  return { 等级: talentNames[index], 初始境界: rank, 规则版本: 1 };
}

export function bonusEligible(person: GrowingPerson, item: TreasureMetadata): boolean {
  const route = item.子类 === '法杖' ? '法力' : item.适用路线;
  const ranks = Object.entries(person.路线)
    .filter(([key]) => route === '通用' || key === route)
    .map(([, value]) => value.境界);
  return ranks.length > 0 && Math.max(...ranks) >= (item.品阶 ?? 1);
}
function worn(state: Gameplay, person: GrowingPerson): TreasureMetadata[] {
  const result: TreasureMetadata[] = [];
  const seen = new Set<string>();
  for (const ref of Object.values(person.装备 ?? {})) {
    if (!ref) continue;
    const key = JSON.stringify(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = state.库存[ref.库存ID]?.物品[ref.物品ID];
    if (item?.数量 === 1 && item.宝物 && bonusEligible(person, item.宝物)) result.push(item.宝物);
  }
  return result;
}
export function effectUnit(rank: number, attribute: string): number {
  const q = 2 ** (rank - 1);
  return attribute === '生命' ? 20 * q * q : attribute === '能量' ? 20 * q : attribute === '防御' ? 0.5 * q * q : q * q;
}
const effectPercent = (rank: number) => Math.min(0.05 * rank, 0.2);
const baseSpeed = (rank: number) => (100 * rank) / 360;

export function growthPerDay(state: Gameplay, personId: string, routeName: string): number {
  const person = state.人物[personId],
    route = person?.路线[routeName];
  if (!route || route.境界 >= 8) return 0;
  const speed = baseSpeed(route.境界) * talentMultiplier(person);
  let bonus = 0;
  for (const item of worn(state, person))
    for (const effect of item.效果 ?? []) {
      if (effect.类型 !== '成长加速' || effect.路线 !== routeName || !item.品阶 || route.境界 < item.品阶) continue;
      const p = effectPercent(item.品阶),
        cap = baseSpeed(item.品阶) * p * 1.5;
      bonus += Math.min(speed * p, cap) * effect.份额;
    }
  return speed + Math.min(bonus, speed * 0.5);
}

function basePanel(person: GrowingPerson): BasePanel {
  return {
    生命上限: person.生命.上限,
    防御: person.有效防御,
    攻击: person.无资源攻击,
    路线能量: Object.fromEntries(Object.entries(person.路线).map(([key, route]) => [key, route.能量上限])),
  };
}
/** 零基础只用已定义 N2 单路线的参考额度；百分比自身仍为零。 */
function referenceBase(person: GrowingPerson, attribute: string): number {
  const routes = Object.entries(person.路线);
  if (routes.length !== 1 || !person.面板依据.includes('N2')) return 0;
  const [name, route] = routes[0],
    q2 = route.品质 ** 2;
  if (name !== '斗气' && name !== '法力') return 0;
  return attribute === '攻击'
    ? (name === '斗气' ? 5 : 3) * q2
    : attribute === '防御'
      ? (name === '斗气' ? 2 : 1) * q2
      : 0;
}

export function recalculatePanel(state: Gameplay, personId: string, clampCurrent = true): void {
  const person = state.人物[personId],
    base = person._成长?.基础面板;
  if (!base) return;
  const items = worn(state, person);
  function total(attribute: string, original: number, routeName?: string): number {
    let add = 0;
    for (const item of items) {
      if (attribute === '攻击') add += item.固定加成?.攻击 ?? 0;
      if (attribute === '防御') add += item.固定加成?.防御 ?? 0;
      if (!item.品阶) continue;
      for (const effect of item.效果 ?? []) {
        if (
          effect.属性 !== attribute ||
          (attribute === '能量' && (effect.路线 !== routeName || person.路线[routeName!].境界 < item.品阶))
        )
          continue;
        const fixed = effectUnit(item.品阶, attribute);
        if (effect.类型 === '固定属性') add += fixed * effect.份额;
        if (effect.类型 === '比例属性') add += Math.min(original * effectPercent(item.品阶), fixed * 1.5) * effect.份额;
      }
    }
    return round(original + Math.min(add, (original || referenceBase(person, attribute)) * 0.5));
  }
  person.生命.上限 = total('生命', base.生命上限);
  person.有效防御 = total('防御', base.防御);
  person.无资源攻击 = total('攻击', base.攻击);
  if (clampCurrent) person.生命.当前 = Math.min(person.生命.当前, person.生命.上限);
  for (const [name, route] of Object.entries(person.路线)) {
    if (!Object.hasOwn(base.路线能量, name)) base.路线能量[name] = route.能量上限;
    route.能量上限 = total('能量', base.路线能量[name], name);
    route.单次投入上限 = route.能量上限 / 5;
    if (clampCurrent) route.当前能量 = Math.min(route.当前能量, route.能量上限);
  }
}
export function promotionSupported(person: GrowingPerson): boolean {
  const routes = Object.entries(person.路线);
  return (
    routes.length === 1 &&
    ['斗气', '法力'].includes(routes[0][0]) &&
    person.面板依据.includes('N2') &&
    routes[0][1].品质 === 2 ** (routes[0][1].境界 - 1)
  );
}
function promote(state: Gameplay, personId: string, routeName: string): void {
  const person = state.人物[personId],
    route = person.路线[routeName],
    growth = person._成长!;
  const hpRatio = person.生命.当前 / person.生命.上限,
    energyRatio = route.当前能量 / route.能量上限;
  const from = route.境界;
  route.修炼进度 = Math.max(0, route.修炼进度 - threshold(route));
  route.境界++;
  route.品质 = 2 ** (route.境界 - 1);
  growth.基础面板.生命上限 *= 4;
  growth.基础面板.防御 *= 4;
  growth.基础面板.攻击 *= 4;
  growth.基础面板.路线能量[routeName] *= 2;
  recalculatePanel(state, personId, false);
  person.生命.当前 = Math.floor(hpRatio * person.生命.上限);
  route.当前能量 = Math.floor(energyRatio * route.能量上限);
  person.面板依据 = `N2待评审测试基准；${routeName} R${route.境界}／Q${route.品质}；沿用原体型模板`;
  growth.晋升待报[routeName] = { 原境界: growth.晋升待报[routeName]?.原境界 ?? from, 新境界: route.境界 };
}
function advance(state: Gameplay, id: string, name: string, days: number): void {
  const person = state.人物[id],
    route = person.路线[name];
  if (route.境界 >= 8) return;
  if (!promotionSupported(person)) {
    route.修炼进度 += growthPerDay(state, id, name) * days;
    return;
  }
  // 每次循环至多跨一阶，最多七次；不逐日或逐秒执行。
  while (route.境界 < 8) {
    const speed = growthPerDay(state, id, name),
      needed = Math.max(0, threshold(route) - route.修炼进度);
    if (route.修炼进度 + days * speed + EPSILON < threshold(route)) {
      route.修炼进度 += days * speed;
      break;
    }
    days = Math.max(0, days - (speed > 0 ? needed / speed : 0));
    route.修炼进度 = Math.max(route.修炼进度, threshold(route));
    promote(state, id, name);
    if (days <= EPSILON && route.修炼进度 < threshold(route)) break;
  }
}

export function settleGameplay(state: Gameplay, scope: string): void {
  const time = state.时间.剧情时间,
    now = worldSeconds(time);
  for (const [id, person] of Object.entries(state.人物)) {
    const ranks = Object.values(person.路线).map(route => route.境界);
    person.天赋 ??= talentFor(scope, id, Math.max(1, ...ranks));
    person._成长 ??= { 结算至: now === null ? null : time, 基础面板: basePanel(person), 吸收: {}, 晋升待报: {} };
    recalculatePanel(state, id);
    if (now === null) continue;
    const before = worldSeconds(person._成长.结算至);
    // 首次接入从现在起算；不补发未知历史。时间倒退也不降低游标再次领取。
    if (before === null || person._成长.结算至?.startsWith('星辉历') !== time?.startsWith('星辉历')) {
      person._成长.结算至 = time;
      continue;
    }
    if (now < before) continue;
    for (const name of Object.keys(person.路线)) advance(state, id, name, (now - before) / DAY);
    person._成长.结算至 = time;
  }
}

/** 调用方在副本上执行并一次写回；失败不会吞物品或占用日额度。 */
export function consumeCultivation(state: Gameplay, ref: EquipmentRef, personId: string, name: string): void {
  const person = state.人物[personId],
    route = person?.路线[name];
  const item = state.库存[ref.库存ID]?.物品[ref.物品ID],
    meta = item?.宝物;
  if (!person?._成长 || !route || route.境界 >= 8 || !promotionSupported(person))
    throw new Error('该人物的晋阶模板尚未明确或已达最高境界。');
  const now = worldSeconds(state.时间.剧情时间);
  if (now === null) throw new Error('剧情时间尚未确定，秘宝已保留。');
  if (now < (worldSeconds(person._成长.结算至) ?? now))
    throw new Error('剧情时间早于成长存档，请恢复匹配的分支后再使用。');
  if (
    !item ||
    item.数量 < 1 ||
    !meta?.品阶 ||
    meta.大类 !== '修为秘宝' ||
    meta.使用方式 !== '消耗' ||
    !bonusEligible(person, meta) ||
    route.境界 < meta.品阶
  )
    throw new Error('秘宝不存在，或路线、境界不满足使用要求。');
  const effects = meta.效果 ?? [];
  if (!effects.length || effects.some(effect => effect.类型 !== '修为' || effect.路线 !== name))
    throw new Error('此秘宝没有匹配路线的修为效果。');
  const amount = effects.reduce((sum, effect) => sum + 10 * meta.品阶! * 2 ** (meta.品阶! - 1) * effect.份额, 0);
  const date = String(Math.floor(now / DAY));
  const limit =
    person._成长.吸收[name]?.日期 === date
      ? person._成长.吸收[name]
      : { 日期: date, 上限: threshold(route) * 0.2, 已用: 0 };
  if (limit.已用 + amount > limit.上限 + EPSILON) throw new Error('今日剩余吸收额度不足以完整使用，秘宝已保留。');
  limit.已用 += amount;
  person._成长.吸收[name] = limit;
  route.修炼进度 += amount;
  advance(state, personId, name, 0);
  item.数量--;
  if (item.数量 === 0) delete state.库存[ref.库存ID].物品[ref.物品ID];
}

/** 天赋、基础面板、成长与效果归脚本；正文仍可更新实际伤势和能量消耗。 */
export function protectProgression(next: Record<string, any>, previous: Record<string, any>): void {
  for (const [id, old] of Object.entries(previous.玩法?.人物 ?? {}) as [string, GrowingPerson][]) {
    if (old._成长 && !next.玩法?.人物?.[id]) next.玩法.人物[id] = structuredClone(old);
  }
  for (const [id, person] of Object.entries(next.玩法?.人物 ?? {}) as [string, GrowingPerson][]) {
    const before: GrowingPerson | undefined = previous.玩法?.人物?.[id];
    delete person.天赋;
    delete person._成长;
    if (!before) continue;
    if (before.天赋) person.天赋 = structuredClone(before.天赋);
    if (!before._成长) continue;
    person._成长 = structuredClone(before._成长);
    // 成功的 MVU 回复已看到父分支的提示；本轮新晋升会在结算后重新排入。
    person._成长.晋升待报 = {};
    person.有效防御 = before.有效防御;
    person.无资源攻击 = before.无资源攻击;
    person.生命.上限 = before.生命.上限;
    person.面板依据 = before.面板依据;
    for (const [name, old] of Object.entries(before.路线)) {
      const energy = person.路线[name]?.当前能量 ?? old.当前能量;
      person.路线[name] = { ...old, 当前能量: energy };
    }
  }
}

export function addProgressionToView(view: Record<string, any>, state: Gameplay): void {
  const promotions: string[] = [];
  for (const [id, person] of Object.entries(state.人物)) {
    const visible = view.玩法?.人物?.[id];
    if (!visible) continue;
    delete visible._成长;
    if (person.天赋) visible.天赋 = { 等级: person.天赋.等级, 成长倍率: talentMultiplier(person) };
    for (const [name, event] of Object.entries(person._成长?.晋升待报 ?? {}))
      promotions.push(`${person.姓名}：${name} R${event.原境界}→R${event.新境界}`);
  }
  if (promotions.length)
    view.晋升提示 = {
      人物: promotions,
      描写: '晋升已由脚本结算。按人物关系、剧情与领地实力决定出场、略提或不写，不必逐一庆祝。',
    };
}

export function describeTreasure(meta: TreasureMetadata): string | undefined {
  if (!meta.品阶 || !meta.效果) return undefined;
  return meta.效果
    .map(effect => {
      const fraction = effect.份额,
        rank = meta.品阶!;
      if (effect.类型 === '修为') return `${effect.路线}修为 +${10 * rank * 2 ** (rank - 1) * fraction}，使用后消耗`;
      const percent = effectPercent(rank) * fraction * 100;
      if (effect.类型 === '成长加速')
        return `${effect.路线}成长 +${percent}%，额外最多 ${(baseSpeed(rank) * effectPercent(rank) * 1.5 * fraction).toFixed(3)} 修为/日`;
      const fixed = effectUnit(rank, effect.属性!) * fraction;
      return effect.类型 === '固定属性'
        ? `${effect.路线 ?? ''}${effect.属性} +${fixed}`
        : `${effect.路线 ?? ''}${effect.属性} +${percent}%，最多 +${fixed * 1.5}`;
    })
    .join('；');
}
