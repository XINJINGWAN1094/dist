<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  categories,
  createTreasures,
  people as examplePeople,
  slots,
  type Category,
  type Slot,
  type Treasure,
  type Person,
} from './fixture';
import { categoryIcons, equipmentBenefitsApply, type EquipmentCommand } from '../../equipment';
import { findEquipmentApi, viewFromEquipmentState, type EquipmentApi } from './runtime';

const art = (name: string) => `./assets/${name}.webp`;
const screen = ref(location.hash === '#people' ? 'people' : 'treasures');
const treasures = ref(createTreasures());
const people = ref<Person[]>(structuredClone(examplePeople));
const isLive = ref(false);
const saving = ref(false);
const runtimeError = ref('');
let runtimeApi: EquipmentApi | undefined;
let runtimeToken = '';
const emptyPerson: Person = {
  id: '',
  name: '尚未建档',
  realm: '未知',
  hp: 0,
  energy: 0,
  defense: 0,
  attack: 0,
  cap: 0,
  progressMax: 0,
  nextRealm: '待定',
};
const itemArt = (item: Pick<Treasure, 'category'>) => art(categoryIcons[item.category]);
const category = ref<Category | '全部'>('全部');
const search = ref('');
const rosterSearch = ref('');
const rosterFilter = ref('all');
const selectedId = ref('demo-crystal');
const personId = ref('lia');
const recipient = ref('yun');
const ownerFilter = ref('');
const selected = computed(() => treasures.value.find(item => item.id === selectedId.value));
const person = computed(() => people.value.find(p => p.id === personId.value) ?? emptyPerson);
const energyLabel = computed(() =>
  person.value.routes?.includes('法力') && !person.value.routes.includes('斗气') ? '法力' : '斗气',
);
const visiblePeople = computed(() =>
  people.value.filter(
    p =>
      `${p.name}${p.realm}`.includes(rosterSearch.value.trim()) &&
      (rosterFilter.value === 'all' || treasures.value.some(t => t.ownerId === p.id && t.slot)),
  ),
);
const visibleItems = computed(() =>
  treasures.value.filter(
    item =>
      (category.value === '全部' || item.category === category.value) &&
      (!ownerFilter.value || item.ownerId === ownerFilter.value) &&
      `${item.name}${item.category}`.includes(search.value.trim()),
  ),
);
const equippedItems = computed(() => treasures.value.filter(t => t.ownerId === personId.value && t.slot));
const equipped = (slot: Slot) => equippedItems.value.find(t => t.slot === slot);
const ownerName = (id?: string) => people.value.find(p => p.id === id)?.name ?? '未分配';
function benefitsApply(item: Treasure, id = item.ownerId ?? recipient.value) {
  if (!item.metadata) return true;
  const target = people.value.find(p => p.id === id);
  if (!target) return false;
  const routeFits = equipmentBenefitsApply(
    { 姓名: target.name, 路线: Object.fromEntries((target.routes ?? ['斗气']).map(route => [route, {}])) },
    item.metadata,
  );
  const ranks = Object.entries(target.routeRanks ?? {})
    .filter(([name]) => item.metadata!.适用路线 === '通用' || name === item.metadata!.适用路线)
    .map(([, rank]) => rank);
  return routeFits && (!item.metadata.品阶 || Math.max(0, ...ranks) >= item.metadata.品阶);
}
function refreshRuntime() {
  runtimeApi = findEquipmentApi();
  if (!runtimeApi) {
    if (isLive.value) {
      people.value = [];
      treasures.value = [];
      runtimeToken = '';
      runtimeError.value = '装备脚本未连接，请重新加载角色脚本。';
    }
    return;
  }
  isLive.value = true;
  // 独立预览的人物图表不能跨聊天带进真实存档。
  portraitUrls.value = {};
  localAddress.value = '';
  try {
    const snapshot = runtimeApi.read();
    const view = viewFromEquipmentState(snapshot.gameplay);
    runtimeToken = snapshot.token;
    people.value = view.people;
    treasures.value = view.treasures;
    if (!people.value.some(p => p.id === personId.value)) personId.value = people.value[0]?.id ?? '';
    if (!people.value.some(p => p.id === recipient.value)) recipient.value = personId.value;
    if (!treasures.value.some(t => t.id === selectedId.value)) selectedId.value = treasures.value[0]?.id ?? '';
    runtimeError.value = '';
  } catch (error) {
    people.value = [];
    treasures.value = [];
    runtimeToken = '';
    runtimeError.value = error instanceof Error ? error.message : '当前存档无法读取。';
  }
}
async function commitEquipment(command: EquipmentCommand) {
  if (!runtimeApi || !runtimeToken || saving.value) return false;
  saving.value = true;
  try {
    await runtimeApi.apply(command, runtimeToken);
    refreshRuntime();
    return true;
  } catch (error) {
    notice(error instanceof Error ? error.message : '保存失败。');
    refreshRuntime();
    return false;
  } finally {
    saving.value = false;
  }
}
const mode = ref('normal');
const discarding = ref(false);
const discardQuantity = ref(1);
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout>;
const notice = (message: string) => {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 3600);
};
const detail = ref<HTMLElement>();
const portraitUrls = ref<Record<string, string>>({});
const brokenPortraits = ref<Record<string, boolean>>({});
const portraitStatus = ref('');
const portraitBusy = ref(false);
const portraitInput = ref<HTMLInputElement>();
const localAddress = ref('');

