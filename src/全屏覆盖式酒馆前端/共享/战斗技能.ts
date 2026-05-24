import type { SquadMemberRole } from './训练结算';

export type FighterSide = 'ally' | 'enemy';
export type SkillKind = 'physical' | 'magic';
export type SkillTargetType = 'opponent' | 'ally' | 'any' | 'none';
export type SkillTargetMode = 'selected' | 'allOpponents' | 'randomOpponents' | 'none';
export type BattleStatusKind =
  | 'attack_buff'
  | 'team_stat_buff'
  | 'defense_buff'
  | 'counter_stance'
  | 'silenced'
  | 'untargetable'
  | 'overload'
  | 'vulnerable';

export type SkillDefinition = {
  id: string;
  name: string;
  kind?: SkillKind;
  ratio?: number;
  cooldown: number;
  description: string;
  targetType: SkillTargetType;
  targetMode: SkillTargetMode;
  randomTargetCount?: number;
  ignoreResistRate?: number;
  selfHealMaxHpRate?: number;
  targetHealMaxHpRate?: number;
  teamHealMaxHpRate?: number;
  teamShieldMaxHpRate?: number;
  cooldownReduction?: number;
  attackBuffRate?: number;
  nextRoundTeamStatBuffRate?: number;
  selfDefenseBuffRate?: number;
  counterStance?: boolean;
  counterIncomingDamageMultiplier?: number;
  counterReflectRate?: number;
  counterNextRoundHealMaxHpRate?: number;
  silenceNextRound?: boolean;
  selfUntargetableNextRound?: boolean;
  selfOverloadDebuff?: boolean;
  targetVulnerableNextRoundRate?: number;
  executeThresholdHpRate?: number;
  executeRatio?: number;
  targetPriorityRoles?: SquadMemberRole[];
  selfCurrentHpCostRate?: number;
};

export type EnemyRoleSkillLibrary = Record<SquadMemberRole, SkillDefinition[]>;

export type EnemySkillLibraryPayload = {
  version: number;
  roleSkills: EnemyRoleSkillLibrary;
};

export const ENEMY_SKILL_LIBRARY_GLOBAL_KEY = 'TH_FULLSCREEN_ENEMY_SKILL_LIBRARY';
