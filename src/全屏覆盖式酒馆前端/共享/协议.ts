export const OVERLAY_NAMESPACE = 'th_fullscreen_overlay';

export const OVERLAY_EVENTS = {
  STATE_SYNC: `${OVERLAY_NAMESPACE}:state_sync`,
  REQUEST_NATIVE_SEND: `${OVERLAY_NAMESPACE}:request_native_send`,
  NATIVE_SEND_RESULT: `${OVERLAY_NAMESPACE}:native_send_result`,
  REQUEST_OVERLAY_VISIBILITY: `${OVERLAY_NAMESPACE}:request_overlay_visibility`,
  OVERLAY_VISIBILITY_CHANGED: `${OVERLAY_NAMESPACE}:overlay_visibility_changed`,
} as const;

export type OverlayLifecycleStage =
  | 'idle'
  | 'message_sent'
  | 'message_received'
  | 'generation_ended'
  | 'worldinfo_updated';

export type OverlaySyncState = {
  stage: OverlayLifecycleStage;
  lastMessageId: number | null;
  worldbookName: string | null;
  lastUserInputRaw: string;
  updatedAt: number;
};

export type NativeSendRequestPayload = {
  source: 'overlay_ui' | 'script' | 'unknown';
  inputPreview?: string;
  inputRaw?: string;
};

export type NativeSendResultPayload = {
  requestedBy: NativeSendRequestPayload['source'];
  clicked: boolean;
  reason?: string;
};

export type OverlayVisibilityPayload = {
  visible: boolean;
  source: 'overlay_ui' | 'launcher' | 'script' | 'unknown';
};
