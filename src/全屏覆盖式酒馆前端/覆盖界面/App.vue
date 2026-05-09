<template>
  <main class="overlay-root" :data-theme="theme">
    <section class="panel">
      <header class="panel-head">
        <h1>全屏覆盖式酒馆前端</h1>
        <button type="button" class="close-btn" @click="closeOverlay">关闭覆盖页</button>
      </header>

      <div class="theme-switch">
        <button
          type="button"
          class="theme-btn blue"
          :aria-pressed="theme === 'cyber_blue'"
          @click="setTheme('cyber_blue')"
        >
          黑底蓝光
        </button>
        <button
          type="button"
          class="theme-btn pink"
          :aria-pressed="theme === 'cyber_pink'"
          @click="setTheme('cyber_pink')"
        >
          银底粉光
        </button>
      </div>

      <div class="input-shell">
        <textarea
          v-model="draft"
          class="input-box"
          rows="4"
          placeholder="输入发送前原始文本，发送将走酒馆原生按钮链路。"
        ></textarea>
      </div>

      <div class="action-row">
        <button type="button" class="send-btn" @click="requestNativeSend">发送</button>
      </div>

      <div class="status-block">
        <p class="line">阶段：{{ state.stage }}</p>
        <p class="line">最后消息ID：{{ state.lastMessageId ?? '无' }}</p>
        <p class="line">最近世界书：{{ state.worldbookName ?? '无' }}</p>
        <p class="line">最近原始输入：{{ state.lastUserInputRaw || '无' }}</p>
        <p v-if="sendStatus" class="line status">{{ sendStatus }}</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  OVERLAY_EVENTS,
  type NativeSendResultPayload,
  type OverlaySyncState,
  type OverlayVisibilityPayload,
} from '../共享/协议';

type OverlayTheme = 'cyber_blue' | 'cyber_pink';

const state = ref<OverlaySyncState>({
  stage: 'idle',
  lastMessageId: null,
  worldbookName: null,
  lastUserInputRaw: '',
  updatedAt: Date.now(),
});
const sendStatus = ref('');
const draft = ref('');
const theme = ref<OverlayTheme>('cyber_blue');
const stops: EventOnReturn[] = [];

function setTheme(next: OverlayTheme) {
  theme.value = next;
}

function requestNativeSend() {
  const inputRaw = draft.value.trim();
  if (!inputRaw) {
    sendStatus.value = '请输入要发送的文本。';
    return;
  }

  void eventEmit(OVERLAY_EVENTS.REQUEST_NATIVE_SEND, {
    source: 'overlay_ui',
    inputPreview: inputRaw.slice(0, 80),
    inputRaw,
  });
}

function closeOverlay() {
  void eventEmit(OVERLAY_EVENTS.REQUEST_OVERLAY_VISIBILITY, {
    visible: false,
    source: 'overlay_ui',
  } satisfies OverlayVisibilityPayload);
}

onMounted(() => {
  stops.push(
    eventOn(OVERLAY_EVENTS.STATE_SYNC, payload => {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      state.value = {
        ...state.value,
        ...(payload as Partial<OverlaySyncState>),
      };
    }),
  );

  stops.push(
    eventOn(OVERLAY_EVENTS.NATIVE_SEND_RESULT, payload => {
      const result = payload as NativeSendResultPayload;
      sendStatus.value = result.clicked
        ? `已触发原生发送（来源：${result.requestedBy}）`
        : `发送失败：${result.reason ?? '未知原因'}`;
      if (result.clicked) {
        draft.value = '';
      }
    }),
  );
});

onBeforeUnmount(() => {
  stops.forEach(handle => handle.stop());
});
</script>

<style scoped>
.overlay-root {
  min-height: 100%;
  margin: 0;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  background: var(--page-bg);
  font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}

