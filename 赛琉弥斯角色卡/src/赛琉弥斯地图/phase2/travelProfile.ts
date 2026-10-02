import { z } from 'zod';

export const MAP_KILOMETERS_PER_UNIT_V2 = 5;
export const TRAVEL_STEP_MAP_UNITS_V2 = 2;
export const MAX_TRAVEL_STEPS_PER_SETTLEMENT_V2 = 8192;

export const TRANSPORT_MODE_IDS_V2 = ['walking', 'riding', 'flying'] as const;
const CurrentTransportModeV2Schema = z.enum(TRANSPORT_MODE_IDS_V2);

/**
 * `transport` 是 v1 报告协议沿用的字段名；从规则 v2 起，其值表示叙事中的有效行进速度类型，
 * 而不是具体交通工具。旧存档中的 carriage / sailing 统一迁移到骑乘级别速度。
 */
export const TransportModeV2Schema = z.preprocess(input => {
  if (typeof input !== 'string') return input;
  const normalized = input.trim().toLocaleLowerCase('zh-CN');
  if (normalized === 'carriage' || normalized === 'sailing') return 'riding';
  return normalized;
}, CurrentTransportModeV2Schema);

export type TransportModeV2 = z.infer<typeof TransportModeV2Schema>;

export interface TransportProfileV2 {
  label: string;
  description: string;
  aliases: readonly string[];
  default_speed_kmh: number;
}

export const TRANSPORT_PROFILES_V2: Readonly<Record<TransportModeV2, TransportProfileV2>> = {
  walking: {
    label: '步行速度',
    description: '徒步、缓慢载具或同等级移动',
    aliases: ['徒步', '步行', '步行旅行', '缓慢移动', 'walking speed'],
    default_speed_kmh: 5,
  },
  riding: {
    label: '骑乘速度',
    description: '坐骑、车辆、舟船或同等级移动',
    aliases: [
      '骑乘',
      '骑马',
      '马匹',
      '坐骑',
      '车马',
      '马车',
      '车队',
      '兽车',
      '帆船',
      '航海',
      '船只',
      '船舶',
      'carriage',
      'sailing',
      'riding speed',
    ],
    default_speed_kmh: 12,
  },
  flying: {
    label: '飞行速度',
    description: '持续飞行或同等级高速移动',
    aliases: ['飞行', '飞翔', '空中移动', '飞行坐骑', 'flying speed'],
    default_speed_kmh: 30,
  },
};

export const TRANSPORT_SPEED_LIMITS_V2: Readonly<Record<TransportModeV2, { min: number; max: number }>> = {
  walking: { min: 1, max: 20 },
  riding: { min: 1, max: 80 },
  flying: { min: 1, max: 240 },
};

const TravelSpeedsV2ObjectSchema = z.object({
  walking: z.coerce
    .number()
    .finite()
    .min(TRANSPORT_SPEED_LIMITS_V2.walking.min)
    .max(TRANSPORT_SPEED_LIMITS_V2.walking.max),
  riding: z.coerce
    .number()
    .finite()
    .min(TRANSPORT_SPEED_LIMITS_V2.riding.min)
    .max(TRANSPORT_SPEED_LIMITS_V2.riding.max),
  flying: z.coerce
    .number()
    .finite()
    .min(TRANSPORT_SPEED_LIMITS_V2.flying.min)
    .max(TRANSPORT_SPEED_LIMITS_V2.flying.max),
});

const DEFAULT_TRAVEL_SPEEDS_V2 = {
  walking: TRANSPORT_PROFILES_V2.walking.default_speed_kmh,
  riding: TRANSPORT_PROFILES_V2.riding.default_speed_kmh,
  flying: TRANSPORT_PROFILES_V2.flying.default_speed_kmh,
};

export const TravelSpeedsV2Schema = z.preprocess(input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  return { ...DEFAULT_TRAVEL_SPEEDS_V2, ...input };
}, TravelSpeedsV2ObjectSchema);

export type TravelSpeedsV2 = z.infer<typeof TravelSpeedsV2Schema>;

export function defaultTravelSpeedsV2(): TravelSpeedsV2 {
  return TravelSpeedsV2ObjectSchema.parse(DEFAULT_TRAVEL_SPEEDS_V2);
}

export function normalizeTransportModeV2(input: string | null | undefined): TransportModeV2 | null {
  const normalized = input?.trim().toLocaleLowerCase('zh-CN');
  if (!normalized) return 'walking';

  const legacy = TransportModeV2Schema.safeParse(normalized);
  if (legacy.success) return legacy.data;

  for (const mode of TRANSPORT_MODE_IDS_V2) {
    const profile = TRANSPORT_PROFILES_V2[mode];
    const names = [profile.label, ...profile.aliases];
    if (names.some(name => name.toLocaleLowerCase('zh-CN') === normalized)) return mode;
  }
  return null;
}