function switchScreen(value: string) {
  screen.value = value;
  history.replaceState(null, '', `#${value}`);
  discarding.value = false;
}
function selectItem(item: Treasure, focus = false) {
  selectedId.value = item.id;
  discarding.value = false;
  discardQuantity.value = 1;
  if (item.ownerId) recipient.value = item.ownerId;
  if (focus || matchMedia('(max-width: 650px)').matches)
    nextTick(() =>
      detail.value?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      }),
    );
}
function filterCategory(value: Category | '全部') {
  category.value = value;
  discarding.value = false;
  nextTick(() => {
    if (!visibleItems.value.some(i => i.id === selectedId.value)) selectedId.value = visibleItems.value[0]?.id ?? '';
  });
}
function showEquipment(slot: Slot) {
  const item = equipped(slot);
  search.value = '';
  ownerFilter.value = '';
  recipient.value = personId.value;
  switchScreen('treasures');
  category.value = item ? '全部' : slots.find(s => s.id === slot)!.category;
  selectedId.value = item?.id ?? visibleItems.value[0]?.id ?? '';
  nextTick(() => document.querySelector('h1')?.scrollIntoView({ block: 'start' }));
}
function viewPersonTreasures() {
  ownerFilter.value = personId.value;
  category.value = '全部';
  search.value = '';
  recipient.value = personId.value;
  switchScreen('treasures');
  selectedId.value = visibleItems.value[0]?.id ?? '';
}
function destination(item: Treasure): Slot {
  if (item.category === '武器') return 'weapon';
  if (item.category === '防具') return 'armor';
  if (item.category === '修为秘宝') return 'growth';
  if (item.category === '特殊物品') return 'special';
  return treasures.value.some(t => t.ownerId === recipient.value && t.slot === 'accessory1' && t.id !== item.id)
    ? 'accessory2'
    : 'accessory1';
}
const replacement = computed(() => {
  const item = selected.value;
  if (!item || item.use !== 'wear' || item.slot) return undefined;
  return treasures.value.find(t => t.ownerId === recipient.value && t.slot === destination(item));
});
function removeItem(item: Treasure, quantity: number) {
  item.quantity -= quantity;
  if (item.quantity <= 0) {
    treasures.value = treasures.value.filter(t => t.id !== item.id);
    selectedId.value = visibleItems.value[0]?.id ?? '';
  }
  discarding.value = false;
}
async function useSelected() {
  const item = selected.value;
  if (!item || item.use === 'special' || saving.value) return;
  if (isLive.value) {
    if (!item.inventoryRef) return;
    if (item.use === 'consume') {
      const route = item.metadata?.效果?.find(effect => effect.类型 === '修为')?.路线;
      if (runtimeApi?.version !== 2 || !route) {
        notice('此秘宝的效果规格尚未完善，物品已保留。');
        return;
      }
      if (await commitEquipment({ type: 'consume', ref: item.inventoryRef, personId: recipient.value, route }))
        notice(`${ownerName(recipient.value)}已使用${item.name}，修为已保存`);
      return;
    }
    const command: EquipmentCommand = item.slot
      ? { type: 'unequip', ref: item.inventoryRef }
      : {
          type: 'equip',
          ref: item.inventoryRef,
          personId: recipient.value,
          slot: destination(item),
          splitId: crypto.randomUUID(),
        };
    if (await commitEquipment(command))
      notice(
        item.slot
          ? `已卸下${item.name}`
          : `已佩戴${item.name}${benefitsApply(item, recipient.value) ? '' : '；路线不符，增幅不生效'}`,
      );
    return;
  }
  if (item.use === 'consume') {
    removeItem(item, 1);
    notice(`${ownerName(recipient.value)}已使用一份${item.name}`);
    return;
  }
  if (item.slot) {
    item.slot = undefined;
    notice(`已卸下${item.name}`);
    return;
  }
  const targetSlot = destination(item);
  const previous = treasures.value.find(t => t.ownerId === recipient.value && t.slot === targetSlot);
  if (previous) previous.slot = undefined;
  // 叠放示例佩戴一件时拆分，保持每件只占一个装备位置。
  if (item.quantity > 1) {
    item.quantity--;
    const copy = {
      ...item,
      id: `${item.id}-${crypto.randomUUID()}`,
      quantity: 1,
      ownerId: recipient.value,
      slot: targetSlot,
    };
    treasures.value.push(copy);
    selectedId.value = copy.id;
  } else {
    item.ownerId = recipient.value;
    item.slot = targetSlot;
  }
  notice(`${ownerName(recipient.value)}已佩戴${item.name}${benefitsApply(item) ? '' : '；路线不符，增幅不生效'}`);
}
async function discardSelected() {
  const item = selected.value;
  if (!item) return;
  const count = Math.min(item.quantity, Math.max(1, Math.floor(Number(discardQuantity.value) || 1)));
  const name = item.name;
  if (isLive.value) {
    if (item.inventoryRef && (await commitEquipment({ type: 'discard', ref: item.inventoryRef, quantity: count }))) {
      discarding.value = false;
      notice(`已丢弃${name}${count > 1 ? ` × ${count}` : ''}`);
    }
    return;
  }
  removeItem(item, count);
  notice(`已丢弃${name}${count > 1 ? ` × ${count}` : ''}`);
}
function setPreviewState(value: string) {
  if (isLive.value) return;
  mode.value = value;
  discarding.value = false;
  treasures.value = value === 'empty' ? [] : createTreasures();
  category.value = '全部';
  ownerFilter.value = '';
  search.value = '';
  selectedId.value = treasures.value[0]?.id ?? '';
}
function selectPerson(id: string) {
  personId.value = id;
  portraitStatus.value = '';
  localAddress.value = portraitUrls.value[id] ?? '';
}
async function uploadPortrait(event: Event) {
  if (isLive.value) {
    portraitStatus.value = '当前存档的人物图片功能尚未开放。';
    return;
  }
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    portraitStatus.value = '请选择 8 MB 以内的 PNG、JPG 或 WebP 图片。';
    return;
  }
  const id = personId.value;
  portraitBusy.value = true;
  portraitStatus.value = '';
  try {
    const response = await fetch(`./api/portraits/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!response.ok) throw new Error('图片未保存，请确认本地预览服务正在运行后重试。');
    const result = await response.json();
    portraitUrls.value[id] = result.url;
    brokenPortraits.value[id] = false;
    if (id === personId.value) localAddress.value = result.url;
    notice(`${ownerName(id)}的图片已保存`);
  } catch (error) {
    portraitStatus.value = error instanceof Error ? error.message : '上传失败，请重试。';
  } finally {
    portraitBusy.value = false;
  }
}
async function saveAddress() {
  if (isLive.value) {
    portraitStatus.value = '当前存档的人物图片功能尚未开放。';
    return;
  }
  const id = personId.value;
  try {
    const url = new URL(localAddress.value.trim(), location.href);
    if (
      !localAddress.value.trim() ||
      !['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    )
      throw new Error('请填写本地服务的图片地址，例如 /portraits/人物.png。');
    portraitBusy.value = true;
    portraitStatus.value = '';
    const response = await fetch(`./api/portraits/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.href }),
    });
    if (!response.ok) throw new Error('地址未保存，请检查本地服务后重试。');
    const result = await response.json();
    portraitUrls.value[id] = result.url;
    brokenPortraits.value[id] = false;
    notice('人物图片地址已保存');
  } catch (error) {
    portraitStatus.value = error instanceof Error ? error.message : '地址无法使用。';
  } finally {
    portraitBusy.value = false;
  }
}
function hashChanged() {
  screen.value = location.hash === '#people' ? 'people' : 'treasures';
}
onMounted(async () => {
  window.addEventListener('hashchange', hashChanged);
  window.addEventListener('focus', refreshRuntime);
  try {
    window.parent.addEventListener('selyumis-equipment-changed', refreshRuntime);
  } catch {}
  refreshRuntime();
  if (isLive.value) return;
  try {
    const response = await fetch('./api/portraits');
    if (response.ok) {
      portraitUrls.value = await response.json();
      localAddress.value = portraitUrls.value[personId.value] ?? '';
    }
  } catch {
    /* 独立 HTML 仍可浏览；上传时提供明确错误。 */
  }
});
onUnmounted(() => {
  clearTimeout(toastTimer);
  window.removeEventListener('hashchange', hashChanged);
  window.removeEventListener('focus', refreshRuntime);
  try {
    window.parent.removeEventListener('selyumis-equipment-changed', refreshRuntime);
  } catch {}
});
</script>

