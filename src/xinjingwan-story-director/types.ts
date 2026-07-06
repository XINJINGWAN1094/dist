export const CHAT_STATE_KEY = 'xinjingwan_story_director';
export const ENTRY_SOURCE = 'XINJINGWAN-2026-StoryDirector';
export const SCRIPT_BUTTON_NAME = '打开剧情指导';

export type StoryDirectorMode = 'outline' | 'endingReference' | 'timedEnding';
export type UiTab = StoryDirectorMode;

export type StoryDirectorEntryType =
  | 'outlineContent'
  | 'outlineRule'
  | 'outlineProgress'
  | 'endingReference'
  | 'timedEnding';

export type OutlinePage = {
  id: string;
  nodes: string[];
  completed: boolean;
  lastKnownNode: number;
};

export type TimedActiveRange = {
  startMessageId: number;
  endMessageId: number | null;
};

export type SyncStatus = {
  reason: string;
  activeMode: StoryDirectorMode | null;
  targetWorldbookName: string | null;
  changedEntries: number;
  warnings: string[];
  outlineCurrentNode: number;
  outlineMvuAvailable: boolean;
  timedCompletedReplyCount: number;
  timedNextReplyIndex: number;
  lastSyncedAt: string;
};

export type StoryDirectorState = {
  version: 1;
  activeMode: StoryDirectorMode | null;
  targetWorldbookName: string | null;
  ui: {
    visible: boolean;
    tab: UiTab;
  };
  outline: {
    pages: OutlinePage[];
    selectedPageId: string;
    enabledPageId: string | null;
  };
  endingReference: {
    text: string;
    enabled: boolean;
  };
  timedEnding: {
    goalText: string;
    targetReplyIndex: number;
    active: boolean;
    sessionId: string | null;
    sessionSerial: number;
    ranges: TimedActiveRange[];
    completedReplyCount: number;
    nextReplyIndex: number;
  };
  status: SyncStatus;
};

export type StateListener = (state: StoryDirectorState) => void;
