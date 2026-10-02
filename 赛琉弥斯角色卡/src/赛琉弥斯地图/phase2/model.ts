import { z } from 'zod';
import { MAP_HEIGHT, MAP_WIDTH } from '../mapConstants';
import { formatStarRadianceTimeV2 } from './calendar';
import { TransportModeV2Schema, TravelSpeedsV2Schema, defaultTravelSpeedsV2 } from './travelProfile';

const MapSettingsV2ObjectSchema = z.object({
  schema_version: z.literal(2),
  position_control: z.enum(['manual', 'continuous', 'reported']),
  auto_travel: z.boolean(),
  clock_mode: z.enum(['narrative', 'realtime']),
  realtime_scale: z.coerce.number().finite().min(1).max(1440),
  idle_timeout_minutes: z.coerce.number().int().min(5).max(240),
  travel_speeds_kmh: TravelSpeedsV2Schema,
});

export const MapSettingsV2Schema = z
  .preprocess(
    input =>
      input && typeof input === 'object' && !Array.isArray(input)
        ? { travel_speeds_kmh: defaultTravelSpeedsV2(), ...input }
        : input,
    MapSettingsV2ObjectSchema,
  )
  .transform(settings => (settings.position_control === 'continuous' ? settings : { ...settings, auto_travel: false }));

export type MapSettingsV2 = z.infer<typeof MapSettingsV2Schema>;

export const MapSettingsPatchV2Schema = MapSettingsV2ObjectSchema.omit({ schema_version: true }).partial();
export type MapSettingsPatchV2 = z.infer<typeof MapSettingsPatchV2Schema>;

export const MapPositionSchema = z.object({
  x: z.coerce.number().finite().min(0).max(MAP_WIDTH),
  y: z.coerce.number().finite().min(0).max(MAP_HEIGHT),
});

export const LocationStateSchema = z.object({
  location_id: z.string().nullable().prefault(null),
  anchor_location_id: z.string().nullable(),
  map_position: MapPositionSchema.nullable(),
  detail: z.string(),
  certainty: z.enum(['confirmed', 'uncertain']),
});

export type LocationStateV2 = z.infer<typeof LocationStateSchema>;

export const JourneyHeadingSchema = z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
export type JourneyHeadingV2 = z.infer<typeof JourneyHeadingSchema>;

export const JourneyStateSchema = z
  .object({
    phase: z.enum(['idle', 'moving', 'blocked', 'review']),
    target_location_id: z.string().trim().min(1).nullable(),
    heading: JourneyHeadingSchema.nullable(),
    transport: TransportModeV2Schema.nullable(),
    began_at: z.string().trim().min(1).nullable().prefault(null),
    began_at_world_ms: z.coerce.number().int().nonnegative().nullable().prefault(null),
    last_settled_world_ms: z.coerce.number().int().nonnegative().nullable().prefault(null),
    status_detail: z.string().prefault(''),
  })
  .superRefine((journey, context) => {
    const routeCount = Number(Boolean(journey.target_location_id)) + Number(Boolean(journey.heading));
    if (journey.phase === 'idle') {
      if (
        routeCount > 0 ||
        journey.transport ||
        journey.began_at ||
        journey.began_at_world_ms !== null ||
        journey.last_settled_world_ms !== null
      ) {
        context.addIssue({ code: 'custom', message: '空闲旅行状态不能保留路线、行进速度类型或开始时间。' });
      }
      return;
    }
    if (routeCount !== 1) {
      context.addIssue({ code: 'custom', message: '进行中的旅行必须且只能设置目的地或总体方向之一。' });
    }
    if (!journey.transport || journey.began_at_world_ms === null || journey.last_settled_world_ms === null) {
      context.addIssue({ code: 'custom', message: '进行中的旅行必须保存行进速度类型与权威时间游标。' });
    } else if (journey.last_settled_world_ms < journey.began_at_world_ms) {
      context.addIssue({ code: 'custom', message: '旅行结算游标不能早于旅行开始时间。' });
    }
    if ((journey.phase === 'blocked' || journey.phase === 'review') && !journey.status_detail.trim()) {
      context.addIssue({ code: 'custom', message: '受阻或待核对状态必须说明原因。' });
    }
  });

