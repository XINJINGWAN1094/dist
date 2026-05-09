import { createScriptIdIframe } from '@util/script';

import { ENABLE_INTENT_MODEL, FRAME_ID, LAUNCHER_ID, PAGE_SCOPE } from './constants';
import { classifyIntentWithModel, shouldClassifyWithIntentModel } from './intent/model';
import { buildStateFromChatMessage } from './stage/chatState';
import { buildDemoScenes, buildStateFromDemoScene } from './stage/demo';
import { applyIntentResult } from './stage/intentState';
import { normalizeLineText } from './stage/text';
import type { FrameController, FrameLogEntry, Speaker, StageState } from './types';
import { renderShellFrame } from './ui/frame';

const AUTO_TICK_MS = 2400;
const MAX_STAGE_HISTORY = 260;
const MAX_LOG_RENDER = 120;

type StageHistoryEntry = {
  id: number;
  createdAt: number;
  state: StageState;
};

function isSameStageState(a: StageState, b: StageState): boolean {
  return (
    a.bgName === b.bgName &&
    a.bgStyle === b.bgStyle &&
    a.bgImageUrl === b.bgImageUrl &&
    a.leftName === b.leftName &&
    a.leftPose === b.leftPose &&
    a.rightName === b.rightName &&
    a.rightPose === b.rightPose &&
    a.speaker === b.speaker &&
    a.line === b.line &&
    a.status === b.status &&
    a.lastSyncMessageId === b.lastSyncMessageId &&
    a.source === b.source
  );
}

function formatTimeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

