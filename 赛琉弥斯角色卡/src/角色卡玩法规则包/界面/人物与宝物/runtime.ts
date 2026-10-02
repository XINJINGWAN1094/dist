import { equipmentSlots, type EquipmentCommand, type EquipmentSlot, type EquipmentState } from '../../equipment';
import type { Person, Treasure } from './fixture';

export type EquipmentApi = {
  version: number;
  read(): { token: string; gameplay: EquipmentState & Record<string, any> };
  apply(command: EquipmentCommand, token: string): Promise<ReturnType<EquipmentApi['read']>>;
};
export function findEquipmentApi(): EquipmentApi | undefined {
  for (const frame of [window, window.parent]) {
    try {
      const api = (frame as unknown as Record<string, any>).__selyumis_equipment_v1__;
      if (api?.version === 1 && typeof api.read === 'function' && typeof api.apply === 'function') return api;
    } catch {
      /* 跨源独立预览无权访问宿主，保持演示模式。 */
    }
  }
  return undefined;
}
const knightRealms = ['', '见习骑士', '正式骑士', '大骑士', '大地骑士', '天空骑士', '圣域骑士', '半神骑士', '神阶骑士'];

export function viewFromEquipmentState(gameplay: EquipmentState & Record<string, any>): {
  people: Person[];
  treasures: Treasure[];
} {
  const people = Object.entries(gameplay.人物).map(([id, value]) => {
    const data = value as Record<string, any>;
    const routes = Object.keys(data.路线);
    const route = data.路线.斗气 ?? data.路线.法力 ?? (Object.values(data.路线)[0] as any);
    return {
      id,
      name: data.姓名,
      realm: data.路线.斗气 ? (knightRealms[route.境界] ?? `斗气 ${route.境界}阶`) : `法力 ${route?.境界 ?? '?'}阶`,
      hp: data.生命.当前,
      hpMax: data.生命.上限,
      energy: route?.当前能量 ?? 0,
      energyMax: route?.能量上限 ?? 0,
      defense: data.有效防御,
      attack: data.无资源攻击,
      cap: route?.单次投入上限 ?? 0,
      progress: route?.修炼进度 ?? 0,
      progressMax: route ? 100 * route.境界 * route.品质 : 0,
      nextRealm: data.路线.斗气 ? (knightRealms[route.境界 + 1] ?? '待定') : '待定',
      routes,
    };
  });
  const treasures: Treasure[] = [];
  for (const [stockId, stock] of Object.entries(gameplay.库存)) {
    for (const [itemId, item] of Object.entries(stock.物品)) {
      if (!item.宝物 || item.数量 <= 0) continue;
      let ownerId = item.宝物.归属人物ID ?? undefined;
      let slot: EquipmentSlot | undefined;
      for (const [personId, person] of Object.entries(gameplay.人物)) {
        for (const slotId of equipmentSlots) {
          const ref = person.装备?.[slotId];
          if (ref?.库存ID === stockId && ref.物品ID === itemId) {
            ownerId = personId;
            slot = slotId;
          }
        }
      }
      treasures.push({
        id: JSON.stringify([stockId, itemId]),
        name: item.名称,
        category: item.宝物.大类,
        quantity: item.数量,
        use: item.宝物.使用方式 === '佩戴' ? 'wear' : item.宝物.使用方式 === '消耗' ? 'consume' : 'special',
        effect: item.固定规格,
        description: '',
        ownerId,
        slot,
        metadata: item.宝物,
        inventoryRef: { 库存ID: stockId, 物品ID: itemId },
      });
    }
  }
  return { people, treasures };
}
