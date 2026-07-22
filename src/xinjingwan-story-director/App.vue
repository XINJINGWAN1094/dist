<template>
  <div class="director-shell" @focusin="keepFocusedFieldVisible">
    <header class="titlebar">
      <div class="title-main">
        <span class="title">xinjingwan</span>
        <span class="subtitle">{{ modeLabel }}</span>
      </div>
      <div class="window-actions">
        <button type="button" class="ghost-button" @click="closeWindow">关闭</button>
      </div>
    </header>

    <main class="content">
      <section class="status-strip">
        <div>
          <span class="status-label">运行提示</span>
          <strong>{{ runtimePromptStatus }}</strong>
          <span class="muted">{{ runtimeModeStatus }}</span>
        </div>
        <div>
          <span class="status-label">runId / 节点</span>
          <strong>{{ outlineRuntimeLabel }}</strong>
          <span class="muted">{{ outlineRuntimeHint }}</span>
        </div>
        <div>
          <span class="status-label">限时计数</span>
          <strong>{{ state.timedEnding.completedReplyCount }}</strong>
          <span class="muted">下一次 {{ state.timedEnding.nextReplyIndex }}</span>
        </div>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          :class="{ active: state.ui.tab === tab.value }"
          @click="setTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="state.ui.tab === 'outline'" class="panel">
        <div class="panel-head">
          <div>
            <h2>大纲模式</h2>
            <p>启用页会注入为本聊天运行提示；未启用页只保存在当前聊天变量。</p>
          </div>
          <button type="button" class="secondary-button" @click="addPage">新增页</button>
        </div>

        <div class="page-tabs">
          <button
            v-for="(page, index) in state.outline.pages"
            :key="page.id"
            type="button"
            :class="{
              active: page.id === state.outline.selectedPageId,
              enabled: page.id === state.outline.enabledPageId,
            }"
            @click="selectPage(page.id)"
          >
            第{{ index + 1 }}页
          </button>
        </div>

        <div v-if="selectedPage" class="outline-editor">
          <div class="row-between">
            <span class="muted">
              非空节点 {{ selectedNonEmptyNodes.length }} 个
              <template v-if="selectedPageIsEnabled"> · 启用中</template>
              <template v-if="selectedPage.completed"> · 已完成</template>
            </span>
            <button type="button" class="secondary-button" @click="clearPage(selectedPage.id)">清空本页</button>
          </div>

          <div class="progress-box">
            <div class="row-between">
              <span class="status-label">{{ selectedPageProgressTitle }}</span>
              <strong>{{ selectedPageProgressLabel }}</strong>
            </div>
            <p>{{ selectedPageProgressStatus }}</p>
            <span v-if="selectedPageProgressMeta" class="muted">{{ selectedPageProgressMeta }}</span>
          </div>

          <div class="node-list">
            <div v-for="(node, index) in selectedPage.nodes" :key="`${selectedPage.id}-${index}`" class="node-row">
              <label :for="`outline-node-${index}`">节点{{ index + 1 }}</label>
              <textarea
                :id="`outline-node-${index}`"
                :value="node"
                rows="3"
                placeholder="输入这一节点要推进的剧情"
                @input="updateNodeFromEvent(selectedPage.id, index, $event)"
              />
              <div class="node-actions">
                <button
                  type="button"
                  class="small-button"
                  :disabled="!canAddNode(selectedPage, index)"
                  @click="addNode(selectedPage.id)"
                >
                  +
                </button>
                <button
                  type="button"
                  class="small-button"
                  :disabled="selectedPage.nodes.length <= 1"
                  @click="removeNode(selectedPage.id, index)"
                >
                  -
                </button>
              </div>
            </div>
          </div>

          <div class="action-row">
            <button
              type="button"
              class="primary-button"
              :disabled="busy || selectedNonEmptyNodes.length === 0"
              @click="runAction('启用大纲模式', () => enableOutlinePage(selectedPage.id))"
            >
              启用本页
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="busy || !selectedPageIsEnabled"
              @click="runAction('关闭本页大纲', closeSelectedOutlinePage)"
            >
              标记本页完成 / 关闭本页
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="state.ui.tab === 'endingReference'" class="panel">
        <div class="panel-head">
          <div>
            <h2>弱结局参考</h2>
            <p>作为弱参考注入，不强推剧情，不让角色知晓幕后目标。</p>
          </div>
        </div>

        <textarea
          class="large-textarea"
          :value="state.endingReference.text"
          rows="12"
          placeholder="输入希望在条件合适时靠近的可能结局"
          @input="updateEndingReferenceFromEvent"
        />

        <div class="action-row">
          <button
            type="button"
            class="primary-button"
            :disabled="busy || !state.endingReference.text.trim()"
            @click="runAction('启用弱结局参考', enableEndingReference)"
          >
            启用参考
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || state.activeMode !== 'endingReference'"
            @click="runAction('关闭弱结局参考', disableEndingReference)"
          >
            关闭参考
          </button>
        </div>
      </section>

      <section v-else class="panel">
        <div class="panel-head">
          <div>
            <h2>限时结局</h2>
            <p>按计数会话统计被选中的未隐藏 AI 回复，暂停期间不计数。</p>
          </div>
        </div>

        <label class="field-label" for="timed-goal">目标结局</label>
        <textarea
          id="timed-goal"
          class="large-textarea"
          :value="state.timedEnding.goalText"
          rows="9"
          placeholder="输入需要逐步导向的目标结局"
          @input="updateTimedGoalFromEvent"
        />

        <div class="number-grid">
          <label for="target-index">
            目标完成序号
            <input
              id="target-index"
              type="number"
              min="1"
              max="999"
              :value="state.timedEnding.targetReplyIndex"
              @input="updateTimedTargetFromEvent"
            />
          </label>
          <div class="session-box">
            <span class="status-label">会话 ID</span>
            <strong>{{ state.timedEnding.sessionId || '尚未开始' }}</strong>
          </div>
        </div>

        <div class="action-row wrap">
          <button
            type="button"
            class="primary-button"
            :disabled="busy || !state.timedEnding.goalText.trim()"
            @click="runAction('作为新目标开始', startNewTimedGoal)"
          >
            作为新目标开始
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || !state.timedEnding.goalText.trim()"
            @click="runAction('继续目标', continueTimedGoal)"
          >
            继续目标
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || !state.timedEnding.sessionId"
            @click="runAction('应用到当前目标', applyTimedGoalToCurrentSession)"
          >
            应用到当前目标
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="busy || state.activeMode !== 'timedEnding'"
            @click="runAction('暂停目标', pauseTimedGoal)"
          >
            暂停目标
          </button>
        </div>
      </section>

      <section v-if="state.status.warnings.length > 0 || actionMessage" class="messages">
        <p v-if="actionMessage">{{ actionMessage }}</p>
        <p v-for="warning in state.status.warnings" :key="warning">{{ warning }}</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  addOutlinePage,
  createOutlineProgressReport,
  getNonEmptyNodes,
  getSelectedOutlinePage,
  onStateChanged,
  patchState,
  readState,
} from './state';
import type { OutlinePage, StoryDirectorMode } from './types';
import {
  applyTimedGoalToCurrentSession,
  closeOutlinePage,
  continueTimedGoal,
  disableEndingReference,
  enableEndingReference,
  enableOutlinePage,
  pauseTimedGoal,
  queueSync,
  refreshRuntimePromptStatus,
  startNewTimedGoal,
} from './sync';

