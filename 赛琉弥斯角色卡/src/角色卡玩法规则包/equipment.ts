/** 装备只引用既有库存。图标由大类决定；武器外形与路线限制另行记录。 */
export const treasureCategories = ['武器', '防具', '饰品', '修为秘宝', '特殊物品'] as const;
export type TreasureCategory = (typeof treasureCategories)[number];
export const equipmentSlots = ['weapon', 'armor', 'accessory1', 'accessory2', 'growth', 'special'] as const;
export type EquipmentSlot = (typeof equipmentSlots)[number];
export const categoryIcons: Record<TreasureCategory, string> = {
  武器: 'category-weapon',
  防具: 'category-armor',
  饰品: 'category-accessory',
  修为秘宝: 'category-cultivation',
  特殊物品: 'category-special',
};
export const slotCategories: Record<EquipmentSlot, TreasureCategory> = {
  weapon: '武器',
  armor: '防具',
  accessory1: '饰品',
  accessory2: '饰品',
  growth: '修为秘宝',
  special: '特殊物品',
};
export type EquipmentRef = { 库存ID: string; 物品ID: string };
export type TreasureEffect = {
  类型: '固定属性' | '比例属性' | '成长加速' | '修为';
  属性?: '生命' | '能量' | '攻击' | '防御';
  路线?: string;
  份额: 0.5 | 1;
};
export type TreasureMetadata = {
  大类: TreasureCategory;
  子类: '普通' | '法杖';
  适用路线: '通用' | '斗气' | '法力';
  使用方式: '佩戴' | '消耗' | '特殊';
  归属人物ID: string | null;
  固定加成?: { 攻击: number; 防御: number };
  品阶?: number;
  效果?: TreasureEffect[];
};
export type InventoryItem = {
  名称: string;
  数量: number;
  固定规格: string;
  宝物?: TreasureMetadata;
};
export type EquippedPerson = {
  姓名: string;
  路线: Record<string, unknown>;
  装备?: Partial<Record<EquipmentSlot, EquipmentRef>>;
};
export type EquipmentState = {
  人物: Record<string, EquippedPerson>;
  库存: Record<string, { 物品: Record<string, InventoryItem> }>;
};
export type EquipmentCommand =
  | { type: 'equip'; ref: EquipmentRef; personId: string; slot: EquipmentSlot; splitId: string }
  | { type: 'unequip'; ref: EquipmentRef }
  | { type: 'discard'; ref: EquipmentRef; quantity: number }
  | { type: 'consume'; ref: EquipmentRef; personId: string; route: string };

export function sameItem(a: EquipmentRef, b: EquipmentRef): boolean {
  return a.库存ID === b.库存ID && a.物品ID === b.物品ID;
}
export function resolveEquipment(state: EquipmentState, ref: EquipmentRef): InventoryItem | undefined {
  return state.库存[ref.库存ID]?.物品[ref.物品ID];
}
/** 法杖强制归法力；只掌握斗气的人可以持有，但任何装备增幅均不启用。 */
export function equipmentBenefitsApply(person: EquippedPerson, treasure: TreasureMetadata): boolean {
  const route = treasure.子类 === '法杖' ? '法力' : treasure.适用路线;
  return route === '通用' || Object.hasOwn(person.路线, route);
}
function clearReferences(state: EquipmentState, ref: EquipmentRef): void {
  for (const person of Object.values(state.人物)) {
    for (const [slot, equipped] of Object.entries(person.装备 ?? {})) {
      if (equipped && sameItem(equipped, ref)) delete person.装备![slot as EquipmentSlot];
    }
  }
}
/** 调用方在副本上执行；失败不写回存档。没有 AI 通知或新增物件入口。 */
export function applyEquipmentCommand(state: EquipmentState, command: EquipmentCommand): void {
  if (command.type === 'consume') throw new Error('消耗须通过成长结算入口提交。');
  const item = resolveEquipment(state, command.ref);
  if (!item?.宝物 || item.数量 <= 0) throw new Error('宝物已不存在，请刷新后重试。');
  if (command.type === 'unequip') {
    clearReferences(state, command.ref);
    return;
  }
  if (command.type === 'discard') {
    if (!Number.isInteger(command.quantity) || command.quantity < 1 || command.quantity > item.数量)
      throw new Error('丢弃数量无效。');
    item.数量 -= command.quantity;
    if (item.数量 === 0) {
      clearReferences(state, command.ref);
      delete state.库存[command.ref.库存ID].物品[command.ref.物品ID];
    }
    return;
  }
  const person = state.人物[command.personId];
  if (!person) throw new Error('人物已不存在。');
  if (item.宝物.使用方式 !== '佩戴' || slotCategories[command.slot] !== item.宝物.大类)
    throw new Error('该宝物不适用于此装备位置。');
  let targetRef = { ...command.ref };
  let targetItem = item;
  if (item.数量 > 1) {
    const inventory = state.库存[command.ref.库存ID].物品;
    if (!command.splitId || Object.hasOwn(inventory, command.splitId)) throw new Error('拆分编号冲突，请重试。');
    targetItem = structuredClone(item);
    targetItem.数量 = 1;
    item.数量 -= 1;
    inventory[command.splitId] = targetItem;
    targetRef = { 库存ID: command.ref.库存ID, 物品ID: command.splitId };
  }
  clearReferences(state, targetRef);
  targetItem.宝物!.归属人物ID = command.personId;
  person.装备 ??= {};
  person.装备[command.slot] = targetRef;
}

