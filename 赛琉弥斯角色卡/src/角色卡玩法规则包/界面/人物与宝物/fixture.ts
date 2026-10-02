// UI 演示专用。不是宝物生成器，不初始化或写入酒馆库存。
export type Category = '武器' | '防具' | '饰品' | '修为秘宝' | '特殊物品';
export type Slot = 'weapon' | 'armor' | 'accessory1' | 'accessory2' | 'growth' | 'special';
export interface Treasure {
  id: string;
  name: string;
  category: Category;
  art: string;
  quantity: number;
  use: 'consume' | 'wear' | 'special';
  effect: string;
  description: string;
  ownerId?: string;
  slot?: Slot;
}
export interface Person {
  id: string;
  name: string;
  realm: string;
  hp: number;
  energy: number;
  defense: number;
  attack: number;
  cap: number;
  progressMax: number;
  nextRealm: string;
}
export const people: Person[] = [
  {
    id: 'yun',
    name: '云',
    realm: '见习骑士',
    hp: 100,
    energy: 100,
    defense: 2,
    attack: 5,
    cap: 20,
    progressMax: 100,
    nextRealm: '正式骑士',
  },
  {
    id: 'lia',
    name: '莉娅',
    realm: '大骑士',
    hp: 1600,
    energy: 400,
    defense: 32,
    attack: 80,
    cap: 80,
    progressMax: 1200,
    nextRealm: '大地骑士',
  },
];
export const slots: { id: Slot; label: string; category: Category }[] = [
  { id: 'weapon', label: '武器', category: '武器' },
  { id: 'armor', label: '防具', category: '防具' },
  { id: 'accessory1', label: '饰品一', category: '饰品' },
  { id: 'accessory2', label: '饰品二', category: '饰品' },
  { id: 'growth', label: '修为秘宝', category: '修为秘宝' },
  { id: 'special', label: '特殊物品', category: '特殊物品' },
];
export const categories: { name: Category | '全部'; art: string }[] = [
  { name: '全部', art: 'icon-all' },
  { name: '武器', art: 'icon-weapon' },
  { name: '防具', art: 'icon-defense' },
  { name: '饰品', art: 'icon-ring' },
  { name: '修为秘宝', art: 'icon-secret' },
  { name: '特殊物品', art: 'icon-special' },
];
export function createTreasures(): Treasure[] {
  return [
    {
      id: 'demo-crystal',
      name: '晨辉晶石',
      category: '修为秘宝',
      art: 'crystal',
      quantity: 1,
      use: 'consume',
      effect: '直接增加修为，使用后消耗。',
      description: '细密的晶棱里，凝着一缕澄澈的晨光。',
    },
    {
      id: 'demo-potion',
      name: '清灵秘露',
      category: '修为秘宝',
      art: 'potion',
      quantity: 3,
      use: 'consume',
      effect: '直接增加修为，使用后消耗。',
      description: '封在银饰玻璃瓶中的一滴清辉。',
    },
    {
      id: 'demo-sword',
      name: '月影长剑',
      category: '武器',
      art: 'sword',
      quantity: 1,
      use: 'wear',
      ownerId: 'lia',
      slot: 'weapon',
      effect: '按品级增加固定攻击数值。',
      description: '细长的银色剑身泛着冷光，护手如交错的月枝。',
    },
    {
      id: 'demo-ring',
      name: '星辉之戒',
      category: '饰品',
      art: 'ring',
      quantity: 2,
      use: 'wear',
      effect: '提供有绝对数值上限的属性加成。',
      description: '银色藤纹环抱着一枚深蓝宝石。',
    },
    {
      id: 'demo-armor',
      name: '银纹轻甲',
      category: '防具',
      art: 'armor',
      quantity: 1,
      use: 'wear',
      ownerId: 'lia',
      slot: 'armor',
      effect: '按品级提高固定防御。',
      description: '冷银甲片与深色内衬相叠，线条轻巧而紧密。',
    },
    {
      id: 'demo-pendant',
      name: '潮汐吊坠',
      category: '修为秘宝',
      art: 'pendant',
      quantity: 1,
      use: 'wear',
      effect: '佩戴期间提高修炼速度，受品级额度限制。',
      description: '一颗水色宝石，安静地悬在细金链上。',
    },
    {
      id: 'demo-shard',
      name: '碎星晶片',
      category: '特殊物品',
      art: 'shard',
      quantity: 4,
      use: 'special',
      effect: '独有机制尚待确定。',
      description: '断裂的晶片仍留着微光，等待被辨明用途。',
    },
    {
      id: 'demo-dagger',
      name: '夜行短匕',
      category: '武器',
      art: 'dagger',
      quantity: 1,
      use: 'wear',
      effect: '按品级增加固定攻击数值。',
      description: '黑蓝刀鞘收住锋芒，金色纹饰隐在暗处。',
    },
  ];
}
