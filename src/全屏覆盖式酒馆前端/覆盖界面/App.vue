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

      <section ref="chatScrollRef" class="chat-box">
        <article
          v-for="message in chatMessages"
          :key="message.message_id"
          class="message-row"
          :class="`role-${message.role}`"
        >
          <p class="meta">{{ message.name }} · #{{ message.message_id }}</p>
          <div class="bubble" v-html="message.renderedHtml"></div>
        </article>
        <p v-if="chatMessages.length === 0" class="placeholder">当前聊天暂无可显示消息。</p>
      </section>

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
    </section>
  </main>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  OVERLAY_EVENTS,
  type NativeSendResultPayload,
  type OverlayVisibilityPayload,
} from '../共享/协议';

type OverlayTheme = 'cyber_blue' | 'cyber_pink';
type RenderableMessage = {
  message_id: number;
  name: string;
  role: 'system' | 'assistant' | 'user';
  renderedHtml: string;
};

const draft = ref('');
const theme = ref<OverlayTheme>('cyber_blue');
const chatMessages = ref<RenderableMessage[]>([]);
const chatScrollRef = ref<HTMLElement | null>(null);
const stops: EventOnReturn[] = [];

function setTheme(next: OverlayTheme) {
  theme.value = next;
}

function closeOverlay() {
  void eventEmit(OVERLAY_EVENTS.REQUEST_OVERLAY_VISIBILITY, {
    visible: false,
    source: 'overlay_ui',
  } satisfies OverlayVisibilityPayload);
}

function normalizeMessageName(message: Pick<ChatMessage, 'name' | 'role'>): string {
  if (message.name?.trim()) {
    return message.name;
  }

  if (message.role === 'user') {
    return '用户';
  }
  if (message.role === 'assistant') {
    return 'AI';
  }
  return '系统';
}

function escapeAsDisplayedParagraph(text: string): string {
  if (!text.trim()) {
    return '<p></p>';
  }
  return `<p>${_.escape(text).replace(/\r?\n/g, '<br>')}</p>`;
}

