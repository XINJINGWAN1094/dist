import { SCENE_CG_MAP } from '../constants';
import { parseMessageTags } from '../parser/messageTags';
import { buildGradientFromName } from './style';
import { normalizeLineText, normalizeSpeaker, splitNamePose } from './text';
import type { StageState } from '../types';

export function buildStateFromChatMessage(message: ChatMessage, current: StageState): StageState | null {
  const rawMessage = typeof message.message === 'string' ? message.message : '';
  const normalizedMessage = normalizeLineText(rawMessage);
  if (!normalizedMessage) {
    return null;
  }

  const parsed = parseMessageTags(normalizedMessage);
  const next: StageState = { ...current };
  let changed = false;

  if (!parsed.hasRecognizedTag) {
    if (message.role !== 'assistant') {
      return null;
    }

    if (current.lastSyncMessageId === message.message_id && current.line === parsed.cleanText) {
      return null;
    }

    if (parsed.cleanText && next.line !== parsed.cleanText) {
      next.line = parsed.cleanText;
      changed = true;
    }

    const nextStatus = `状态：已同步 AI 回复（消息 ${message.message_id}）`;
    if (next.status !== nextStatus) {
      next.status = nextStatus;
      changed = true;
    }

    if (next.source !== 'chat') {
      next.source = 'chat';
      changed = true;
    }

    if (next.lastSyncMessageId !== message.message_id) {
      next.lastSyncMessageId = message.message_id;
      changed = true;
    }

    return changed ? next : null;
  }

  const leftInfo = parsed.tags.left ? splitNamePose(parsed.tags.left) : {};
  const rightInfo = parsed.tags.right ? splitNamePose(parsed.tags.right) : {};

  if (parsed.tags.bg) {
    const bgName = parsed.tags.bg.trim();
    if (bgName && next.bgName !== bgName) {
      next.bgName = bgName;
      next.bgStyle = buildGradientFromName(bgName);
      next.bgImageUrl = SCENE_CG_MAP[bgName];
      changed = true;
    }
  }

  if (parsed.tags.bg_style) {
    const bgStyle = parsed.tags.bg_style.trim();
    if (bgStyle && next.bgStyle !== bgStyle) {
      next.bgStyle = bgStyle;
      next.bgImageUrl = undefined;
      changed = true;
    }
  }

  if (leftInfo.name && next.leftName !== leftInfo.name) {
    next.leftName = leftInfo.name;
    changed = true;
  }
  if (leftInfo.pose && next.leftPose !== leftInfo.pose) {
    next.leftPose = leftInfo.pose;
    changed = true;
  }

  if (rightInfo.name && next.rightName !== rightInfo.name) {
    next.rightName = rightInfo.name;
    changed = true;
  }
  if (rightInfo.pose && next.rightPose !== rightInfo.pose) {
    next.rightPose = rightInfo.pose;
    changed = true;
  }

  if (parsed.tags.left_pose) {
    const leftPose = parsed.tags.left_pose.trim();
    if (leftPose && next.leftPose !== leftPose) {
      next.leftPose = leftPose;
      changed = true;
    }
  }

  if (parsed.tags.right_pose) {
    const rightPose = parsed.tags.right_pose.trim();
    if (rightPose && next.rightPose !== rightPose) {
      next.rightPose = rightPose;
      changed = true;
    }
  }

  if (parsed.tags.speaker) {
    const parsedSpeaker = normalizeSpeaker(parsed.tags.speaker, next.leftName, next.rightName, next.speaker);
    if (next.speaker !== parsedSpeaker) {
      next.speaker = parsedSpeaker;
      changed = true;
    }
  }

  const lineCandidate = normalizeLineText(parsed.tags.line ?? parsed.cleanText);
  if (lineCandidate && next.line !== lineCandidate) {
    next.line = lineCandidate;
    changed = true;
  }

  const nextStatus = `状态：已解析消息 ${message.message_id} 的舞台标记`;
  if (next.status !== nextStatus) {
    next.status = nextStatus;
    changed = true;
  }

  if (next.source !== 'chat') {
    next.source = 'chat';
    changed = true;
  }

  if (next.lastSyncMessageId !== message.message_id) {
    next.lastSyncMessageId = message.message_id;
    changed = true;
  }

  return changed ? next : null;
}
