import type { Speaker } from '../types';

export function normalizeLineText(raw: string): string {
  return raw
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitNamePose(value: string): { name?: string; pose?: string } {
  const compact = value.trim();
  if (!compact) {
    return {};
  }

  const pieces = compact.split(/[|｜,，]/).map(piece => piece.trim());
  if (pieces.length <= 1) {
    return { name: compact };
  }

  const name = pieces[0];
  const pose = pieces.slice(1).join(' · ').trim();
  return {
    name: name || undefined,
    pose: pose || undefined,
  };
}

export function normalizeSpeaker(value: string, leftName: string, rightName: string, fallback: Speaker): Speaker {
  const compact = value.replace(/\s+/g, '').toLowerCase();

  if (compact === 'left' || compact === 'l' || compact === '左' || compact === '左侧') {
    return 'left';
  }
  if (compact === 'right' || compact === 'r' || compact === '右' || compact === '右侧') {
    return 'right';
  }

  if (value.trim() === leftName.trim()) {
    return 'left';
  }
  if (value.trim() === rightName.trim()) {
    return 'right';
  }
  return fallback;
}
