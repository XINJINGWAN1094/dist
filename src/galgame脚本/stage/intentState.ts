import { INTENT_CONFIDENCE_THRESHOLD, SCENE_CG_MAP } from '../constants';
import { INTENT_STAGE_PRESETS } from '../intent/config';
import { buildGradientFromName } from './style';
import type { IntentModelPayload, StageState } from '../types';

export function applyIntentResult(current: StageState, payload: IntentModelPayload, messageId: number): StageState | null {
  if (payload.intent === 'none' || payload.confidence < INTENT_CONFIDENCE_THRESHOLD) {
    return null;
  }

  const next: StageState = { ...current };
  let changed = false;

  const preset = INTENT_STAGE_PRESETS[payload.intent];
  if (preset) {
    if (preset.bgName && next.bgName !== preset.bgName) {
      next.bgName = preset.bgName;
      changed = true;
    }
    if (preset.bgStyle && next.bgStyle !== preset.bgStyle) {
      next.bgStyle = preset.bgStyle;
      changed = true;
    }
    if (preset.bgImageUrl && next.bgImageUrl !== preset.bgImageUrl) {
      next.bgImageUrl = preset.bgImageUrl;
      changed = true;
    }
    if (preset.leftName && next.leftName !== preset.leftName) {
      next.leftName = preset.leftName;
      changed = true;
    }
    if (preset.leftPose && next.leftPose !== preset.leftPose) {
      next.leftPose = preset.leftPose;
      changed = true;
    }
    if (preset.rightName && next.rightName !== preset.rightName) {
      next.rightName = preset.rightName;
      changed = true;
    }
    if (preset.rightPose && next.rightPose !== preset.rightPose) {
      next.rightPose = preset.rightPose;
      changed = true;
    }
    if (preset.speaker && next.speaker !== preset.speaker) {
      next.speaker = preset.speaker;
      changed = true;
    }
  }

  if (payload.scene_hint) {
    if (next.bgName !== payload.scene_hint) {
      next.bgName = payload.scene_hint;
      changed = true;
    }
    if (SCENE_CG_MAP[payload.scene_hint]) {
      if (next.bgImageUrl !== SCENE_CG_MAP[payload.scene_hint]) {
        next.bgImageUrl = SCENE_CG_MAP[payload.scene_hint];
        changed = true;
      }
    } else {
      if (next.bgImageUrl) {
        next.bgImageUrl = undefined;
        changed = true;
      }
      const sceneStyle = buildGradientFromName(payload.scene_hint);
      if (next.bgStyle !== sceneStyle) {
        next.bgStyle = sceneStyle;
        changed = true;
      }
    }
  }

  if (payload.speaker !== 'none' && next.speaker !== payload.speaker) {
    next.speaker = payload.speaker;
    changed = true;
  }

  if (payload.left_name && next.leftName !== payload.left_name) {
    next.leftName = payload.left_name;
    changed = true;
  }
  if (payload.left_pose && next.leftPose !== payload.left_pose) {
    next.leftPose = payload.left_pose;
    changed = true;
  }
  if (payload.right_name && next.rightName !== payload.right_name) {
    next.rightName = payload.right_name;
    changed = true;
  }
  if (payload.right_pose && next.rightPose !== payload.right_pose) {
    next.rightPose = payload.right_pose;
    changed = true;
  }
  if (payload.line && next.line !== payload.line) {
    next.line = payload.line;
    changed = true;
  }

  const confidencePercent = Math.round(payload.confidence * 100);
  const reasonText = payload.reason ? `，${payload.reason}` : '';
  const status = `状态：意图识别=${payload.intent}（${confidencePercent}%）${reasonText}`;
  if (next.status !== status) {
    next.status = status;
    changed = true;
  }

  if (next.source !== 'intent') {
    next.source = 'intent';
    changed = true;
  }

  if (next.lastSyncMessageId !== messageId) {
    next.lastSyncMessageId = messageId;
    changed = true;
  }

  return changed ? next : null;
}