<template>
  <div class="selyumis-shell" :class="screen">
    <header class="masthead">
      <div class="brand">
        <img :src="art(screen === 'treasures' ? 'compass' : 'crest')" alt="" /><span>赛琉弥斯</span>
      </div>
      <div v-if="screen === 'people'" class="screen-title" aria-hidden="true">领地人物</div>
      <nav class="main-nav" aria-label="面板切换">
        <button :aria-current="screen === 'treasures' ? 'page' : undefined" @click="switchScreen('treasures')">
          宝物藏室
        </button>
        <button :aria-current="screen === 'people' ? 'page' : undefined" @click="switchScreen('people')">
          领地人物
        </button>
      </nav>
    </header>

    <main v-if="screen === 'treasures'" class="treasure-layout">
      <aside class="category-sidebar" aria-label="宝物分类">
        <div class="category-list">
          <button
            v-for="entry in categories"
            :key="entry.name"
            :class="{ active: category === entry.name }"
            :aria-pressed="category === entry.name"
            @click="filterCategory(entry.name)"
          >
            <img :src="art(entry.art)" alt="" /><span>{{ entry.name }}</span>
            <small class="sr-only">{{
              entry.name === '全部' ? treasures.length : treasures.filter(t => t.category === entry.name).length
            }}</small>
          </button>
        </div>
      </aside>
      <section class="collection paper-panel">
        <div class="section-title">
          <h1>宝物藏室</h1>
          <span class="collection-count">{{ treasures.length }} 件藏品</span>
        </div>
        <div class="search-field">
          <label class="sr-only" for="treasure-search">搜索宝物</label
          ><input id="treasure-search" v-model="search" placeholder="搜索宝物" type="search" />
        </div>
        <div v-if="mode === 'capacity'" class="capacity-notice" role="status">
          <strong>藏室将满</strong><span>清理不再需要的宝物，为新的收获留出位置。</span>
        </div>
        <button v-if="ownerFilter" class="filter-reset" @click="ownerFilter = ''">
          正在查看{{ ownerName(ownerFilter) }}的宝物 · 显示全部
        </button>
        <div v-if="visibleItems.length" class="item-grid">
          <button
            v-for="item in visibleItems"
            :key="item.id"
            class="item-card"
            :class="{ selected: selectedId === item.id }"
            :aria-pressed="selectedId === item.id"
            :aria-label="`${item.name}，${item.category}，数量 ${item.quantity}${item.slot ? '，已佩戴' : ''}`"
            @click="selectItem(item)"
          >
            <span class="item-illustration"
              ><img :src="itemArt(item)" alt="" loading="lazy" /><span v-if="item.slot" class="wear-label"
                >{{ ownerName(item.ownerId) }}佩戴</span
              ><span class="quantity">{{ item.quantity }}</span></span
            >
            <span class="item-name">{{ item.name }}</span>
          </button>
        </div>
        <div v-else class="empty-collection">
          <img :src="art('crest')" alt="" />
          <h2>{{ treasures.length ? '未找到宝物' : '藏室静候新的收获' }}</h2>
          <p>{{ treasures.length ? '试试其他名称或分类。' : '获得的宝物将在这里陈列。' }}</p>
          <button
            v-if="treasures.length"
            class="text-button"
            @click="
              search = '';
              ownerFilter = '';
              filterCategory('全部');
            "
          >
            清除筛选
          </button>
        </div>
        <p class="collection-footnote">
          {{ category === '全部' ? '收藏于此，随行于你。' : category }}<span>容量待定</span>
        </p>
      </section>
      <aside ref="detail" class="item-detail paper-panel" aria-label="宝物详情">
        <template v-if="selected">
          <div class="detail-body">
            <h2>{{ selected.name }}</h2>
            <div class="item-classification">
              <span>{{ selected.category }}</span
              ><span>{{ selected.metadata?.品阶 ? `${selected.metadata.品阶}阶` : '品阶待定' }}</span>
            </div>
            <dl class="item-facts">
              <div>
                <dt>数量</dt>
                <dd>{{ selected.quantity }}</dd>
              </div>
              <div>
                <dt>当前归属</dt>
                <dd>{{ ownerName(selected.ownerId) }}{{ selected.slot ? ' · 已佩戴' : '' }}</dd>
              </div>
            </dl>
            <div class="effect-description">
              <h3>宝物效果</h3>
              <p>{{ selected.effect }}</p>
              <small v-if="selected.metadata?.子类 === '法杖'">法师系武器 · 骑士佩戴不产生增幅</small>
              <small v-if="selected.use === 'wear' && !benefitsApply(selected)">路线不符，增幅不生效</small>
              <small v-else-if="!isLive">具体数值待定</small>
            </div>
            <div class="item-actions">
              <template v-if="!selected.slot"
                ><label for="recipient">{{ selected.use === 'consume' ? '使用对象' : '佩戴对象' }}</label
                ><select id="recipient" v-model="recipient">
                  <option v-for="p in people" :key="p.id" :value="p.id">{{ p.name }} · {{ p.realm }}</option>
                </select></template
              >
              <p v-if="replacement" class="replacement-note">
                将替换{{ ownerName(recipient) }}的{{ replacement.name }}
              </p>
              <button
                class="ornate-button"
                :disabled="saving || selected.use === 'special' || !people.length"
                @click="useSelected"
              >
                {{
                  selected.use === 'special'
                    ? '机制待定'
                    : selected.slot
                      ? '卸下'
                      : selected.use === 'consume'
                        ? '使用'
                        : '佩戴'
                }}
              </button>
              <button v-if="!discarding" class="discard-button" @click="discarding = true">丢弃宝物</button>
              <div v-else class="discard-confirm">
                <p>丢弃{{ selected.name }}？{{ selected.slot ? '同时解除佩戴。' : '' }}</p>
                <label v-if="selected.quantity > 1"
                  >数量 <input v-model="discardQuantity" type="number" min="1" :max="selected.quantity"
                /></label>
                <div>
                  <button class="quiet-button" @click="discarding = false">保留</button
                  ><button class="danger-button" @click="discardSelected">确认丢弃</button>
                </div>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="empty-detail">
          <h2>宝物详情</h2>
          <p>选择一件宝物，查看它的用途与归属。</p>
        </div>
      </aside>
    </main>

    <main v-else class="people-layout">
      <aside class="roster paper-panel" aria-label="领地人物名册">
        <h1 class="roster-title">领地人物</h1>
        <label class="sr-only" for="person-search">搜索人物</label
        ><input id="person-search" v-model="rosterSearch" class="roster-search" type="search" placeholder="搜索人物" />
        <div class="roster-tabs" aria-label="人物筛选">
          <button :aria-pressed="rosterFilter === 'all'" @click="rosterFilter = 'all'">全部</button>
          <button :aria-pressed="rosterFilter === 'equipped'" @click="rosterFilter = 'equipped'">已装备</button>
        </div>
        <button
          v-for="p in visiblePeople"
          :key="p.id"
          class="person-row"
          :class="{ active: personId === p.id }"
          :aria-pressed="personId === p.id"
          @click="selectPerson(p.id)"
        >
          <span class="person-avatar"
            ><img
              v-if="portraitUrls[p.id] && !brokenPortraits[p.id]"
              :src="portraitUrls[p.id]"
              alt=""
              @error="brokenPortraits[p.id] = true" /><img v-else :src="art('heraldry')" alt="" /></span
          ><span
            ><strong>{{ p.name }}</strong
            ><small>{{ p.realm }}</small></span
          >
        </button>
        <p v-if="!visiblePeople.length" class="roster-empty">未找到人物，换个名字试试。</p>
      </aside>
      <section class="character-inspection paper-panel" :aria-label="`${person.name}的人物图片与装备`">
        <div class="inspection-heading">
          <span>{{ person.name }}</span
          ><span>全身宝物</span>
        </div>
        <div class="equipment-stage">
          <figure class="portrait-canvas">
            <img
              v-if="portraitUrls[personId] && !brokenPortraits[personId]"
              :src="portraitUrls[personId]"
              :alt="`${person.name}的人物图片`"
              @error="brokenPortraits[personId] = true"
            />
            <div v-else class="portrait-placeholder">
              <div class="portrait-prompt">
                <strong>{{ person.name }}</strong>
                <p>{{ portraitUrls[personId] ? '图片未能加载' : '尚未放置人物图片' }}</p>
                <button v-if="!isLive" class="quiet-button" :disabled="portraitBusy" @click="portraitInput?.click()">
                  {{ portraitUrls[personId] ? '重新上传' : '上传人物图片' }}
                </button>
              </div>
            </div>
          </figure>
          <button
            v-for="(slot, index) in slots"
            :key="slot.id"
            class="equipment-slot"
            :class="[`slot-${index}`, { filled: equipped(slot.id) }]"
            :title="equipped(slot.id)?.name ?? `选择${slot.label}`"
            @click="showEquipment(slot.id)"
          >
            <span>{{ slot.label }}</span
            ><img v-if="equipped(slot.id)" :src="itemArt(equipped(slot.id)!)" alt="" /><img
              v-else
              class="empty-emblem"
              :src="art(categoryIcons[slot.category])"
              alt=""
            /><small>{{ equipped(slot.id)?.name ?? '未装备' }}</small>
          </button>
        </div>
        <div v-if="!isLive" class="portrait-tools">
          <input
            ref="portraitInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            @change="uploadPortrait"
          /><button class="text-button" :disabled="portraitBusy" @click="portraitInput?.click()">
            {{ portraitBusy ? '正在保存图片…' : portraitUrls[personId] ? '更换人物图片' : '上传图片' }}
          </button>
          <details :key="personId">
            <summary>使用本地图片地址</summary>
            <div class="address-editor">
              <label :for="`portrait-${personId}`">{{ person.name }}的图片地址</label
              ><input
                :id="`portrait-${personId}`"
                v-model="localAddress"
                placeholder="http://127.0.0.1:8000/…"
              /><button class="quiet-button" :disabled="portraitBusy" @click="saveAddress">保存地址</button>
            </div>
          </details>
        </div>
        <p v-if="portraitStatus" class="portrait-error" role="alert">{{ portraitStatus }}</p>
        <button class="ornate-button view-treasures" @click="viewPersonTreasures">查看宝物</button>
      </section>
      <aside class="character-stats paper-panel" aria-label="人物属性">
        <h2>{{ person.name }}</h2>
        <p class="realm">{{ person.realm }} · {{ energyLabel }}</p>
        <section class="stats-section" aria-label="战斗属性">
          <div class="vital">
            <div>
              <span><img class="stat-icon" :src="art('icon-life')" alt="" />生命</span
              ><strong
                >{{ person.hp }} <small>/ {{ person.hpMax ?? person.hp }}</small></strong
              >
            </div>
            <progress :value="person.hp" :max="(person.hpMax ?? person.hp) || 1" aria-label="当前生命" />
          </div>
          <div class="vital energy">
            <div>
              <span><img class="stat-icon" :src="art('icon-special')" alt="" />{{ energyLabel }}</span
              ><strong
                >{{ person.energy }} <small>/ {{ person.energyMax ?? person.energy }}</small></strong
              >
            </div>
            <progress
              :value="person.energy"
              :max="(person.energyMax ?? person.energy) || 1"
              :aria-label="`当前${energyLabel}`"
            />
          </div>
          <dl class="stat-list">
            <div>
              <dt><img class="stat-icon" :src="art('icon-defense')" alt="" />防御</dt>
              <dd>{{ person.defense }}</dd>
            </div>
            <div>
              <dt><img class="stat-icon" :src="art('icon-attack')" alt="" />普通攻击</dt>
              <dd>{{ person.attack }}</dd>
            </div>
            <div>
              <dt><img class="stat-icon" :src="art('icon-cap')" alt="" />单次投入上限</dt>
              <dd>{{ person.cap }}</dd>
            </div>
          </dl>
        </section>
        <section class="growth-section">
          <h3>成长</h3>
          <p>
            天赋
            <span :title="person.talent ? '只影响修为积累速度，不直接增加战斗属性' : undefined"
              >{{ person.talent ?? '待抽取' }}{{ person.talentFactor ? ` · ×${person.talentFactor}` : '' }}</span
            >
          </p>
          <div class="growth-value">
            <span>修为</span
            ><strong
              >{{ person.progress ?? 0 }} <small>/ {{ person.progressMax }}</small></strong
            >
          </div>
          <progress :max="person.progressMax || 1" :value="person.progress ?? 0" aria-label="当前修为" />
          <p>
            下一境界 <span>{{ person.nextRealm }}</span>
          </p>
          <small>{{ person.growthNote ?? '随世界时间成长' }}</small>
        </section>
        <section class="equipped-section">
          <h3>
            已装备宝物 <small>{{ equippedItems.length }}</small>
          </h3>
          <button v-for="item in equippedItems" :key="item.id" class="equipped-row" @click="showEquipment(item.slot!)">
            <img :src="itemArt(item)" alt="" /><span
              ><strong>{{ item.name }}</strong
              ><small>{{ benefitsApply(item, personId) ? item.effect : '路线不符，增幅不生效' }}</small></span
            >
          </button>
          <p v-if="!equippedItems.length" class="no-equipment">尚未佩戴宝物。</p>
        </section>
      </aside>
    </main>
    <div class="feedback-toast" role="status" aria-live="polite">
      <span v-if="toast">{{ toast }}</span>
    </div>
    <footer class="preview-toolbar">
      <span>{{
        isLive ? runtimeError || '当前聊天 · 佩戴与丢弃自动保存' : '界面预览 · 示例宝物，操作不写入聊天'
      }}</span>
      <div v-if="!isLive">
        <button :aria-pressed="mode === 'normal'" @click="setPreviewState('normal')">重置示例</button
        ><button
          :aria-pressed="mode === 'capacity'"
          @click="
            switchScreen('treasures');
            setPreviewState('capacity');
          "
        >
          容量提醒</button
        ><button
          :aria-pressed="mode === 'empty'"
          @click="
            switchScreen('treasures');
            setPreviewState('empty');
          "
        >
          空藏室
        </button>
      </div>
    </footer>
  </div>
</template>
