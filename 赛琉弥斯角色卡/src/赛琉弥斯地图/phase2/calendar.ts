export const STAR_RADIANCE_EPOCH_V2 = {
  year: 742,
  month: 3,
  day: 18,
  hour: 8,
  minute: 0,
  second: 0,
} as const;

export const STAR_RADIANCE_DAYS_PER_MONTH_V2 = 30;
export const STAR_RADIANCE_MONTHS_PER_YEAR_V2 = 12;
export const STAR_RADIANCE_DAYS_PER_YEAR_V2 = STAR_RADIANCE_DAYS_PER_MONTH_V2 * STAR_RADIANCE_MONTHS_PER_YEAR_V2;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export interface StarRadianceDateTimeV2 {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function assertElapsedWorldMs(elapsedWorldMs: number): number {
  if (!Number.isSafeInteger(elapsedWorldMs) || elapsedWorldMs < 0) {
    throw new Error('世界经过时长必须是非负安全整数毫秒。');
  }
  return elapsedWorldMs;
}

export function starRadianceDateTimeFromElapsedMsV2(elapsedWorldMs: number): StarRadianceDateTimeV2 {
  const elapsedSeconds = Math.floor(assertElapsedWorldMs(elapsedWorldMs) / 1000);
  const epochDayOfYear =
    (STAR_RADIANCE_EPOCH_V2.month - 1) * STAR_RADIANCE_DAYS_PER_MONTH_V2 + (STAR_RADIANCE_EPOCH_V2.day - 1);
  const epochSecondOfDay =
    STAR_RADIANCE_EPOCH_V2.hour * SECONDS_PER_HOUR +
    STAR_RADIANCE_EPOCH_V2.minute * SECONDS_PER_MINUTE +
    STAR_RADIANCE_EPOCH_V2.second;
  const elapsedDays = Math.floor((epochSecondOfDay + elapsedSeconds) / SECONDS_PER_DAY);
  const secondOfDay = (epochSecondOfDay + elapsedSeconds) % SECONDS_PER_DAY;
  const absoluteDay = epochDayOfYear + elapsedDays;
  const year = STAR_RADIANCE_EPOCH_V2.year + Math.floor(absoluteDay / STAR_RADIANCE_DAYS_PER_YEAR_V2);
  const dayOfYear = absoluteDay % STAR_RADIANCE_DAYS_PER_YEAR_V2;

  return {
    year,
    month: Math.floor(dayOfYear / STAR_RADIANCE_DAYS_PER_MONTH_V2) + 1,
    day: (dayOfYear % STAR_RADIANCE_DAYS_PER_MONTH_V2) + 1,
    hour: Math.floor(secondOfDay / SECONDS_PER_HOUR),
    minute: Math.floor((secondOfDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    second: secondOfDay % SECONDS_PER_MINUTE,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatStarRadianceTimeV2(elapsedWorldMs: number): string {
  const value = starRadianceDateTimeFromElapsedMsV2(elapsedWorldMs);
  return `星辉历 ${value.year}年${pad2(value.month)}月${pad2(value.day)}日 ${pad2(value.hour)}:${pad2(value.minute)}:${pad2(value.second)}`;
}