const tabs: Array<{ value: StoryDirectorMode; label: string }> = [
  { value: 'outline', label: '大纲模式' },
  { value: 'endingReference', label: '弱结局参考' },
  { value: 'timedEnding', label: '限时结局' },
];

const state = ref(readState(true));
const busy = ref(false);
const actionMessage = ref('');

let stopStateListener: (() => void) | null = null;

const selectedPage = computed(() => getSelectedOutlinePage(state.value));
const selectedNonEmptyNodes = computed(() => getNonEmptyNodes(selectedPage.value));
const outlineProgress = computed(() => state.value.outline.progress);
const outlineNextNode = computed(() => outlineProgress.value.nextNode || 1);
const outlineProgressStatus = computed(() => outlineProgress.value.status || '等待 AI 在回复后回报当前节点状态。');
const outlineProgressMeta = computed(() => {
  const progress = outlineProgress.value;
  const parts: string[] = [];
  if (progress.messageId != null) {
    parts.push(`第${progress.messageId}楼`);
  }
  if (progress.confidence) {
    parts.push(progress.confidence);
  }
  if (progress.completedNode != null) {
    parts.push(`完成节点${progress.completedNode}`);
  }
  return parts.join(' · ');
});
const enabledPage = computed(() => {
  const pageId = state.value.outline.enabledPageId;
  return pageId ? (state.value.outline.pages.find(page => page.id === pageId) ?? null) : null;
});
const enabledPageIndex = computed(() => {
  if (!enabledPage.value) {
    return null;
  }
  const index = state.value.outline.pages.findIndex(page => page.id === enabledPage.value?.id);
  return index >= 0 ? index + 1 : null;
});
const selectedPageIsEnabled = computed(() => selectedPage.value.id === state.value.outline.enabledPageId);
const selectedPageLastKnownNode = computed(() => Math.max(1, Math.trunc(selectedPage.value.lastKnownNode || 1)));
const selectedPageProgressTitle = computed(() => (selectedPageIsEnabled.value ? 'AI 进度回报' : '本页状态'));
const selectedPageProgressLabel = computed(() => {
  if (selectedPageIsEnabled.value) {
    return `下一节点 ${outlineNextNode.value}`;
  }
  if (selectedPage.value.completed) {
    return '本页已完成';
  }
  return `记录节点 ${selectedPageLastKnownNode.value}`;
});
const selectedPageProgressStatus = computed(() => {
  if (selectedPageIsEnabled.value) {
    return outlineProgressStatus.value;
  }
  if (selectedPage.value.completed) {
    return '该页已标记完成，当前不会继续注入为运行提示。';
  }
  return '该页未启用。启用本页后，AI 才会按这一页的大纲推进。';
});
const selectedPageProgressMeta = computed(() => {
  if (selectedPageIsEnabled.value) {
    return outlineProgressMeta.value;
  }
  if (enabledPageIndex.value != null) {
    return `当前启用：第${enabledPageIndex.value}页`;
  }
  return '';
});
const outlineStatusNode = computed(() => {
  if (selectedPageIsEnabled.value || state.value.activeMode === 'outline') {
    return state.value.status.outlineCurrentNode || outlineNextNode.value || 1;
  }
  return selectedPageLastKnownNode.value;
});
const outlineStatusHint = computed(() => {
  if (selectedPageIsEnabled.value) {
    return outlineProgress.value.status ? '脚本状态' : '等待回报';
  }
  if (enabledPageIndex.value != null) {
    return `启用第${enabledPageIndex.value}页`;
  }
  return selectedPage.value.completed ? '已完成' : '未启用';
});
const modeLabel = computed(() => {
  if (state.value.activeMode === 'outline') {
    return '大纲启用中';
  }
  if (state.value.activeMode === 'endingReference') {
    return '结局参考启用中';
  }
  if (state.value.activeMode === 'timedEnding') {
    return '限时结局启用中';
  }
  return '未启用';
});
const runtimePromptStatus = computed(() => (state.value.status.runtimePromptInjected ? '已注入' : '未注入'));
const runtimeModeStatus = computed(() => modeLabel.value);
const outlineRuntimeLabel = computed(() => {
  if (state.value.activeMode !== 'outline' || !state.value.outline.runId) {
    return '无运行ID';
  }
  return `节点 ${outlineStatusNode.value}`;
});
const outlineRuntimeHint = computed(() => {
  if (state.value.activeMode === 'outline' && state.value.outline.runId) {
    return state.value.outline.runId;
  }
  return outlineStatusHint.value;
});

