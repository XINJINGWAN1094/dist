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
          <div class="member-card-header">
            <span class="member-role">{{ getRoleLabel(member.role) }}</span>
            <strong class="member-name">{{ member.name }}</strong>
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

const selectedMemberId = ref<SquadMemberId | null>(null);

function selectMember(memberId: SquadMemberId) {
  if (selectedMemberId.value === memberId) {
    selectedMemberId.value = null;
    return;
  }
  selectedMemberId.value = memberId;
}

onMounted(() => {
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
  border-radius: 18px;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-color);
  cursor: pointer;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
  overflow: hidden;
}

.member-card::before {
  content: '';
  display: block;
  width: 100%;
  aspect-ratio: 9 / 16;
}

.member-card-header {
  padding: 14px 14px 10px;
  display: grid;
  align-content: start;
  gap: 8px;
}

.member-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 16px 30px rgba(0, 0, 0, 0.18);
}

.member-card.active::before {
  aspect-ratio: auto;
  height: 0;
}

.member-role {
  justify-self: flex-start;
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--btn-fg);
  background: rgba(255, 255, 255, 0.08);
  font-size: 12px;
}

.member-name {
  font-size: 20px;
  line-height: 1.1;
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
