<template>
  <section class="squad-shell">
    <section class="squad-layout">
      <div class="card-grid">
        <div
          v-for="member in battleRosterMembers"
          :key="member.id"
          class="member-card"
          :class="{ active: selectedMemberId === member.id }"
          @click="selectMember(member.id)"
        >
          <div class="member-portrait-frame">
            <img
              class="member-portrait"
              :src="getMemberPortrait(member.id).primarySrc"
              :alt="getMemberPortrait(member.id).alt"
              loading="lazy"
              decoding="async"
              @error="handlePortraitError($event, member.id)"
            />
            <div class="member-card-header">
              <span class="member-role">{{ getRoleLabel(member.role) }}</span>
              <strong class="member-name">{{ member.name }}</strong>
            </div>
          </div>

          <div v-if="selectedMemberId === member.id" class="member-detail">
            <div class="detail-row">
              <span class="detail-label">物理攻击</span>
              <span class="detail-value">{{ member.stats.physicalAttack }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">法术攻击</span>
              <span class="detail-value">{{ member.stats.magicAttack }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">生命值</span>
              <span class="detail-value">{{ member.stats.hp }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">物抗</span>
              <span class="detail-value">{{ member.stats.physicalResist }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">法抗</span>
              <span class="detail-value">{{ member.stats.magicResist }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">速度</span>
              <span class="detail-value">{{ member.stats.speed }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  battleRosterMembers,
  ensureBattleRosterLoaded,
  getRoleLabel,
  type SquadMemberId,
} from '../battleRosterState';

type SquadPortrait = {
  primarySrc: string;
  fallbackSrc: string;
  alt: string;
};

const GITHUB_RAW_ASSET_BASE = 'https://raw.githubusercontent.com/XINJINGWAN1094/dist/dev/assets/battle-roster';
const GITHUB_PAGES_ASSET_BASE = 'https://xinjingwan1094.github.io/dist/assets/battle-roster';
const PORTRAIT_ROTATION_STORAGE_KEY = 'th_fullscreen_overlay_squad_portrait_cycle_v1';
const SQUAD_MEMBER_IDS: SquadMemberId[] = ['shen_xixi', 'li_yenan', 'bai_zhi', 'su_su'];

function createPortrait(filename: string, alt: string): SquadPortrait {
  return {
    primarySrc: `${GITHUB_RAW_ASSET_BASE}/${filename}`,
    fallbackSrc: `${GITHUB_PAGES_ASSET_BASE}/${filename}`,
    alt,
  };
}

const SQUAD_MEMBER_PORTRAITS: Record<SquadMemberId, SquadPortrait[]> = {
  shen_xixi: [createPortrait('shen-xixi-01.png', '沈汐汐人物形象 1'), createPortrait('shen-xixi-02.png', '沈汐汐人物形象 2')],
  li_yenan: [createPortrait('li-yenan-01.png', '李叶楠人物形象 1'), createPortrait('li-yenan-02.png', '李叶楠人物形象 2')],
  bai_zhi: [createPortrait('bai-zhi-01.png', '白稚人物形象 1'), createPortrait('bai-zhi-02.png', '白稚人物形象 2')],
  su_su: [
    createPortrait('su-su-01.png', '苏酥人物形象 1'),
    createPortrait('su-su-02.png', '苏酥人物形象 2'),
    createPortrait('su-su-03.png', '苏酥人物形象 3'),
  ],
};

function createDefaultPortraitIndexes(): Record<SquadMemberId, number> {
  return {
    shen_xixi: 0,
    li_yenan: 0,
    bai_zhi: 0,
    su_su: 0,
  };
}

function normalizePortraitIndex(memberId: SquadMemberId, value: unknown): number {
  const portraitCount = SQUAD_MEMBER_PORTRAITS[memberId].length;
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return ((Math.trunc(numericValue) % portraitCount) + portraitCount) % portraitCount;
}

function readPortraitCycleState(): Record<SquadMemberId, number> {
  const defaults = createDefaultPortraitIndexes();
  try {
    const raw = window.localStorage.getItem(PORTRAIT_ROTATION_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Partial<Record<SquadMemberId, unknown>>;
    return {
      shen_xixi: normalizePortraitIndex('shen_xixi', parsed.shen_xixi),
      li_yenan: normalizePortraitIndex('li_yenan', parsed.li_yenan),
      bai_zhi: normalizePortraitIndex('bai_zhi', parsed.bai_zhi),
      su_su: normalizePortraitIndex('su_su', parsed.su_su),
    };
  } catch (error) {
    console.warn('[全屏覆盖式酒馆前端] 读取战队人物图片轮换状态失败，已回退到首张图片。', error);
    return defaults;
  }
}

function writePortraitCycleState(state: Record<SquadMemberId, number>) {
  try {
    window.localStorage.setItem(PORTRAIT_ROTATION_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[全屏覆盖式酒馆前端] 保存战队人物图片轮换状态失败。', error);
  }
}

const selectedMemberId = ref<SquadMemberId | null>(null);
const displayedPortraitIndexes = ref<Record<SquadMemberId, number>>(createDefaultPortraitIndexes());

function selectMember(memberId: SquadMemberId) {
  if (selectedMemberId.value === memberId) {
    selectedMemberId.value = null;
    return;
  }
  selectedMemberId.value = memberId;
}

function rotatePortraitsForPageOpen() {
  const storedState = readPortraitCycleState();
  const displayedState = createDefaultPortraitIndexes();
  const nextState = createDefaultPortraitIndexes();

  for (const memberId of SQUAD_MEMBER_IDS) {
    displayedState[memberId] = normalizePortraitIndex(memberId, storedState[memberId]);
    nextState[memberId] = (displayedState[memberId] + 1) % SQUAD_MEMBER_PORTRAITS[memberId].length;
  }

  displayedPortraitIndexes.value = displayedState;
  writePortraitCycleState(nextState);
}

function getMemberPortrait(memberId: SquadMemberId): SquadPortrait {
  const portraits = SQUAD_MEMBER_PORTRAITS[memberId];
  return portraits[displayedPortraitIndexes.value[memberId] % portraits.length];
}

function handlePortraitError(event: Event, memberId: SquadMemberId) {
  const image = event.target instanceof HTMLImageElement ? event.target : null;
  if (!image) {
    return;
  }

  const portrait = getMemberPortrait(memberId);
  if (image.src === portrait.fallbackSrc) {
    return;
  }
  image.src = portrait.fallbackSrc;
}

onMounted(() => {
  rotatePortraitsForPageOpen();
  ensureBattleRosterLoaded();
});
</script>

<style scoped>
.squad-shell {
  min-height: 0;
  display: grid;
  gap: 12px;
}

.squad-layout {
  min-height: 0;
  display: grid;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.member-card {
  border: 1px solid var(--line-color);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-color);
  cursor: pointer;
  display: grid;
  grid-template-rows: auto;
  gap: 0;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
  overflow: hidden;
}

.member-portrait-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 832 / 1216;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.16);
}

.member-portrait {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 160ms ease;
}

.member-card-header {
  position: absolute;
  inset: auto 0 0;
  padding: 42px 12px 12px;
  display: grid;
  align-content: start;
  gap: 8px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.74), rgba(0, 0, 0, 0.42) 52%, rgba(0, 0, 0, 0));
}

.member-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 16px 30px rgba(0, 0, 0, 0.18);
}

.member-card.active .member-portrait {
  transform: scale(1.015);
}

.member-role {
  justify-self: flex-start;
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--btn-fg);
  background: rgba(255, 255, 255, 0.16);
  font-size: 12px;
  backdrop-filter: blur(8px);
}

.member-name {
  color: #fff;
  font-size: 20px;
  line-height: 1.1;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.78);
}

.member-detail {
  padding: 10px 14px 14px;
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--line-color);
  background: rgba(0, 0, 0, 0.04);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.detail-label {
  color: var(--sub-color);
  font-size: 13px;
}

.detail-value {
  font-size: 15px;
  font-weight: 600;
}

@media (max-width: 980px) {
  .card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