onMounted(() => {
  stopStateListener = onStateChanged(nextState => {
    state.value = nextState;
  });
});

onBeforeUnmount(() => {
  stopStateListener?.();
});

function setTab(tab: StoryDirectorMode) {
  patchState(stateToUpdate => {
    stateToUpdate.ui.tab = tab;
  });
}

function closeWindow() {
  patchState(stateToUpdate => {
    stateToUpdate.ui.visible = false;
  });
}

function queueIfOutlinePageEnabled(pageId: string, reason: string) {
  if (state.value.activeMode === 'outline' && state.value.outline.enabledPageId === pageId) {
    refreshRuntimePromptStatus(reason);
    queueSync(reason, false, 450);
  }
}

function selectPage(pageId: string) {
  patchState(stateToUpdate => {
    stateToUpdate.outline.selectedPageId = pageId;
  });
  queueIfOutlinePageEnabled(pageId, '切换大纲页');
}

function addPage() {
  addOutlinePage();
}

function clearPage(pageId: string) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page) {
      return;
    }
    page.nodes = [''];
    page.completed = false;
    page.lastKnownNode = 1;
    if (stateToUpdate.outline.enabledPageId === pageId) {
      stateToUpdate.outline.progress = createOutlineProgressReport(stateToUpdate.outline.runId, 1);
    }
  });
  queueIfOutlinePageEnabled(pageId, '清空大纲页');
}

