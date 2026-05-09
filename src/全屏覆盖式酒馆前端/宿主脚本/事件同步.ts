import { OVERLAY_EVENTS, type OverlaySyncState } from '../共享/协议';

const INPUT_SELECTORS = ['#send_textarea', '#chat-input textarea', '#send_form textarea'] as const;

function createInitialState(): OverlaySyncState {
  return {
    stage: 'idle',
    lastMessageId: null,
    worldbookName: null,
    lastUserInputRaw: '',
    updatedAt: Date.now(),
  };
}

function syncState(state: OverlaySyncState) {
  void eventEmit(OVERLAY_EVENTS.STATE_SYNC, _.cloneDeep(state));
}

function readInputTextFromElement(element: Element | null): string {
  if (!element) {
    return '';
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return String(element.value ?? '');
  }

  const $element = $(element);
  return $element.val?.()?.toString?.() ?? $element.text().toString();
}

function findInputElement(): Element | null {
  for (const selector of INPUT_SELECTORS) {
    const $input = $(selector).first();
    if ($input.length > 0) {
      return $input[0];
    }
  }

  return null;
}

function readCurrentRawInput(): string {
  return readInputTextFromElement(findInputElement()).trim();
}

export function registerCoreEventSync() {
  const state = createInitialState();
  const stopHandles: Array<() => void> = [];
  let latestRawInput = '';

  const apply = (next: Partial<OverlaySyncState>) => {
    Object.assign(state, next, { updatedAt: Date.now() });
    syncState(state);
  };

  const captureDraftFromCurrentInput = () => {
    latestRawInput = readCurrentRawInput();
  };

  const inputSelectorJoined = INPUT_SELECTORS.join(',');

  $(document).on('input.thFullscreenOverlayDraft', inputSelectorJoined, event => {
    latestRawInput = readInputTextFromElement(event.currentTarget as Element).trim();
  });
  $(document).on('focus.thFullscreenOverlayDraft', inputSelectorJoined, captureDraftFromCurrentInput);
  $(document).on('click.thFullscreenOverlayDraft', '#send_but, #send_button, #send_form button[type="submit"]', () => {
    captureDraftFromCurrentInput();
  });
  $(document).on('keydown.thFullscreenOverlayDraft', inputSelectorJoined, event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      latestRawInput = readInputTextFromElement(event.currentTarget as Element).trim();
    }
  });

  stopHandles.push(() => {
    $(document).off('.thFullscreenOverlayDraft');
  });

  stopHandles.push(
    eventOn(tavern_events.MESSAGE_SENT, messageId => {
      const rawInput = latestRawInput || readCurrentRawInput();
      apply({
        stage: 'message_sent',
        lastMessageId: messageId,
        lastUserInputRaw: rawInput,
      });
      latestRawInput = '';
    }).stop,
  );

  stopHandles.push(
    eventOn(tavern_events.MESSAGE_RECEIVED, messageId => {
      apply({ stage: 'message_received', lastMessageId: messageId });
    }).stop,
  );

  stopHandles.push(
    eventOn(tavern_events.GENERATION_ENDED, messageId => {
      apply({ stage: 'generation_ended', lastMessageId: messageId });
    }).stop,
  );

  stopHandles.push(
    eventOn(tavern_events.WORLDINFO_UPDATED, worldbookName => {
      apply({ stage: 'worldinfo_updated', worldbookName: worldbookName || null });
    }).stop,
  );

  syncState(state);

  return {
    stop: () => stopHandles.forEach(stop => stop()),
  };
}
