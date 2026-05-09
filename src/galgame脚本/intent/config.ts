import { INTENT_KEYS, SCENE_CG_MAP } from '../constants';
import { buildGradientFromName } from '../stage/style';
import type { IntentKey, IntentStagePreset } from '../types';

export const INTENT_STAGE_PRESETS: Record<Exclude<IntentKey, 'none'>, IntentStagePreset> = {
  go_station: {
    bgName: '黄昏站台',
    bgStyle: buildGradientFromName('黄昏站台'),
    bgImageUrl: SCENE_CG_MAP.黄昏站台,
    speaker: 'left',
  },
  go_bridge: {
    bgName: '雨夜天桥',
    bgStyle: buildGradientFromName('雨夜天桥'),
    bgImageUrl: SCENE_CG_MAP.雨夜天桥,
    speaker: 'right',
  },
  go_theater: {
    bgName: '废弃剧场',
    bgStyle: buildGradientFromName('废弃剧场'),
    bgImageUrl: SCENE_CG_MAP.废弃剧场,
    speaker: 'left',
  },
  go_shop: {
    bgName: '夜市商店',
    bgStyle: buildGradientFromName('夜市商店'),
    bgImageUrl: SCENE_CG_MAP.夜市商店,
    speaker: 'right',
  },
  go_inn: {
    bgName: '旅店房间',
    bgStyle: buildGradientFromName('旅店房间'),
    bgImageUrl: SCENE_CG_MAP.旅店房间,
    speaker: 'left',
  },
  meet_mio: {
    leftName: '澪',
    leftPose: '专注',
    speaker: 'left',
  },
  meet_rin: {
    rightName: '凛',
    rightPose: '沉着',
    speaker: 'right',
  },
};

export const INTENT_JSON_SCHEMA: JsonSchema = {
  name: 'galgame_intent',
  description: '识别输入意图并输出可驱动 galgame 舞台的结构化字段',
  strict: true,
  value: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: INTENT_KEYS },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      speaker: { type: 'string', enum: ['left', 'right', 'none'] },
      scene_hint: { type: 'string' },
      left_name: { type: 'string' },
      left_pose: { type: 'string' },
      right_name: { type: 'string' },
      right_pose: { type: 'string' },
      line: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['intent', 'confidence', 'speaker', 'scene_hint', 'left_name', 'left_pose', 'right_name', 'right_pose', 'line', 'reason'],
  },
};