function textFromEvent(event: Event) {
  return (event.target as HTMLTextAreaElement | HTMLInputElement).value;
}

function updateNodeFromEvent(pageId: string, index: number, event: Event) {
  updateNode(pageId, index, textFromEvent(event));
}

function updateNode(pageId: string, index: number, value: string) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page) {
      return;
    }
    page.nodes[index] = value;
    page.completed = false;
  });
  queueIfOutlinePageEnabled(pageId, '编辑大纲节点');
}

function canAddNode(page: OutlinePage, index: number) {
  return index === page.nodes.length - 1 && page.nodes.at(-1)?.trim();
}

function addNode(pageId: string) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page || !page.nodes.at(-1)?.trim()) {
      return;
    }
    page.nodes.push('');
  });
}

function removeNode(pageId: string, index: number) {
  patchState(stateToUpdate => {
    const page = stateToUpdate.outline.pages.find(candidate => candidate.id === pageId);
    if (!page || page.nodes.length <= 1) {
      return;
    }
    page.nodes.splice(index, 1);
    page.completed = false;
  });
  queueIfOutlinePageEnabled(pageId, '删除大纲节点');
}

function updateEndingReferenceFromEvent(event: Event) {
  updateEndingReference(textFromEvent(event));
}

function updateEndingReference(value: string) {
  patchState(stateToUpdate => {
    stateToUpdate.endingReference.text = value;
  });
  if (state.value.activeMode === 'endingReference') {
    refreshRuntimePromptStatus('编辑弱结局参考');
    queueSync('编辑弱结局参考', false, 450);
  }
}

function updateTimedGoalFromEvent(event: Event) {
  updateTimedGoal(textFromEvent(event));
}

function updateTimedGoal(value: string) {
  patchState(stateToUpdate => {
    stateToUpdate.timedEnding.goalText = value;
  });
  if (state.value.activeMode === 'timedEnding') {
    refreshRuntimePromptStatus('编辑限时结局目标');
    queueSync('编辑限时结局目标', false, 450);
  }
}

function updateTimedTargetFromEvent(event: Event) {
  updateTimedTarget(textFromEvent(event));
}

function updateTimedTarget(value: string) {
  const targetReplyIndex = Math.min(Math.max(Math.trunc(Number(value) || 1), 1), 999);
  patchState(stateToUpdate => {
    stateToUpdate.timedEnding.targetReplyIndex = targetReplyIndex;
  });
  if (state.value.activeMode === 'timedEnding') {
    refreshRuntimePromptStatus('修改限时结局序号');
    queueSync('修改限时结局序号', false, 450);
  }
}

