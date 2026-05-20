<template>
  <section class="squad-shell">
    <header class="squad-header">
      <div>
        <p class="section-kicker">战队编成</p>
        <h2>我方四人战队</h2>
        <p class="section-note">点击成员卡进入信息页，属性修改会实时写入当前聊天变量，并同步到战斗场我方属性预览。</p>
      </div>

      <div class="header-actions">
        <span class="status-pill">当前聊天专属</span>
        <button type="button" class="reset-btn" @click="resetBattleRosterToDefaults">恢复初始值</button>
      </div>
    </header>

    <section class="squad-layout">
      <div class="card-grid">
        <button
          v-for="member in battleRosterMembers"
          :key="member.id"
          type="button"
          class="member-card"
          :class="{ active: selectedMemberId === member.id }"
          @click="selectMember(member.id)"
        >
          <span class="member-role">{{ getRoleLabel(member.role) }}</span>
          <strong class="member-name">{{ member.name }}</strong>
          <p class="member-brief">物攻 {{ member.stats.physicalAttack }} · 法攻 {{ member.stats.magicAttack }}</p>
          <p class="member-brief">生命 {{ member.stats.hp }} · 速度 {{ member.stats.speed }}</p>
          <p class="member-brief">物抗 {{ member.stats.physicalResist }} · 法抗 {{ member.stats.magicResist }}</p>
        </button>
      </div>

      <article v-if="selectedMember" class="detail-panel">
        <header class="detail-head">
          <div>
            <p class="section-kicker">成员信息页</p>
            <h3>{{ selectedMember.name }}</h3>
          </div>
          <span class="detail-role">{{ getRoleLabel(selectedMember.role) }}</span>
        </header>

        <div class="stat-grid">
          <label v-for="field in statFields" :key="field.key" class="stat-field">
            <span>{{ field.label }}</span>
            <input
              :value="selectedMember.stats[field.key]"
              type="number"
              :min="field.min"
              :max="field.max"
              class="stat-input"
              @input="onStatInput(field.key, $event)"
            />
          </label>
        </div>

        <p class="detail-tip">战斗场会读取这组属性作为我方开战时的基础数值，修改后无需手动保存。</p>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  battleRosterMembers,
  ensureBattleRosterLoaded,
  getRoleLabel,
  resetBattleRosterToDefaults,
  type SquadMemberId,
  type SquadMemberStatKey,
  updateBattleRosterStat,
} from '../battleRosterState';

const statFields: Array<{ key: SquadMemberStatKey; label: string; min: number; max: number }> = [
  { key: 'physicalAttack', label: '物理攻击', min: 0, max: 9999 },
  { key: 'magicAttack', label: '法术攻击', min: 0, max: 9999 },
  { key: 'hp', label: '生命值', min: 1, max: 99999 },
  { key: 'physicalResist', label: '物抗', min: 0, max: 9999 },
  { key: 'magicResist', label: '法抗', min: 0, max: 9999 },
  { key: 'speed', label: '速度', min: 1, max: 9999 },
];

const selectedMemberId = ref<SquadMemberId>('shen_xixi');
const selectedMember = computed(() => {
  return battleRosterMembers.value.find(member => member.id === selectedMemberId.value) ?? battleRosterMembers.value[0] ?? null;
});

function selectMember(memberId: SquadMemberId) {
  selectedMemberId.value = memberId;
}

function onStatInput(statKey: SquadMemberStatKey, event: Event) {
  if (!selectedMember.value) {
    return;
  }

  const input = event.target as HTMLInputElement | null;
  updateBattleRosterStat(selectedMember.value.id, statKey, input?.value ?? selectedMember.value.stats[statKey]);
}

onMounted(() => {
  ensureBattleRosterLoaded();
  if (!battleRosterMembers.value.some(member => member.id === selectedMemberId.value)) {
    selectedMemberId.value = battleRosterMembers.value[0]?.id ?? 'shen_xixi';
  }
});
</script>

<style scoped>
.squad-shell {
  min-height: 0;
  display: grid;
  gap: 12px;
}

.squad-header,
.detail-panel,
.member-card {
  border: 1px solid var(--line-color);
  background: rgba(0, 0, 0, 0.08);
}

.squad-header {
  border-radius: 16px;
  padding: 16px 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.section-kicker {
  margin: 0 0 6px;
  color: var(--sub-color);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.squad-header h2,
.detail-head h3 {
  margin: 0;
  font-size: 22px;
}

.section-note,
.detail-tip {
  margin: 8px 0 0;
  color: var(--sub-color);
  line-height: 1.65;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.status-pill,
.detail-role {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 6px 12px;
  color: var(--sub-color);
  font-size: 12px;
  white-space: nowrap;
}

.reset-btn {
  border: 1px solid var(--line-color);
  border-radius: 999px;
  padding: 8px 14px;
  color: var(--btn-fg);
  background: var(--btn-bg);
  cursor: pointer;
}

.squad-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 12px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.member-card {
  min-height: 178px;
  border-radius: 18px;
  padding: 18px 16px;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  display: grid;
  align-content: start;
  gap: 8px;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}

.member-card:hover {
  transform: translateY(-2px);
}

.member-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft), 0 16px 30px rgba(0, 0, 0, 0.18);
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
  font-size: 26px;
  line-height: 1.1;
}

.member-brief {
  margin: 0;
  color: var(--sub-color);
  line-height: 1.6;
}

.detail-panel {
  border-radius: 18px;
  padding: 18px;
  display: grid;
  align-content: start;
  gap: 14px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-role {
  color: var(--text-color);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.stat-field {
  display: grid;
  gap: 8px;
}

.stat-field > span {
  color: var(--sub-color);
  font-size: 13px;
}

.stat-input {
  width: 100%;
  border: 1px solid var(--line-color);
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--text-color);
  background: var(--input-bg);
  outline: none;
  font-size: 15px;
}

@media (max-width: 980px) {
  .squad-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .squad-header {
    display: grid;
  }

  .card-grid,
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .member-card {
    min-height: 0;
  }
}
</style>
