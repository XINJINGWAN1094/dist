export type Speaker = 'left' | 'right';

export type DemoScene = {
  bgName: string;
  bgStyle: string;
  leftName: string;
  leftPose: string;
  rightName: string;
  rightPose: string;
  speaker: Speaker;
  line: string;
  note: string;
};

export type StageState = {
  bgName: string;
  bgStyle: string;
  bgImageUrl?: string;
  leftName: string;
  leftPose: string;
  rightName: string;
  rightPose: string;
  speaker: Speaker;
  line: string;
  status: string;
  lastSyncMessageId: number | null;
  source: 'demo' | 'chat' | 'intent';
};

export type TagKey = 'bg' | 'bg_style' | 'left' | 'left_pose' | 'right' | 'right_pose' | 'speaker' | 'line';

export type ParsedTagResult = {
  tags: Partial<Record<TagKey, string>>;
  cleanText: string;
  hasRecognizedTag: boolean;
};

export type FrameController = {
  applyState: (state: StageState) => void;
  setControlsState: (state: FrameControlsState) => void;
  setLogEntries: (entries: FrameLogEntry[]) => void;
};

export type FrameControlsState = {
  autoMode: boolean;
  uiHidden: boolean;
  logOpen: boolean;
  historyCursor: number;
  historyCount: number;
};

export type FrameLogEntry = {
  id: number;
  title: string;
  meta: string;
  line: string;
  active: boolean;
};

export type IntentKey =
  | 'none'
  | 'go_station'
  | 'go_bridge'
  | 'go_theater'
  | 'go_shop'
  | 'go_inn'
  | 'meet_mio'
  | 'meet_rin';

export type IntentSpeaker = Speaker | 'none';

export type IntentModelPayload = {
  intent: IntentKey;
  confidence: number;
  speaker: IntentSpeaker;
  scene_hint: string;
  left_name: string;
  left_pose: string;
  right_name: string;
  right_pose: string;
  line: string;
  reason: string;
};

export type IntentStagePreset = Partial<
  Pick<StageState, 'bgName' | 'bgStyle' | 'bgImageUrl' | 'leftName' | 'leftPose' | 'rightName' | 'rightPose' | 'speaker'>
>;