function mountGalgameShell() {
  $(`#${LAUNCHER_ID}, #${FRAME_ID}`).remove();

  const demoScenes = buildDemoScenes();
  let demoSceneIndex = 0;
  let stageState = buildStateFromDemoScene(demoScenes[0]);
  let panelVisible = false;
  let frameController: FrameController | null = null;
  const intentProcessedMessageIds: number[] = [];
  let intentJobRunning = false;
  let queuedIntentMessageId: number | null = null;

  const stageHistory: StageHistoryEntry[] = [];
  let historyIdSeed = 0;
  let historyCursor = -1;
  let autoMode = false;
  let uiHidden = false;
  let logOpen = false;
  let autoTimer: ReturnType<typeof window.setInterval> | null = null;

  const $frame = createScriptIdIframe()
    .attr({
      id: FRAME_ID,
      title: 'Galgame 前端骨架',
    })
    .css({
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      border: '0',
      zIndex: '2147483001',
      display: 'none',
      background: 'transparent',
    })
    .appendTo('body');

  const pushStageHistory = (state: StageState) => {
    const snapshot = { ...state };
    const last = stageHistory.at(-1);
    const now = Date.now();
    if (last && isSameStageState(last.state, snapshot)) {
      last.state = snapshot;
      last.createdAt = now;
      return;
    }

    stageHistory.push({
      id: ++historyIdSeed,
      createdAt: now,
      state: snapshot,
    });

    if (stageHistory.length > MAX_STAGE_HISTORY) {
      const overflow = stageHistory.length - MAX_STAGE_HISTORY;
      stageHistory.splice(0, overflow);
      historyCursor = Math.max(-1, historyCursor - overflow);
    }
  };

  const currentDisplayState = () => {
    if (historyCursor >= 0 && historyCursor < stageHistory.length) {
      return stageHistory[historyCursor].state;
    }
    return stageState;
  };

  const buildLogEntries = (): FrameLogEntry[] => {
    const start = Math.max(0, stageHistory.length - MAX_LOG_RENDER);
    return stageHistory
      .slice(start)
      .map((entry, index) => {
        const speakerName = entry.state.speaker === 'left' ? entry.state.leftName : entry.state.rightName;
        return {
          id: entry.id,
          title: `${start + index + 1}. ${entry.state.bgName} · ${speakerName}`,
          meta: `${formatTimeLabel(entry.createdAt)} · ${entry.state.source}`,
          line: entry.state.line,
          active: start + index === historyCursor,
        };
      })
      .reverse();
  };

  const refreshFrameView = () => {
    frameController?.applyState(currentDisplayState());
    frameController?.setControlsState({
      autoMode,
      uiHidden,
      logOpen,
      historyCursor,
      historyCount: stageHistory.length,
    });
    frameController?.setLogEntries(buildLogEntries());
  };

  const commitStageState = (nextState: StageState, options: { forceFollowLatest?: boolean } = {}) => {
    const wasReviewing = historyCursor >= 0 && historyCursor < stageHistory.length - 1;
    stageState = nextState;
    pushStageHistory(stageState);
    if (options.forceFollowLatest || !wasReviewing) {
      historyCursor = stageHistory.length - 1;
    }
    refreshFrameView();
  };

  pushStageHistory(stageState);
  historyCursor = stageHistory.length - 1;

  const setAutoMode = (enabled: boolean) => {
    if (autoMode === enabled) {
      return;
    }

    autoMode = enabled;
    if (autoTimer) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }

    if (autoMode) {
      autoTimer = window.setInterval(() => {
        if (!panelVisible || logOpen) {
          return;
        }
        if (historyCursor < stageHistory.length - 1) {
          historyCursor += 1;
          refreshFrameView();
          return;
        }
        if (stageState.source === 'demo') {
          useDemoScene(demoSceneIndex + 1);
        }
      }, AUTO_TICK_MS);
    }
    refreshFrameView();
  };

  const rememberIntentProcessedMessage = (messageId: number) => {
    intentProcessedMessageIds.push(messageId);
    if (intentProcessedMessageIds.length > 240) {
      intentProcessedMessageIds.splice(0, intentProcessedMessageIds.length - 200);
    }
  };

  const hasIntentProcessedMessage = (messageId: number) => intentProcessedMessageIds.includes(messageId);

  const forgetIntentProcessedMessage = (messageId: number) => {
    const index = intentProcessedMessageIds.indexOf(messageId);
    if (index >= 0) {
      intentProcessedMessageIds.splice(index, 1);
    }
  };

  const runIntentSync = async (messageId: number) => {
    try {
      const message = getChatMessages(messageId)[0];
      if (!message || !shouldClassifyWithIntentModel(message)) {
        return;
      }

      const normalized = normalizeLineText(typeof message.message === 'string' ? message.message : '');
      const payload = await classifyIntentWithModel(normalized, stageState);
      if (!payload) {
        return;
      }

      const intentState = applyIntentResult(stageState, payload, message.message_id);
      if (!intentState) {
        return;
      }

      commitStageState(intentState);
    } finally {
      rememberIntentProcessedMessage(messageId);
      intentJobRunning = false;

      if (queuedIntentMessageId !== null && queuedIntentMessageId !== messageId) {
        const pendingMessageId = queuedIntentMessageId;
        queuedIntentMessageId = null;
        queueIntentSync(pendingMessageId);
      } else {
        queuedIntentMessageId = null;
      }
    }
  };

  const queueIntentSync = (messageId: number, force = false) => {
    if (!ENABLE_INTENT_MODEL) {
      return;
    }
    if (force) {
      forgetIntentProcessedMessage(messageId);
    }
    if (hasIntentProcessedMessage(messageId)) {
      return;
    }
    if (intentJobRunning) {
      queuedIntentMessageId = messageId;
      return;
    }
    intentJobRunning = true;
    void runIntentSync(messageId);
  };

  const syncFromMessage = (messageId: number, options: { forceIntent?: boolean } = {}) => {
    const message = getChatMessages(messageId)[0];
    if (!message) {
      return;
    }

    const nextState = buildStateFromChatMessage(message, stageState);
    if (!nextState) {
      if (shouldClassifyWithIntentModel(message)) {
        queueIntentSync(message.message_id, options.forceIntent ?? false);
      }
      return;
    }

    commitStageState(nextState);

    if (shouldClassifyWithIntentModel(message)) {
      queueIntentSync(message.message_id, options.forceIntent ?? false);
    }
  };

  const syncFromLatestMessage = () => {
    const latestMessage = getChatMessages(-1)[0];
    if (!latestMessage) {
      return;
    }
    syncFromMessage(latestMessage.message_id, { forceIntent: true });
  };

  const useDemoScene = (nextIndex: number) => {
    if (demoScenes.length === 0) {
      return;
    }
    demoSceneIndex = ((nextIndex % demoScenes.length) + demoScenes.length) % demoScenes.length;
    const scene = demoScenes[demoSceneIndex];
    commitStageState(buildStateFromDemoScene(scene), { forceFollowLatest: true });
  };

  const toggleSpeaker = () => {
    const nextSpeaker: Speaker = stageState.speaker === 'left' ? 'right' : 'left';
    const speakerName = nextSpeaker === 'left' ? stageState.leftName : stageState.rightName;
    commitStageState(
      {
        ...stageState,
        speaker: nextSpeaker,
        status: `状态：已手动切换聚焦到 ${speakerName}`,
        source: 'demo',
        lastSyncMessageId: null,
      },
      { forceFollowLatest: true },
    );
  };

  const focusSpeaker = (speaker: Speaker) => {
    if (stageState.speaker === speaker && stageState.status.includes('手动聚焦')) {
      return;
    }
    const speakerName = speaker === 'left' ? stageState.leftName : stageState.rightName;
    commitStageState(
      {
        ...stageState,
        speaker,
        status: `状态：已手动聚焦 ${speakerName}`,
        source: 'demo',
        lastSyncMessageId: null,
      },
      { forceFollowLatest: true },
    );
  };

  const showHistoryByEntryId = (entryId: number) => {
    const cursor = stageHistory.findIndex(entry => entry.id === entryId);
    if (cursor < 0) {
      return;
    }
    historyCursor = cursor;
    refreshFrameView();
  };

  const nextLine = () => {
    if (historyCursor < stageHistory.length - 1) {
      historyCursor += 1;
      refreshFrameView();
      return;
    }

    if (stageState.source === 'demo') {
      useDemoScene(demoSceneIndex + 1);
      return;
    }

    syncFromLatestMessage();
  };

  const toggleLog = () => {
    logOpen = !logOpen;
    refreshFrameView();
  };

  const toggleUi = () => {
    uiHidden = !uiHidden;
    refreshFrameView();
  };

  const skip = () => {
    setAutoMode(false);
    logOpen = false;
    historyCursor = stageHistory.length - 1;
    syncFromLatestMessage();
    refreshFrameView();
  };

  const hidePanel = () => {
    panelVisible = false;
    setAutoMode(false);
    $frame.hide();
    $launcher.text('Galgame');
  };

  const mountFrame = () => {
    frameController = renderShellFrame($frame[0], currentDisplayState(), {
      closePanel: hidePanel,
      nextLine,
      toggleAuto: () => setAutoMode(!autoMode),
      toggleSpeaker,
      focusSpeaker,
      toggleLog,
      toggleUi,
      skip,
      selectLogEntry: showHistoryByEntryId,
    });
    refreshFrameView();
  };

  const showPanel = () => {
    panelVisible = true;
    mountFrame();
    $frame.show();
    $launcher.text('收起');
  };

  const togglePanel = () => {
    if (panelVisible) {
      hidePanel();
      return;
    }
    showPanel();
  };

  const $launcher = $('<button>')
    .attr({
      id: LAUNCHER_ID,
      script_id: getScriptId(),
      type: 'button',
      title: '打开 Galgame 骨架',
    })
    .text('Galgame')
    .css({
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483002',
      border: '1px solid rgba(124, 217, 255, 0.7)',
      borderRadius: '999px',
      padding: '8px 14px',
      fontSize: '13px',
      letterSpacing: '0.04em',
      color: '#dff6ff',
      background: 'linear-gradient(150deg, rgba(20, 74, 124, 0.95) 0%, rgba(8, 37, 72, 0.95) 100%)',
      boxShadow: '0 10px 22px rgba(0, 0, 0, 0.35), 0 0 14px rgba(84, 198, 255, 0.25)',
      cursor: 'pointer',
    })
    .appendTo('body');

  const eventStops: Array<() => void> = [];
  eventStops.push(eventOn(tavern_events.MESSAGE_SENT, messageId => syncFromMessage(messageId)).stop);
  eventStops.push(eventOn(tavern_events.MESSAGE_RECEIVED, messageId => syncFromMessage(messageId)).stop);
  eventStops.push(eventOn(tavern_events.MESSAGE_UPDATED, messageId => syncFromMessage(messageId, { forceIntent: true })).stop);
  eventStops.push(eventOn(tavern_events.MESSAGE_EDITED, messageId => syncFromMessage(messageId, { forceIntent: true })).stop);
  eventStops.push(
    eventOn(tavern_events.CHAT_CHANGED, () => {
      _.delay(syncFromLatestMessage, 80);
    }).stop,
  );

  $launcher.on(`click${PAGE_SCOPE}`, togglePanel);

  $frame.on(`load${PAGE_SCOPE}`, () => {
    if (panelVisible) {
      mountFrame();
    }
  });

  _.delay(syncFromLatestMessage, 180);

  $(window).on(`pagehide${PAGE_SCOPE}`, () => {
    if (autoTimer) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
    eventStops.forEach(stop => stop());
    $launcher.off(PAGE_SCOPE);
    $frame.off(PAGE_SCOPE);
    $launcher.remove();
    $frame.remove();
    $(window).off(PAGE_SCOPE);
  });
}

$(() => {
  errorCatched(mountGalgameShell)();
});