async function runAction(label: string, action: () => Promise<void>) {
  busy.value = true;
  actionMessage.value = '';
  try {
    await action();
    actionMessage.value = `${label}完成。`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    actionMessage.value = detail;
    toastr.warning(detail, '剧情指导');
  } finally {
    busy.value = false;
  }
}

async function closeSelectedOutlinePage() {
  if (!selectedPageIsEnabled.value) {
    throw new Error('当前选中的大纲页未启用，不能关闭。');
  }
  await closeOutlinePage();
}

function scrollFocusedFieldIntoView(element: HTMLElement, delay = 0) {
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  const run = () => {
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: delay === 0 ? 'smooth' : 'auto' });
  };

  if (delay > 0) {
    ownerWindow.setTimeout(run, delay);
    return;
  }

  ownerWindow.requestAnimationFrame(run);
}

function keepFocusedFieldVisible(event: FocusEvent) {
  const element = event.target as HTMLElement | null;
  if (!element || (element.tagName !== 'TEXTAREA' && element.tagName !== 'INPUT')) {
    return;
  }

  scrollFocusedFieldIntoView(element);
  scrollFocusedFieldIntoView(element, 280);
  scrollFocusedFieldIntoView(element, 640);
}
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.director-shell {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(36, 59, 53, 0.18);
  border-radius: 8px;
  color: #192421;
  background: #f4f7f6;
  box-shadow: 0 10px 24px rgba(22, 31, 29, 0.16);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    'Microsoft YaHei',
    sans-serif;
}

.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 0 0 58px;
  height: 58px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid rgba(36, 59, 53, 0.12);
  background: #fbfdfc;
  cursor: move;
  user-select: none;
}

