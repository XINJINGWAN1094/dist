import {
  OVERLAY_EVENTS,
  type NativeSendRequestPayload,
  type NativeSendResultPayload,
} from '../共享/协议';

const SEND_BUTTON_SELECTORS = [
  '#send_but',
  '#send_button',
  '#send_form button[type="submit"]',
  '.send_button',
] as const;
const INPUT_SELECTORS = ['#send_textarea', '#chat-input textarea', '#send_form textarea'] as const;

function findNativeSendButton(): JQuery<HTMLElement> {
  for (const selector of SEND_BUTTON_SELECTORS) {
    const $button = $(selector).first() as JQuery<HTMLElement>;
    if ($button.length > 0 && !$button.prop('disabled')) {
      return $button;
    }
  }
  return $() as JQuery<HTMLElement>;
}

function clickNativeSendButton(): NativeSendResultPayload {
  const $button = findNativeSendButton();
  if ($button.length === 0) {
    return {
      requestedBy: 'unknown',
      clicked: false,
      reason: '未找到可点击的原生发送按钮。',
    };
  }

  $button.trigger('click');
  return {
    requestedBy: 'unknown',
    clicked: true,
  };
}

function findNativeInput(): JQuery<HTMLTextAreaElement | HTMLInputElement> {
  for (const selector of INPUT_SELECTORS) {
    const $input = $(selector).first() as JQuery<HTMLTextAreaElement | HTMLInputElement>;
    if ($input.length > 0) {
      return $input;
    }
  }
  return $() as JQuery<HTMLTextAreaElement | HTMLInputElement>;
}

function applyInputRaw(raw: string): boolean {
  const $input = findNativeInput();
  if ($input.length === 0) {
    return false;
  }

  $input.val(raw);
  $input.trigger('input');
  $input.trigger('change');
  return true;
}

function normalizeRequestPayload(payload: unknown): NativeSendRequestPayload {
  if (!payload || typeof payload !== 'object') {
    return { source: 'unknown' };
  }

  const record = payload as Record<string, unknown>;
  const source =
    record.source === 'overlay_ui' || record.source === 'script' || record.source === 'unknown'
      ? record.source
      : 'unknown';
  const inputPreview = typeof record.inputPreview === 'string' ? record.inputPreview : undefined;
  const inputRaw = typeof record.inputRaw === 'string' ? record.inputRaw : undefined;

  return { source, inputPreview, inputRaw };
}

export function registerNativeSendBridge() {
  const stop = eventOn(OVERLAY_EVENTS.REQUEST_NATIVE_SEND, rawPayload => {
    const payload = normalizeRequestPayload(rawPayload);
    if (payload.inputRaw !== undefined) {
      const hasApplied = applyInputRaw(payload.inputRaw);
      if (!hasApplied) {
        void eventEmit(OVERLAY_EVENTS.NATIVE_SEND_RESULT, {
          requestedBy: payload.source,
          clicked: false,
          reason: '未找到可写入的原生输入框。',
        } satisfies NativeSendResultPayload);
        return;
      }
    }

    const result = clickNativeSendButton();
    result.requestedBy = payload.source;
    if (!result.clicked && payload.inputPreview) {
      console.warn('[全屏覆盖式酒馆前端] 请求原生发送失败，输入预览:', payload.inputPreview);
    }
    void eventEmit(OVERLAY_EVENTS.NATIVE_SEND_RESULT, result);
  }).stop;

  return { stop };
}
