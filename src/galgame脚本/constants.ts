import type { IntentKey, TagKey } from './types';

export const PAGE_SCOPE = '.thGalgameShell';
export const LAUNCHER_ID = 'th-galgame-shell-launcher';
export const FRAME_ID = 'th-galgame-shell-frame';
export const CLOSE_ID = 'th-galgame-shell-close';
export const STATUS_ID = 'th-galgame-shell-status';
export const NEXT_LINE_ID = 'th-galgame-shell-next-line';
export const TOGGLE_AUTO_ID = 'th-galgame-shell-toggle-auto';
export const TOGGLE_LOG_ID = 'th-galgame-shell-toggle-log';
export const TOGGLE_UI_ID = 'th-galgame-shell-toggle-ui';
export const QUICK_SHOW_UI_ID = 'th-galgame-shell-quick-show-ui';
export const SKIP_ID = 'th-galgame-shell-skip';
export const LOG_PANEL_ID = 'th-galgame-shell-log-panel';
export const LOG_LIST_ID = 'th-galgame-shell-log-list';
export const TOGGLE_SPEAKER_ID = 'th-galgame-shell-toggle-speaker';

export const TAG_KEY_LOOKUP: Record<string, TagKey> = {
  bg: 'bg',
  background: 'bg',
  scene: 'bg',
  场景: 'bg',
  背景: 'bg',
  bgstyle: 'bg_style',
  scenestyle: 'bg_style',
  背景样式: 'bg_style',
  left: 'left',
  l: 'left',
  左: 'left',
  左侧: 'left',
  right: 'right',
  r: 'right',
  右: 'right',
  右侧: 'right',
  leftpose: 'left_pose',
  lpose: 'left_pose',
  左表情: 'left_pose',
  rightpose: 'right_pose',
  rpose: 'right_pose',
  右表情: 'right_pose',
  speaker: 'speaker',
  talker: 'speaker',
  发言: 'speaker',
  说话人: 'speaker',
  line: 'line',
  text: 'line',
  台词: 'line',
  对白: 'line',
};

export const ENABLE_INTENT_MODEL = true;
export const INTENT_CONFIDENCE_THRESHOLD = 0.62;
export const INTENT_MAX_INPUT_LENGTH = 260;

export const SCENE_CG_MAP: Record<string, string> = {
  黄昏站台: 'https://picsum.photos/seed/th-galgame-station/1600/900',
  雨夜天桥: 'https://picsum.photos/seed/th-galgame-bridge/1600/900',
  废弃剧场: 'https://picsum.photos/seed/th-galgame-theater/1600/900',
  夜市商店: 'https://picsum.photos/seed/th-galgame-shop/1600/900',
  旅店房间: 'https://picsum.photos/seed/th-galgame-inn/1600/900',
};

export const INTENT_KEYS: IntentKey[] = ['none', 'go_station', 'go_bridge', 'go_theater', 'go_shop', 'go_inn', 'meet_mio', 'meet_rin'];