.title-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.title {
  overflow: hidden;
  color: #14221e;
  font-size: 15px;
  font-weight: 760;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle,
.muted {
  color: #687a72;
  font-size: 12px;
}

.window-actions,
.action-row,
.row-between {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content {
  display: flex;
  height: auto;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.status-strip > div,
.session-box,
.progress-box {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(36, 59, 53, 0.12);
  border-radius: 8px;
  background: #ffffff;
}

.status-label {
  display: block;
  margin-bottom: 3px;
  color: #687a72;
  font-size: 11px;
}

.status-strip strong,
.session-box strong,
.progress-box strong {
  display: block;
  overflow: hidden;
  color: #1f302a;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: 8px;
  background: #e4ebe8;
}

.tabs button,
.page-tabs button,
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  border: 0;
  border-radius: 7px;
  color: #294238;
  background: transparent;
  cursor: pointer;
  font: inherit;
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
}

.tabs button.active,
.page-tabs button.active {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(22, 31, 29, 0.12);
  font-weight: 700;
}

.panel {
  display: flex;
  min-height: auto;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow: visible;
  border: 1px solid rgba(36, 59, 53, 0.12);
  border-radius: 8px;
  background: #ffffff;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

h2,
p {
  margin: 0;
}

h2 {
  color: #18362d;
  font-size: 15px;
}

p {
  color: #687a72;
  font-size: 12px;
  line-height: 1.5;
}

.page-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 38px;
  overflow-y: hidden;
}

.page-tabs button {
  min-width: 56px;
  min-height: 34px;
  flex: 0 0 auto;
  padding: 0 12px;
  border: 1px solid rgba(36, 59, 53, 0.12);
  background: #f8fbf9;
}

.page-tabs button.enabled {
  border-color: rgba(55, 114, 95, 0.55);
  color: #23634d;
}

.outline-editor,
.node-list {
  display: flex;
  min-height: auto;
  flex-direction: column;
  gap: 10px;
}

.outline-editor {
  flex: none;
}

.row-between {
  justify-content: space-between;
}

.node-list {
  flex: none;
  overflow: visible;
  padding-right: 2px;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.node-row {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) 36px;
  gap: 8px;
  align-items: start;
}

.node-row label,
.field-label,
.number-grid label {
  color: #30453c;
  font-size: 12px;
  font-weight: 700;
}

textarea,
input {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(36, 59, 53, 0.18);
  border-radius: 8px;
  color: #192421;
  background: #fbfdfc;
  font: inherit;
  outline: none;
  scroll-margin-top: 96px;
  scroll-margin-bottom: 32px;
}

textarea {
  display: block;
  min-height: 78px;
  padding: 9px 10px;
  resize: vertical;
  line-height: 1.5;
}

textarea:focus,
input:focus {
  border-color: #408a71;
  box-shadow: 0 0 0 2px rgba(64, 138, 113, 0.14);
}

.large-textarea {
  min-height: 220px;
  flex: none;
}

.node-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.primary-button,
.secondary-button,
.ghost-button,
.small-button {
  border: 1px solid rgba(36, 59, 53, 0.16);
  padding: 0 12px;
  background: #ffffff;
}

.primary-button {
  border-color: #2f6f5c;
  color: #ffffff;
  background: #2f6f5c;
}

.secondary-button:hover,
.ghost-button:hover,
.small-button:hover {
  background: #eef6f1;
}

.primary-button:hover {
  background: #2f604f;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

button {
  touch-action: manipulation;
}

.small-button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  font-weight: 700;
}

.wrap {
  flex-wrap: wrap;
}

.number-grid {
  display: grid;
  grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
  gap: 10px;
  align-items: end;
}

.number-grid input {
  margin-top: 6px;
  padding: 8px 10px;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(173, 121, 37, 0.22);
  border-radius: 8px;
  background: #fffaf0;
}

.messages p {
  color: #705322;
}

.progress-box p {
  margin: 4px 0 2px;
  color: #30453c;
}

@media (max-width: 560px) {
  .director-shell {
    border-radius: 7px;
    box-shadow: 0 10px 28px rgba(27, 50, 42, 0.18);
  }

  .titlebar {
    flex-basis: 52px;
    height: 52px;
    gap: 8px;
    padding: 8px 9px 8px 12px;
  }

  .title-main {
    gap: 1px;
  }

  .title {
    font-size: 14px;
  }

  .subtitle,
  .muted {
    font-size: 11px;
  }

  .content {
    height: auto;
    gap: 6px;
    padding: 8px 8px calc(12px + env(safe-area-inset-bottom, 0px));
  }

  .status-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }

  .number-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .status-strip > div {
    display: flex;
    min-height: 46px;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    padding: 5px 6px;
  }

  .status-strip .status-label {
    margin-bottom: 0;
    font-size: 10px;
    line-height: 1.1;
  }

  .status-strip strong {
    font-size: 12px;
    line-height: 1.15;
  }

  .status-strip .muted {
    display: block;
    overflow: hidden;
    font-size: 10px;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-strip > div,
  .session-box,
  .progress-box,
  .panel,
  .messages {
    border-radius: 7px;
  }

  .tabs {
    gap: 4px;
    padding: 3px;
  }

  .tabs button {
    min-height: 34px;
    padding: 0 4px;
    font-size: 12px;
  }

  .panel {
    min-height: auto;
    flex: 0 0 auto;
    gap: 8px;
    overflow: visible;
    padding: 10px;
  }

  .panel-head,
  .row-between {
    flex-wrap: wrap;
  }

  .panel-head > button,
  .row-between > button {
    width: 100%;
  }

  .page-tabs {
    flex-wrap: nowrap;
    margin: 0 -2px;
    min-height: 42px;
    padding: 2px 2px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .page-tabs button {
    min-width: 64px;
    min-height: 36px;
    padding: 0 12px;
    font-size: 12px;
  }

  .outline-editor,
  .node-list {
    min-height: auto;
    flex: none;
  }

  .node-list {
    overflow: visible;
  }

  textarea {
    min-height: 112px;
    padding: 8px 9px;
  }

  textarea,
  input {
    font-size: 16px;
  }

  .node-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .node-actions {
    flex-direction: row;
  }

  .small-button {
    flex: 1;
    min-height: 36px;
  }

  .action-row {
    align-items: stretch;
    flex-direction: column;
  }

  .action-row button {
    width: 100%;
    min-height: 36px;
  }

  .large-textarea {
    min-height: 180px;
  }
}
</style>