export type JourneyStateV2 = z.infer<typeof JourneyStateSchema>;

export const TravelReportReviewSchema = z.object({
  report_id: z.string().trim().min(1),
  message_id: z.coerce.number().int().nonnegative(),
  kind: z.enum(['missing', 'invalid', 'uncertain']),
  detail: z.string().trim().min(1),
  recorded_at: z.string().trim().min(1),
});

export type TravelReportReviewV2 = z.infer<typeof TravelReportReviewSchema>;

export const TravelReportTrackingSchema = z
  .object({
    applied_report_ids: z.array(z.string().trim().min(1)).max(120).prefault([]),
    review: TravelReportReviewSchema.nullable().prefault(null),
  })
  .prefault({});

export type TravelReportTrackingV2 = z.infer<typeof TravelReportTrackingSchema>;

export const LocationReportReviewSchema = z.object({
  report_id: z.string().trim().min(1),
  message_id: z.coerce.number().int().nonnegative(),
  kind: z.enum(['missing', 'invalid', 'uncertain']),
  detail: z.string().trim().min(1),
  recorded_at: z.string().trim().min(1),
});

export type LocationReportReviewV2 = z.infer<typeof LocationReportReviewSchema>;

export const LocationReportTrackingSchema = z
  .object({
    applied_report_ids: z.array(z.string().trim().min(1)).max(120).prefault([]),
    review: LocationReportReviewSchema.nullable().prefault(null),
  })
  .prefault({});

export type LocationReportTrackingV2 = z.infer<typeof LocationReportTrackingSchema>;

export const NarrativeTimeReviewSchema = z.object({
  report_id: z.string().trim().min(1),
  message_id: z.coerce.number().int().nonnegative(),
  kind: z.enum(['missing', 'invalid', 'uncertain']),
  detail: z.string().trim().min(1),
  recorded_at: z.string().trim().min(1),
});

export type NarrativeTimeReviewV2 = z.infer<typeof NarrativeTimeReviewSchema>;

export const WorldClockStateSchema = z
  .object({
    elapsed_world_ms: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).prefault(0),
    applied_settlement_ids: z.array(z.string().trim().min(1)).max(120).prefault([]),
    last_settlement_id: z.string().trim().min(1).nullable().prefault(null),
    last_settlement_source: z.enum(['narrative', 'realtime']).nullable().prefault(null),
    last_settlement_world_ms: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).prefault(0),
    narrative_time_review: NarrativeTimeReviewSchema.nullable().prefault(null),
  })
  .prefault({});

export type WorldClockStateV2 = z.infer<typeof WorldClockStateSchema>;

export const StoryFactsCursorV2Schema = z.object({
  injection_id: z.string().trim().min(1),
  elapsed_world_ms: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  location_detail: z.string(),
});

export type StoryFactsCursorV2 = z.infer<typeof StoryFactsCursorV2Schema>;

export const WorldStateV2Schema = z
  .object({
    schema_version: z.literal(2),
    location: LocationStateSchema,
    world_time: z.string().nullable().prefault(null),
    clock: WorldClockStateSchema,
    journey: JourneyStateSchema,
    travel_reports: TravelReportTrackingSchema,
    location_reports: LocationReportTrackingSchema,
    story_facts_cursor: StoryFactsCursorV2Schema.nullable().prefault(null),
    revision: z.coerce.number().int().nonnegative(),
    changed_by: z.enum(['initial', 'manual', 'continuous', 'reported', 'journey', 'clock', 'injection']),
    changed_at: z.string(),
  })
  .transform(state => ({ ...state, world_time: formatStarRadianceTimeV2(state.clock.elapsed_world_ms) }));

export type WorldStateV2 = z.infer<typeof WorldStateV2Schema>;

export const BranchPointSchema = z.object({
  tokens: z.array(z.string()),
  last_message_id: z.coerce.number().int(),
});

export type BranchPoint = z.infer<typeof BranchPointSchema>;