.overlay-root[data-theme='cyber_blue'] {
  --page-bg: radial-gradient(circle at 18% 10%, #14263f 0%, #070b13 52%, #03050a 100%);
  --panel-bg: linear-gradient(155deg, rgba(10, 13, 21, 0.92), rgba(18, 29, 48, 0.9));
  --line-color: rgba(78, 230, 255, 0.55);
  --text-color: #dff5ff;
  --sub-color: #9ec9db;
  --accent: #45f3ff;
  --accent-soft: rgba(69, 243, 255, 0.24);
  --input-bg: rgba(4, 8, 16, 0.9);
  --btn-bg: linear-gradient(140deg, #04070d, #0e1728);
  --btn-fg: #dff5ff;
}

.overlay-root[data-theme='cyber_pink'] {
  --page-bg: radial-gradient(circle at 20% 8%, #f3f4f8 0%, #d0d3dd 55%, #b6b9c3 100%);
  --panel-bg: linear-gradient(150deg, rgba(236, 239, 246, 0.95), rgba(202, 206, 216, 0.93));
  --line-color: rgba(255, 64, 176, 0.55);
  --text-color: #161922;
  --sub-color: #3f475b;
  --accent: #ff44c2;
  --accent-soft: rgba(255, 68, 194, 0.22);
  --input-bg: rgba(245, 247, 251, 0.9);
  --btn-bg: linear-gradient(150deg, #eceff6, #cfd4df);
  --btn-fg: #1b1f2b;
}

.panel {
  width: min(920px, calc(100% - 8px));
  border-radius: 18px;
  border: 1px solid var(--line-color);
  padding: 24px;
  background: var(--panel-bg);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 20px 50px rgba(0, 0, 0, 0.25);
}

.panel-head {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.close-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 8px 14px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  cursor: pointer;
}

.theme-switch {
  margin-bottom: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.theme-btn {
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.theme-btn:hover {
  transform: translateY(-1px);
}

.theme-btn[aria-pressed='true'] {
  box-shadow: 0 0 0 1px var(--line-color), 0 0 18px var(--accent-soft);
}

.theme-btn.blue {
  border: 1px solid rgba(71, 236, 255, 0.65);
  color: #dff7ff;
  background: linear-gradient(150deg, #05080f, #101a2a);
}

.theme-btn.pink {
  border: 1px solid rgba(255, 72, 190, 0.62);
  color: #241930;
  background: linear-gradient(150deg, #edeff5, #d8dce8);
}

.input-shell {
  position: relative;
  margin-bottom: 14px;
  border-radius: 14px;
  padding: 1px;
  background: linear-gradient(120deg, transparent 0%, var(--accent) 45%, transparent 100%);
  background-size: 220% 100%;
  animation: borderScan 2s linear infinite;
}

.input-shell::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 16px;
  pointer-events: none;
  box-shadow: 0 0 18px var(--accent-soft);
  animation: borderPulse 2.2s ease-in-out infinite;
}

.input-box {
  position: relative;
  z-index: 1;
  width: 100%;
  resize: vertical;
  min-height: 110px;
  border: none;
  border-radius: 13px;
  padding: 14px;
  color: var(--text-color);
  background: var(--input-bg);
  outline: none;
  font-size: 14px;
  line-height: 1.55;
}

.input-box::placeholder {
  color: var(--sub-color);
}

.action-row {
  margin-bottom: 14px;
  display: flex;
  justify-content: flex-end;
}

.send-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 9px 18px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  box-shadow: 0 0 14px var(--accent-soft);
  cursor: pointer;
}

.status-block {
  border-radius: 12px;
  border: 1px solid var(--line-color);
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.08);
}

.line {
  margin: 0 0 6px;
  color: var(--sub-color);
  font-size: 13px;
}

.line:last-child {
  margin-bottom: 0;
}

.status {
  color: var(--text-color);
}

@keyframes borderPulse {
  0%,
  100% {
    opacity: 0.48;
  }
  50% {
    opacity: 1;
  }
}

@keyframes borderScan {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}
</style>
