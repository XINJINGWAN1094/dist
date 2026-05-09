import { ENABLE_INTENT_MODEL, INTENT_KEYS, INTENT_MAX_INPUT_LENGTH } from '../constants';
import { parseMessageTags } from '../parser/messageTags';
import { normalizeLineText } from '../stage/text';
import type { IntentKey, IntentModelPayload, IntentSpeaker, StageState } from '../types';
import { INTENT_JSON_SCHEMA } from './config';

function coerceNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIntentPayload(raw: unknown): IntentModelPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const intent = coerceString(candidate.intent) as IntentKey;
  if (!INTENT_KEYS.includes(intent)) {
    return null;
  }

  const speakerRaw = coerceString(candidate.speaker).toLowerCase();
  const speaker: IntentSpeaker = speakerRaw === 'left' || speakerRaw === 'right' ? speakerRaw : 'none';

  const confidence = Math.min(1, Math.max(0, coerceNumber(candidate.confidence, 0)));

  return {
    intent,
    confidence,
    speaker,
    scene_hint: coerceString(candidate.scene_hint),
    left_name: coerceString(candidate.left_name),
    left_pose: coerceString(candidate.left_pose),
    right_name: coerceString(candidate.right_name),
    right_pose: coerceString(candidate.right_pose),
    line: normalizeLineText(coerceString(candidate.line)),
    reason: coerceString(candidate.reason),
  };
}

export function shouldClassifyWithIntentModel(message: ChatMessage): boolean {
  if (!ENABLE_INTENT_MODEL) {
    return false;
  }
  if (message.role !== 'user') {
    return false;
  }

  const normalized = normalizeLineText(typeof message.message === 'string' ? message.message : '');
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith('/')) {
    return false;
  }

  if (parseMessageTags(normalized).hasRecognizedTag) {
    return false;
  }
  return true;
}

function buildIntentPrompt(messageText: string, current: StageState): string {
  const compactText = normalizeLineText(messageText).slice(0, INTENT_MAX_INPUT_LENGTH);
  return [
    '你是 galgame 舞台调度的意图分类器。',
    '只做分类，不写剧情，不解释，不输出多余文本。',
    '',
    '可选 intent（必须二选一返回其中之一）:',
    '- none: 不能确定明确动作或无需切场景/角色',
    '- go_station: 表达去车站/站台/等车',
    '- go_bridge: 表达去桥/天桥/雨夜桥段',
    '- go_theater: 表达去剧场/舞台/演出相关地点',
    '- go_shop: 表达去商店/采购/买卖',
    '- go_inn: 表达休息/回房/住宿',
    '- meet_mio: 明确想找“澪”互动',
    '- meet_rin: 明确想找“凛”互动',
    '',
    'speaker 仅返回 left/right/none。',
    'scene_hint 可留空；若文本明确地点，可填中文地点名。',
    'line 是适合对话框显示的一句短台词（可复述用户意图，20~40字优先）。',
    '',
    `当前舞台: 场景=${current.bgName}, 左角色=${current.leftName}/${current.leftPose}, 右角色=${current.rightName}/${current.rightPose}, 当前发言=${current.speaker}`,
    `待分类文本: ${compactText}`,
  ].join('\n');
}

export async function classifyIntentWithModel(messageText: string, current: StageState): Promise<IntentModelPayload | null> {
  try {
    const result = await generateRaw({
      should_silence: true,
      max_chat_history: 0,
      ordered_prompts: [
        {
          role: 'system',
          content: '你是高精度意图分类器。必须严格返回符合 schema 的 JSON。',
        },
        {
          role: 'user',
          content: buildIntentPrompt(messageText, current),
        },
      ],
      json_schema: INTENT_JSON_SCHEMA,
    });

    if (typeof result !== 'string') {
      return null;
    }

    const parsed = JSON.parse(result) as unknown;
    return normalizeIntentPayload(parsed);
  } catch (error) {
    console.error('[galgame-intent] classify failed:', error);
    return null;
  }
}