function tryReadNativeDisplayedHtml(messageId: number): string | null {
  const $displayed = retrieveDisplayedMessage(messageId);
  if ($displayed.length === 0) {
    return null;
  }

  const html = $displayed.html();
  if (typeof html !== 'string') {
    return null;
  }

  const trimmed = html.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatMessageForOverlay(message: ChatMessage): string {
  const nativeDisplayedHtml = tryReadNativeDisplayedHtml(message.message_id);
  if (nativeDisplayedHtml) {
    return nativeDisplayedHtml;
  }

  const plainText = message.message ?? '';
  try {
    const rendered = formatAsDisplayedMessage(plainText, { message_id: message.message_id });
    if (rendered.trim()) {
      return rendered;
    }
  } catch (error) {
    console.warn('[全屏覆盖式酒馆前端] 读取原生渲染失败，回退为纯文本渲染。', {
      message_id: message.message_id,
      error,
    });
  }

  return escapeAsDisplayedParagraph(plainText);
}

function loadChatMessages() {
  const lastMessageId = getLastMessageId();
  if (lastMessageId < 0) {
    chatMessages.value = [];
    return;
  }

  let rawMessages: ChatMessage[] = [];
  try {
    rawMessages = getChatMessages('0-', {
      hide_state: 'unhidden',
      role: 'all',
    });
  } catch {
    rawMessages = getChatMessages(`0-${lastMessageId}`, {
      hide_state: 'unhidden',
      role: 'all',
    });
  }

  chatMessages.value = rawMessages
    .filter(message => message.role === 'assistant' || message.role === 'user' || message.role === 'system')
    .map(message => ({
      message_id: message.message_id,
      name: normalizeMessageName(message),
      role: message.role,
      renderedHtml: formatMessageForOverlay(message),
    }));
}

function scrollChatToBottom(behavior: ScrollBehavior = 'auto') {
  const element = chatScrollRef.value;
  if (!element) {
    return;
  }

  element.scrollTo({
    top: element.scrollHeight,
    behavior,
  });
}

function requestNativeSend() {
  const inputRaw = draft.value.trim();
  if (!inputRaw) {
    toastr.warning('请输入要发送的文本。', '覆盖层发送');
    return;
  }

  void eventEmit(OVERLAY_EVENTS.REQUEST_NATIVE_SEND, {
    source: 'overlay_ui',
    inputPreview: inputRaw.slice(0, 80),
    inputRaw,
  });
}

onMounted(() => {
  const refreshChatMessages = _.debounce(loadChatMessages, 30);
  const refreshAndStickBottom = _.debounce(() => {
    loadChatMessages();
    void nextTick(() => scrollChatToBottom('smooth'));
  }, 30);

  stops.push(eventOn(tavern_events.MESSAGE_SENT, refreshAndStickBottom).stop);
  stops.push(eventOn(tavern_events.MESSAGE_RECEIVED, refreshAndStickBottom).stop);
  stops.push(eventOn(tavern_events.GENERATION_ENDED, refreshAndStickBottom).stop);
  stops.push(eventOn(tavern_events.MESSAGE_UPDATED, refreshChatMessages).stop);
  stops.push(eventOn(tavern_events.MESSAGE_EDITED, refreshChatMessages).stop);
  stops.push(eventOn(tavern_events.MESSAGE_DELETED, refreshChatMessages).stop);
  stops.push(eventOn(tavern_events.MORE_MESSAGES_LOADED, refreshChatMessages).stop);
  stops.push(
    eventOn(tavern_events.CHAT_CHANGED, () => {
      draft.value = '';
      refreshAndStickBottom();
    }).stop,
  );
  stops.push(
    eventOn(OVERLAY_EVENTS.NATIVE_SEND_RESULT, payload => {
      const result = payload as NativeSendResultPayload;
      if (result.clicked) {
        draft.value = '';
        return;
      }
      toastr.error(result.reason ?? '未知原因', '覆盖层发送失败');
    }).stop,
  );

  loadChatMessages();
  void nextTick(() => scrollChatToBottom());
});

watch(
  () => chatMessages.value.length,
  async (next, previous) => {
    if (next <= previous) {
      return;
    }
    await nextTick();
    scrollChatToBottom('smooth');
  },
);

onBeforeUnmount(() => {
  stops.forEach(handle => handle.stop());
});
</script>

<style scoped>
.overlay-root {
  width: 100vw;
  height: 100dvh;
  margin: 0;
  padding: 12px;
  color: var(--text-color);
  background: var(--page-bg);
  font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}

.overlay-root[data-theme='cyber_blue'] {
  --page-bg: radial-gradient(circle at 18% 10%, #14263f 0%, #070b13 52%, #03050a 100%);
  --panel-bg: linear-gradient(155deg, rgba(10, 13, 21, 0.94), rgba(18, 29, 48, 0.92));
  --line-color: rgba(78, 230, 255, 0.55);
  --text-color: #dff5ff;
  --sub-color: #9ec9db;
  --accent: #45f3ff;
  --accent-soft: rgba(69, 243, 255, 0.24);
  --input-bg: rgba(4, 8, 16, 0.92);
  --btn-bg: linear-gradient(140deg, #04070d, #0e1728);
  --btn-fg: #dff5ff;
  --assistant-bubble: linear-gradient(150deg, rgba(10, 18, 31, 0.96), rgba(20, 35, 58, 0.88));
  --user-bubble: linear-gradient(145deg, rgba(7, 41, 68, 0.92), rgba(6, 26, 48, 0.92));
  --system-bubble: linear-gradient(145deg, rgba(22, 24, 30, 0.92), rgba(17, 19, 24, 0.92));
}

.overlay-root[data-theme='cyber_pink'] {
  --page-bg: radial-gradient(circle at 20% 8%, #f3f4f8 0%, #d0d3dd 55%, #b6b9c3 100%);
  --panel-bg: linear-gradient(150deg, rgba(236, 239, 246, 0.97), rgba(202, 206, 216, 0.95));
  --line-color: rgba(255, 64, 176, 0.55);
  --text-color: #161922;
  --sub-color: #3f475b;
  --accent: #ff44c2;
  --accent-soft: rgba(255, 68, 194, 0.22);
  --input-bg: rgba(245, 247, 251, 0.94);
  --btn-bg: linear-gradient(150deg, #eceff6, #cfd4df);
  --btn-fg: #1b1f2b;
  --assistant-bubble: linear-gradient(145deg, rgba(232, 236, 244, 0.97), rgba(220, 225, 235, 0.95));
  --user-bubble: linear-gradient(145deg, rgba(255, 225, 245, 0.96), rgba(255, 212, 238, 0.96));
  --system-bubble: linear-gradient(145deg, rgba(222, 224, 229, 0.95), rgba(208, 211, 219, 0.94));
}

.panel {
  width: 100%;
  height: calc(100dvh - 24px);
  border-radius: 18px;
  border: 1px solid var(--line-color);
  padding: 20px;
  background: var(--panel-bg);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 20px 50px rgba(0, 0, 0, 0.25);
  display: grid;
  grid-template-rows: auto auto 1fr auto auto;
  gap: 12px;
}

.panel-head {
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

.chat-box {
  min-height: 0;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid var(--line-color);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: rgba(0, 0, 0, 0.1);
}

.message-row {
  max-width: min(860px, 96%);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-row.role-user {
  align-self: flex-end;
}

.message-row.role-assistant,
.message-row.role-system {
  align-self: flex-start;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--sub-color);
}

.bubble {
  border-radius: 10px;
  border: 1px solid var(--line-color);
  padding: 10px 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.role-assistant .bubble {
  background: var(--assistant-bubble);
}

.role-user .bubble {
  background: var(--user-bubble);
}

.role-system .bubble {
  background: var(--system-bubble);
}

.placeholder {
  margin: auto 0;
  color: var(--sub-color);
  text-align: center;
}

.input-shell {
  position: relative;
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
  resize: none;
  min-height: 96px;
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

@media (max-width: 768px) {
  .overlay-root {
    padding: 8px;
  }

  .panel {
    height: calc(100dvh - 16px);
    padding: 14px;
  }

  h1 {
    font-size: 20px;
  }
}
</style>
