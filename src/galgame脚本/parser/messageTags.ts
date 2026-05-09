import { TAG_KEY_LOOKUP } from '../constants';
import { normalizeLineText } from '../stage/text';
import type { ParsedTagResult, TagKey } from '../types';

export function normalizeTagKey(raw: string): TagKey | null {
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  return TAG_KEY_LOOKUP[compact] ?? null;
}

export function parseMessageTags(raw: string): ParsedTagResult {
  const tags: Partial<Record<TagKey, string>> = {};
  let hasRecognizedTag = false;

  const textWithoutTags = raw.replace(/\[([^\[\]]+)\]/g, (full, body: string) => {
    const separatorMatch = body.match(/[:=：]/);
    if (!separatorMatch || typeof separatorMatch.index !== 'number') {
      return full;
    }

    const separatorIndex = separatorMatch.index;
    const keyRaw = body.slice(0, separatorIndex).trim();
    const valueRaw = body.slice(separatorIndex + 1).trim();

    const key = normalizeTagKey(keyRaw);
    if (!key) {
      return full;
    }

    hasRecognizedTag = true;
    tags[key] = valueRaw;
    return '';
  });

  return {
    tags,
    cleanText: normalizeLineText(textWithoutTags),
    hasRecognizedTag,
  };
}
