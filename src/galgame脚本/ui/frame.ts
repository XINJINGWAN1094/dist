import {
  CLOSE_ID,
  LOG_LIST_ID,
  LOG_PANEL_ID,
  NEXT_LINE_ID,
  QUICK_SHOW_UI_ID,
  SKIP_ID,
  STATUS_ID,
  TOGGLE_AUTO_ID,
  TOGGLE_LOG_ID,
  TOGGLE_SPEAKER_ID,
  TOGGLE_UI_ID,
} from '../constants';
import type { FrameController, FrameControlsState, FrameLogEntry, Speaker, StageState } from '../types';

type FrameActions = {
  closePanel: () => void;
  nextLine: () => void;
  toggleAuto: () => void;
  toggleSpeaker: () => void;
  focusSpeaker: (speaker: Speaker) => void;
  toggleLog: () => void;
  toggleUi: () => void;
  skip: () => void;
  selectLogEntry: (id: number) => void;
};

export function renderShellFrame(frame: HTMLIFrameElement, initialState: StageState, actions: FrameActions): FrameController | null {
  const frameDoc = frame.contentDocument;
  if (!frameDoc) {
    return null;
  }

  frameDoc.documentElement.style.height = '100%';
  frameDoc.body.style.height = '100%';
  frameDoc.body.style.margin = '0';
  frameDoc.body.style.background = '#060c17';

  frameDoc.body.innerHTML = `
    <style>
      :root {
        --th-shell-bg-0: #050b16;
        --th-shell-bg-1: #0d1730;
        --th-shell-line: rgba(138, 210, 255, 0.62);
        --th-shell-line-soft: rgba(138, 210, 255, 0.24);
        --th-shell-text-main: #e9f6ff;
        --th-shell-text-sub: #9cbcd6;
        --th-shell-accent: #9ee9ff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100%;
        font-family: "Microsoft YaHei", "PingFang SC", "Noto Serif SC", sans-serif;
        color: var(--th-shell-text-main);
        background:
          radial-gradient(circle at 12% 0%, rgba(62, 167, 255, 0.24) 0%, rgba(62, 167, 255, 0) 34%),
          radial-gradient(circle at 90% 95%, rgba(96, 255, 242, 0.16) 0%, rgba(96, 255, 242, 0) 45%),
          linear-gradient(165deg, var(--th-shell-bg-1) 0%, var(--th-shell-bg-0) 72%);
      }

      #th-galgame-shell-panel {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 14px;
      }

      #th-galgame-shell-stage {
        width: min(1180px, 100%);
        height: min(780px, calc(100vh - 28px));
        border: 1px solid var(--th-shell-line);
        border-radius: 16px;
        background:
          linear-gradient(170deg, rgba(13, 31, 59, 0.84) 0%, rgba(5, 12, 24, 0.92) 100%);
        box-shadow:
          0 24px 52px rgba(0, 0, 0, 0.48),
          inset 0 0 0 1px rgba(130, 217, 255, 0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      #th-galgame-shell-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--th-shell-line-soft);
      }

      #th-galgame-shell-title {
        margin: 0;
        font-size: 16px;
        letter-spacing: 0.05em;
      }

      #th-galgame-shell-tag {
        margin-left: 8px;
        border: 1px solid var(--th-shell-line-soft);
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        color: var(--th-shell-text-sub);
        background: rgba(16, 51, 89, 0.55);
      }

      #th-galgame-shell-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      #${CLOSE_ID} {
        border: 1px solid rgba(135, 220, 255, 0.6);
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 13px;
        color: var(--th-shell-text-main);
        background: linear-gradient(145deg, rgba(17, 58, 96, 0.96) 0%, rgba(9, 33, 66, 0.96) 100%);
        cursor: pointer;
      }

      #${CLOSE_ID}:hover {
        border-color: rgba(163, 234, 255, 0.92);
      }

      #th-galgame-shell-viewport {
        flex: 1;
        position: relative;
        overflow: hidden;
        border-top: 1px solid rgba(118, 192, 255, 0.16);
        background: #070f20;
      }

      #th-galgame-bg-layer {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
        transition: background 0.45s ease;
        animation: th-bg-drift 18s ease-in-out infinite alternate;
      }

      #th-galgame-bg-layer::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(to bottom, rgba(8, 16, 30, 0.12) 0%, rgba(8, 16, 30, 0.42) 54%, rgba(5, 9, 19, 0.78) 100%);
      }

      #th-galgame-bg-name {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 5;
        border: 1px solid var(--th-shell-line-soft);
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 12px;
        color: #d6edff;
        background: rgba(10, 29, 56, 0.7);
      }

      #th-galgame-character-layer {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: end;
        justify-content: space-between;
        padding: 84px 30px 152px;
        pointer-events: none;
      }

      .th-galgame-character {
        width: clamp(170px, 23vw, 320px);
        aspect-ratio: 3 / 5;
        border: 1px solid rgba(175, 221, 255, 0.35);
        border-radius: 12px 12px 44px 44px;
        background:
          radial-gradient(circle at 50% 18%, rgba(186, 235, 255, 0.32) 0%, rgba(186, 235, 255, 0) 42%),
          linear-gradient(165deg, rgba(17, 43, 73, 0.78) 0%, rgba(9, 24, 44, 0.84) 72%);
        box-shadow:
          inset 0 0 0 1px rgba(186, 235, 255, 0.08),
          0 20px 30px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 12px;
        transition: transform 0.26s ease, opacity 0.26s ease, filter 0.26s ease, border-color 0.26s ease;
        opacity: 0.58;
        filter: saturate(0.7);
        pointer-events: auto;
      }

      .th-galgame-character[data-active='true'] {
        transform: translateY(-8px) scale(1.02);
        opacity: 1;
        filter: saturate(1);
        border-color: rgba(213, 241, 255, 0.85);
      }

      .th-galgame-character-portrait {
        flex: 1;
        border-radius: 10px;
        border: 1px dashed rgba(196, 238, 255, 0.28);
        background:
          radial-gradient(circle at 50% 26%, rgba(203, 242, 255, 0.3) 0%, rgba(203, 242, 255, 0) 32%),
          repeating-linear-gradient(
            135deg,
            rgba(138, 210, 255, 0.06) 0px,
            rgba(138, 210, 255, 0.06) 10px,
            rgba(138, 210, 255, 0.02) 10px,
            rgba(138, 210, 255, 0.02) 20px
          );
      }

      .th-galgame-character-role {
        margin-top: 10px;
        text-align: center;
        font-size: 13px;
        letter-spacing: 0.04em;
        color: #d2ecff;
      }

      #th-galgame-dialog-layer {
        position: absolute;
        left: 18px;
        right: 18px;
        bottom: 16px;
        z-index: 6;
      }

      #th-galgame-dialog-box {
        border: 1px solid rgba(191, 230, 255, 0.66);
        border-radius: 14px;
        background:
          linear-gradient(172deg, rgba(8, 21, 40, 0.82) 0%, rgba(6, 12, 23, 0.9) 100%);
        box-shadow:
          0 18px 28px rgba(0, 0, 0, 0.42),
          inset 0 0 0 1px rgba(200, 236, 255, 0.14);
        overflow: hidden;
      }

      #th-galgame-nameplate {
        display: inline-block;
        margin: 12px 0 0 14px;
        border: 1px solid rgba(255, 217, 141, 0.62);
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 13px;
        color: #fff2d8;
        background: rgba(88, 59, 13, 0.56);
      }

      #th-galgame-line {
        margin: 0;
        padding: 12px 16px 10px;
        line-height: 1.8;
        font-size: 15px;
        letter-spacing: 0.02em;
        white-space: pre-wrap;
        word-break: break-word;
      }

      #th-galgame-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid rgba(191, 230, 255, 0.18);
        padding: 10px 12px;
        background: rgba(5, 16, 33, 0.5);
      }

      #th-galgame-controls-left {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .th-galgame-control-btn {
        border: 1px solid rgba(170, 223, 255, 0.55);
        border-radius: 8px;
        padding: 5px 10px;
        font-size: 12px;
        letter-spacing: 0.03em;
        color: var(--th-shell-text-main);
        background: linear-gradient(140deg, rgba(17, 58, 96, 0.86) 0%, rgba(9, 32, 63, 0.86) 100%);
        cursor: pointer;
      }

      .th-galgame-control-btn:hover {
        border-color: rgba(204, 240, 255, 0.9);
      }

      .th-galgame-control-btn[data-active='true'] {
        border-color: rgba(163, 234, 255, 0.95);
        box-shadow: inset 0 0 0 1px rgba(158, 233, 255, 0.32);
      }

      #th-galgame-status-wrap {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }

      #th-galgame-history-progress {
        font-size: 11px;
        color: #96c5e3;
      }

      #${STATUS_ID} {
        font-size: 12px;
        color: var(--th-shell-text-sub);
        letter-spacing: 0.02em;
      }

      #${LOG_PANEL_ID} {
        position: absolute;
        top: 10px;
        right: 10px;
        bottom: 10px;
        width: min(390px, calc(100% - 20px));
        z-index: 8;
        border: 1px solid rgba(155, 224, 255, 0.38);
        border-radius: 12px;
        background: rgba(6, 17, 34, 0.9);
        box-shadow: 0 14px 26px rgba(0, 0, 0, 0.45);
        display: none;
        overflow: hidden;
      }

      #${LOG_PANEL_ID}.is-open {
        display: flex;
        flex-direction: column;
      }

      #th-galgame-log-head {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(155, 224, 255, 0.2);
        font-size: 13px;
        color: #d2eeff;
      }

      #${LOG_LIST_ID} {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow: auto;
      }

      .th-galgame-log-item {
        width: 100%;
        text-align: left;
        border: 1px solid rgba(139, 211, 255, 0.3);
        border-radius: 8px;
        padding: 8px 9px;
        background: rgba(11, 34, 60, 0.6);
        color: #ddf3ff;
        cursor: pointer;
      }

      .th-galgame-log-item[data-active='true'] {
        border-color: rgba(174, 235, 255, 0.92);
        box-shadow: inset 0 0 0 1px rgba(174, 235, 255, 0.22);
      }

      .th-galgame-log-title {
        font-size: 12px;
      }

      .th-galgame-log-meta {
        margin-top: 3px;
        font-size: 11px;
        color: #9bc6e2;
      }

      .th-galgame-log-line {
        margin-top: 5px;
        font-size: 12px;
        color: #d5edff;
        line-height: 1.45;
        white-space: pre-wrap;
      }

      #${QUICK_SHOW_UI_ID} {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 9;
        display: none;
      }

      #th-galgame-shell-stage.th-ui-hidden #th-galgame-shell-header,
      #th-galgame-shell-stage.th-ui-hidden #th-galgame-dialog-layer,
      #th-galgame-shell-stage.th-ui-hidden #th-galgame-bg-name {
        display: none;
      }

      #th-galgame-shell-stage.th-ui-hidden #${QUICK_SHOW_UI_ID} {
        display: inline-flex;
      }

      @keyframes th-bg-drift {
        0% {
          transform: scale(1);
        }
        100% {
          transform: scale(1.06);
        }
      }

      @media (max-width: 920px) {
        #th-galgame-shell-stage {
          height: calc(100vh - 20px);
        }

        #th-galgame-character-layer {
          padding: 68px 12px 160px;
        }

        .th-galgame-character {
          width: clamp(128px, 34vw, 200px);
        }

        #th-galgame-line {
          font-size: 14px;
        }

        #${LOG_PANEL_ID} {
          top: 6px;
          right: 6px;
          bottom: 6px;
          width: calc(100% - 12px);
        }
      }
    </style>
    <section id="th-galgame-shell-panel" aria-label="Galgame 脚本舞台">
      <article id="th-galgame-shell-stage">
        <header id="th-galgame-shell-header">
          <h2 id="th-galgame-shell-title">Galgame 前端骨架<span id="th-galgame-shell-tag">第 4 步 · 交互完善</span></h2>
          <div id="th-galgame-shell-header-actions">
            <button id="${CLOSE_ID}" type="button">关闭面板</button>
          </div>
        </header>
        <main id="th-galgame-shell-viewport">
          <div id="th-galgame-bg-layer">
            <span id="th-galgame-bg-name"></span>
          </div>

          <section id="th-galgame-character-layer" aria-label="角色层">
            <button class="th-galgame-character" data-side="left" data-active="true" type="button" id="th-galgame-char-left">
              <div class="th-galgame-character-portrait"></div>
              <div class="th-galgame-character-role" id="th-galgame-char-left-role"></div>
            </button>
            <button class="th-galgame-character" data-side="right" data-active="false" type="button" id="th-galgame-char-right">
              <div class="th-galgame-character-portrait"></div>
              <div class="th-galgame-character-role" id="th-galgame-char-right-role"></div>
            </button>
          </section>

          <button class="th-galgame-control-btn" id="${QUICK_SHOW_UI_ID}" type="button">显示 UI</button>

          <aside id="${LOG_PANEL_ID}">
            <div id="th-galgame-log-head">回看日志</div>
            <div id="${LOG_LIST_ID}"></div>
          </aside>

          <section id="th-galgame-dialog-layer" aria-label="对话框层">
            <div id="th-galgame-dialog-box">
              <div id="th-galgame-nameplate"></div>
              <p id="th-galgame-line"></p>
              <div id="th-galgame-controls">
                <div id="th-galgame-controls-left">
                  <button class="th-galgame-control-btn" id="${NEXT_LINE_ID}" type="button">下一句</button>
                  <button class="th-galgame-control-btn" id="${TOGGLE_AUTO_ID}" type="button">自动：关</button>
                  <button class="th-galgame-control-btn" id="${TOGGLE_LOG_ID}" type="button">回看日志</button>
                  <button class="th-galgame-control-btn" id="${TOGGLE_UI_ID}" type="button">隐藏 UI</button>
                  <button class="th-galgame-control-btn" id="${SKIP_ID}" type="button">跳过</button>
                  <button class="th-galgame-control-btn" id="${TOGGLE_SPEAKER_ID}" type="button">切换说话人</button>
                </div>
                <div id="th-galgame-status-wrap">
                  <span id="th-galgame-history-progress"></span>
                  <span id="${STATUS_ID}"></span>
                </div>
              </div>
            </div>
          </section>
        </main>
      </article>
    </section>
  `;

  const stageRoot = frameDoc.getElementById('th-galgame-shell-stage') as HTMLElement | null;
  const closeButton = frameDoc.getElementById(CLOSE_ID) as HTMLButtonElement | null;
  const nextLineButton = frameDoc.getElementById(NEXT_LINE_ID) as HTMLButtonElement | null;
  const toggleAutoButton = frameDoc.getElementById(TOGGLE_AUTO_ID) as HTMLButtonElement | null;
  const toggleLogButton = frameDoc.getElementById(TOGGLE_LOG_ID) as HTMLButtonElement | null;
  const toggleUiButton = frameDoc.getElementById(TOGGLE_UI_ID) as HTMLButtonElement | null;
  const quickShowUiButton = frameDoc.getElementById(QUICK_SHOW_UI_ID) as HTMLButtonElement | null;
  const skipButton = frameDoc.getElementById(SKIP_ID) as HTMLButtonElement | null;
  const toggleSpeakerButton = frameDoc.getElementById(TOGGLE_SPEAKER_ID) as HTMLButtonElement | null;
  const logPanel = frameDoc.getElementById(LOG_PANEL_ID) as HTMLDivElement | null;
  const logList = frameDoc.getElementById(LOG_LIST_ID) as HTMLDivElement | null;

  closeButton?.addEventListener('click', actions.closePanel);
  nextLineButton?.addEventListener('click', actions.nextLine);
  toggleAutoButton?.addEventListener('click', actions.toggleAuto);
  toggleLogButton?.addEventListener('click', actions.toggleLog);
  toggleUiButton?.addEventListener('click', actions.toggleUi);
  quickShowUiButton?.addEventListener('click', actions.toggleUi);
  skipButton?.addEventListener('click', actions.skip);
  toggleSpeakerButton?.addEventListener('click', actions.toggleSpeaker);

  logList?.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLButtonElement>('.th-galgame-log-item');
    if (!item) {
      return;
    }
    const entryId = Number(item.dataset.logId);
    if (!Number.isFinite(entryId)) {
      return;
    }
    actions.selectLogEntry(entryId);
  });

  const bgLayer = frameDoc.getElementById('th-galgame-bg-layer') as HTMLDivElement | null;
  const bgName = frameDoc.getElementById('th-galgame-bg-name') as HTMLSpanElement | null;
  const leftCard = frameDoc.getElementById('th-galgame-char-left') as HTMLButtonElement | null;
  const rightCard = frameDoc.getElementById('th-galgame-char-right') as HTMLButtonElement | null;
  const leftRole = frameDoc.getElementById('th-galgame-char-left-role') as HTMLDivElement | null;
  const rightRole = frameDoc.getElementById('th-galgame-char-right-role') as HTMLDivElement | null;
  const nameplate = frameDoc.getElementById('th-galgame-nameplate') as HTMLDivElement | null;
  const line = frameDoc.getElementById('th-galgame-line') as HTMLParagraphElement | null;
  const status = frameDoc.getElementById(STATUS_ID) as HTMLSpanElement | null;
  const historyProgress = frameDoc.getElementById('th-galgame-history-progress') as HTMLSpanElement | null;

  leftCard?.addEventListener('click', () => actions.focusSpeaker('left'));
  rightCard?.addEventListener('click', () => actions.focusSpeaker('right'));

  const applyState = (state: StageState) => {
    if (bgLayer) {
      if (state.bgImageUrl) {
        bgLayer.style.background = `${state.bgStyle}, url("${state.bgImageUrl}") center / cover no-repeat`;
      } else {
        bgLayer.style.background = state.bgStyle;
      }
    }
    if (bgName) {
      bgName.textContent = `场景：${state.bgName}`;
    }
    if (leftRole) {
      leftRole.textContent = state.leftPose ? `${state.leftName} · ${state.leftPose}` : state.leftName;
    }
    if (rightRole) {
      rightRole.textContent = state.rightPose ? `${state.rightName} · ${state.rightPose}` : state.rightName;
    }
    leftCard?.setAttribute('data-active', state.speaker === 'left' ? 'true' : 'false');
    rightCard?.setAttribute('data-active', state.speaker === 'right' ? 'true' : 'false');
    if (nameplate) {
      nameplate.textContent = state.speaker === 'left' ? state.leftName : state.rightName;
    }
    if (line) {
      line.textContent = state.line;
    }
    if (status) {
      status.textContent = state.status;
      status.style.color = state.source === 'chat' || state.source === 'intent' ? 'var(--th-shell-accent)' : 'var(--th-shell-text-sub)';
    }
  };

  const setControlsState = (controlsState: FrameControlsState) => {
    if (toggleAutoButton) {
      toggleAutoButton.textContent = controlsState.autoMode ? '自动：开' : '自动：关';
      toggleAutoButton.setAttribute('data-active', controlsState.autoMode ? 'true' : 'false');
    }
    if (toggleLogButton) {
      toggleLogButton.textContent = controlsState.logOpen ? '收起日志' : '回看日志';
      toggleLogButton.setAttribute('data-active', controlsState.logOpen ? 'true' : 'false');
    }
    if (toggleUiButton) {
      toggleUiButton.textContent = controlsState.uiHidden ? '显示 UI' : '隐藏 UI';
    }
    stageRoot?.classList.toggle('th-ui-hidden', controlsState.uiHidden);
    logPanel?.classList.toggle('is-open', controlsState.logOpen);

    if (historyProgress) {
      if (controlsState.historyCount <= 0 || controlsState.historyCursor < 0) {
        historyProgress.textContent = '';
      } else {
        historyProgress.textContent = `进度：${controlsState.historyCursor + 1}/${controlsState.historyCount}`;
      }
    }
  };

  const setLogEntries = (entries: FrameLogEntry[]) => {
    if (!logList) {
      return;
    }
    logList.textContent = '';
    for (const entry of entries) {
      const item = frameDoc.createElement('button');
      item.type = 'button';
      item.className = 'th-galgame-log-item';
      item.dataset.logId = String(entry.id);
      item.dataset.active = entry.active ? 'true' : 'false';

      const title = frameDoc.createElement('div');
      title.className = 'th-galgame-log-title';
      title.textContent = entry.title;

      const meta = frameDoc.createElement('div');
      meta.className = 'th-galgame-log-meta';
      meta.textContent = entry.meta;

      const lineText = frameDoc.createElement('div');
      lineText.className = 'th-galgame-log-line';
      lineText.textContent = entry.line;

      item.append(title, meta, lineText);
      logList.append(item);
    }
  };

  applyState(initialState);
  return { applyState, setControlsState, setLogEntries };
}