export const StateSnapshotV2Schema = z.object({
  snapshot_id: z.string(),
  branch: BranchPointSchema,
  state: WorldStateV2Schema,
  saved_at: z.string(),
});

export type StateSnapshotV2 = z.infer<typeof StateSnapshotV2Schema>;

const LEGACY_SURFACE_BLOCK_PATTERN = /(?:不能从当前(?:水域|陆地)继续|前方没有可通行的连续路径)/;

function migrateLegacySurfaceBlock(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const state = input as Record<string, unknown>;
  const journey = state.journey;
  if (!journey || typeof journey !== 'object' || Array.isArray(journey)) return input;
  const journeyRecord = journey as Record<string, unknown>;
  if (
    journeyRecord.phase !== 'blocked' ||
    !LEGACY_SURFACE_BLOCK_PATTERN.test(String(journeyRecord.status_detail ?? ''))
  ) {
    return input;
  }
  return {
    ...state,
    journey: {
      ...journeyRecord,
      phase: 'moving',
      status_detail: '旧版海陆阻隔已解除，旅行将按新的行进速度类型继续结算。',
    },
  };
}

const ChatStoreV2ObjectSchema = z.object({
  schema_version: z.literal(2),
  travel_rules_version: z.literal(2).prefault(2),
  branch_identity_version: z.literal(2).prefault(2),
  settings_patch: MapSettingsPatchV2Schema,
  baseline: WorldStateV2Schema,
  current: WorldStateV2Schema,
  active_snapshot_id: z.string().nullable(),
  history: z.array(StateSnapshotV2Schema),
});

export const ChatStoreV2Schema = z.preprocess(input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const store = input as Record<string, unknown>;
  if (store.travel_rules_version === 2) return store;
  return {
    ...store,
    travel_rules_version: 2,
    branch_identity_version: 2,
    baseline: migrateLegacySurfaceBlock(store.baseline),
    current: migrateLegacySurfaceBlock(store.current),
    history: Array.isArray(store.history)
      ? store.history.map(snapshot => {
          if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot;
          const snapshotRecord = snapshot as Record<string, unknown>;
          return { ...snapshotRecord, state: migrateLegacySurfaceBlock(snapshotRecord.state) };
        })
      : store.history,
  };
}, ChatStoreV2ObjectSchema);

export type ChatStoreV2 = z.infer<typeof ChatStoreV2Schema>;

export function defaultMapSettingsV2(): MapSettingsV2 {
  return {
    schema_version: 2,
    position_control: 'manual',
    auto_travel: false,
    clock_mode: 'narrative',
    realtime_scale: 60,
    idle_timeout_minutes: 30,
    travel_speeds_kmh: defaultTravelSpeedsV2(),
  };
}

export function initialWorldStateV2(): WorldStateV2 {
  return {
    schema_version: 2,
    location: {
      location_id: null,
      anchor_location_id: null,
      map_position: null,
      detail: '',
      certainty: 'uncertain',
    },
    world_time: formatStarRadianceTimeV2(0),
    clock: {
      elapsed_world_ms: 0,
      applied_settlement_ids: [],
      last_settlement_id: null,
      last_settlement_source: null,
      last_settlement_world_ms: 0,
      narrative_time_review: null,
    },
    journey: {
      phase: 'idle',
      target_location_id: null,
      heading: null,
      transport: null,
      began_at: null,
      began_at_world_ms: null,
      last_settled_world_ms: null,
      status_detail: '',
    },
    travel_reports: {
      applied_report_ids: [],
      review: null,
    },
    location_reports: {
      applied_report_ids: [],
      review: null,
    },
    story_facts_cursor: null,
    revision: 0,
    changed_by: 'initial',
    changed_at: new Date(0).toISOString(),
  };
}

export function emptyChatStoreV2(): ChatStoreV2 {
  const baseline = initialWorldStateV2();
  return {
    schema_version: 2,
    travel_rules_version: 2,
    branch_identity_version: 2,
    settings_patch: {},
    baseline,
    current: baseline,
    active_snapshot_id: null,
    history: [],
  };
}