/** 只计已定稿的固定加成；不推断百分比、成长速度或特殊机制。 */
export function fixedEquipmentBonuses(state: EquipmentState, personId: string): { 攻击: number; 防御: number } {
  const total = { 攻击: 0, 防御: 0 };
  const person = state.人物[personId];
  if (!person) return total;
  for (const ref of Object.values(person.装备 ?? {})) {
    const item = resolveEquipment(state, ref);
    if (!item?.宝物 || !equipmentBenefitsApply(person, item.宝物)) continue;
    total.攻击 += item.宝物.固定加成?.攻击 ?? 0;
    total.防御 += item.宝物.固定加成?.防御 ?? 0;
  }
  return total;
}

export function equippedWeaponNames(state: EquipmentState, personId: string): string[] {
  const ref = state.人物[personId]?.装备?.weapon;
  const item = ref && resolveEquipment(state, ref);
  return item?.宝物?.大类 === '武器' && item.数量 > 0 ? [item.名称] : [];
}

/** AI 只读投影，不是第二套库存：隐藏脚本宝物记录、装备引用和增幅配置。 */
export function gameplayPublicView(statData: Record<string, any>): Record<string, any> {
  const visible = structuredClone(statData);
  delete visible.玩法正文;
  const gameplay = visible.玩法;
  if (!gameplay?.人物 || !gameplay?.库存) return visible;
  for (const [id, person] of Object.entries(gameplay.人物) as [string, Record<string, any>][]) {
    delete person.装备;
    person.当前武器 = equippedWeaponNames(statData.玩法, id);
  }
  for (const stock of Object.values(gameplay.库存) as { 物品: Record<string, InventoryItem> }[]) {
    for (const [id, item] of Object.entries(stock.物品 ?? {})) if (item.宝物) delete stock.物品[id];
  }
  return visible;
}

/** 恢复脚本掌管的装备与宝物记录；普通剧情资产仍可按原规则更新。 */
export function protectEquipmentVariables(next: Record<string, any>, previous: Record<string, any>): void {
  const before = previous.玩法;
  if (!before) return;
  next.玩法 ??= structuredClone(before);
  const after = next.玩法;
  after.人物 ??= {};
  after.库存 ??= {};
  for (const person of Object.values(after.人物) as Record<string, any>[]) delete person.装备;
  for (const [id, person] of Object.entries(before.人物 ?? {}) as [string, Record<string, any>][]) {
    if (!person.装备) continue;
    after.人物[id] ??= structuredClone(person);
    after.人物[id].装备 = structuredClone(person.装备);
  }
  for (const stock of Object.values(after.库存) as Record<string, any>[]) {
    for (const item of Object.values(stock.物品 ?? {}) as Record<string, any>[]) delete item.宝物;
  }
  for (const [stockId, stock] of Object.entries(before.库存 ?? {}) as [string, Record<string, any>][]) {
    for (const [itemId, item] of Object.entries(stock.物品 ?? {}) as [string, InventoryItem][]) {
      if (!item.宝物) continue;
      after.库存[stockId] ??= structuredClone(stock);
      after.库存[stockId].物品 ??= {};
      after.库存[stockId].物品[itemId] = structuredClone(item);
    }
  }
}
