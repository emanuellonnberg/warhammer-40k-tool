import type { Army } from '../types';
import type {
  ArmyState,
  UnitState,
  SimulationConfig,
  SimulationResult,
  PhaseLog,
  ActionLog,
  MovementDetail
} from './types';
import { classifyArmyRoles } from './role-classifier';
import { pickStartingDistance } from './distance';
import { calculateUnitDamage, calculateWeaponDamage } from '../calculators';
import type { Weapon, Unit } from '../types';
import { getWeaponType } from '../utils/weapon';
import { lookupBaseSizeMM } from '../data/base-sizes';

const DEFAULT_INITIATIVE: 'armyA' | 'armyB' = 'armyA';
const DEPLOY_SPREAD_Y = 3; // inches between unit centers vertically
const SCOUT_PUSH = 6; // forward push for Scout/Infiltrate style units (within deployment)
const DEFAULT_MODEL_SPACING = 1.25;
const INCHES_PER_MM = 1 / 25.4;
const MODEL_PER_ROW = 5;
const BASE_RADII: { match: RegExp; radius: number }[] = [
  { match: /(knight|lord of|baneblade|wraithknight)/i, radius: 3 },
  { match: /(land raider|predator|hammerhead|riptide|monolith|castigator)/i, radius: 2.5 },
  { match: /(dread|crisis|terminator|broadsides|wraithlord)/i, radius: 1.25 },
  { match: /(infantry|squad|team|sisters|cultist|pathfinder|fire warrior|boyz|gaunt|guardian)/i, radius: 1 }
];

function getUnitModelCount(unit: Unit): number {
  if (Array.isArray(unit.models) && unit.models.length) {
    const sum = unit.models.reduce((acc, model) => acc + (model.count || 0), 0);
    if (sum > 0) return sum;
  }
  if (unit.count && unit.count > 1) return unit.count;
  const weaponMax = unit.weapons.reduce((max, weapon) => {
    const modelsWith = weapon.models_with_weapon ?? weapon.count ?? 0;
    return Math.max(max, modelsWith);
  }, 0);
  if (weaponMax > 0) return weaponMax;
  return Math.max(1, unit.count || 1);
}

function createModelFormation(
  count: number,
  centerX: number,
  centerY: number,
  spacing: number = DEFAULT_MODEL_SPACING
): { x: number; y: number; alive: boolean }[] {
  if (count <= 0) return [];
  const perRow = Math.max(1, Math.min(MODEL_PER_ROW, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / perRow);
  const positions: { x: number; y: number; alive: boolean }[] = [];
  const rowOffset = (rows - 1) / 2;
  const colOffset = (perRow - 1) / 2;
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = centerX + (col - colOffset) * spacing;
    const y = centerY + (row - rowOffset) * spacing;
    positions.push({ x, y, alive: true });
  }
  return positions;
}

function shiftModelPositions(unit: UnitState, dx: number, dy: number): void {
  if ((!dx && !dy) || !unit.modelPositions) return;
  unit.modelPositions.forEach(model => {
    model.x += dx;
    model.y += dy;
  });
}

function updateModelLife(unit: UnitState): void {
  if (!unit.modelPositions) return;
  unit.modelPositions.forEach((model, idx) => {
    model.alive = idx < unit.remainingModels;
  });
}

function hasScout(unit: Unit): boolean {
  const text = [
    ...(unit.rules || []).map(r => r.toLowerCase?.() || ''),
    ...(unit.abilities || []).map(a => (typeof a === 'string' ? a.toLowerCase() : ''))
  ].join(' ');
  return text.includes('scout') || text.includes('infiltrate');
}

function hasDeepStrike(unit: Unit): boolean {
  const text = [
    ...(unit.rules || []).map(r => r.toLowerCase?.() || ''),
    ...(unit.abilities || []).map(a => (typeof a === 'string' ? a.toLowerCase() : ''))
  ].join(' ');
  return text.includes('deep strike') || text.includes('strategic reserve');
}

function initializeArmyState(
  army: Army,
  tag: 'armyA' | 'armyB',
  deployDepth: number,
  battlefieldWidth: number,
  battlefieldHeight: number
): ArmyState {
  const roles = classifyArmyRoles(army);
  const n = army.units.length || 1;
  const ySpacing = Math.min(DEPLOY_SPREAD_Y, battlefieldHeight / Math.max(1, n + 1));
  const halfW = battlefieldWidth / 2;
  const units: UnitState[] = army.units.map((unit, idx) => {
    const scoutPush = hasScout(unit) ? Math.min(SCOUT_PUSH, deployDepth / 2) : 0;
    const xBase = tag === 'armyA'
      ? -halfW + deployDepth / 2 + scoutPush
      : halfW - deployDepth / 2 - scoutPush;
    const yPos = -battlefieldHeight / 2 + ySpacing * (idx + 1);
    const modelCount = getUnitModelCount(unit);
    const woundsPerModel = parseInt(unit.stats.wounds || '1', 10) || 1;
    const baseSizeMM = lookupBaseSizeMM(unit.name);
    const baseSizeInches = baseSizeMM ? baseSizeMM * INCHES_PER_MM : undefined;
    const spacing = Math.max(baseSizeInches ?? DEFAULT_MODEL_SPACING, DEFAULT_MODEL_SPACING);
    return {
      unit,
      remainingModels: modelCount,
      remainingWounds: modelCount * woundsPerModel,
      role: roles[unit.id],
      position: { x: xBase, y: yPos },
      engaged: false,
      modelPositions: createModelFormation(modelCount, xBase, yPos, spacing),
      baseSizeInches,
      baseSizeMM,
      advanced: false,
      fellBack: false,
      roleLabel: roles[unit.id]?.primary
    };
  });

  return { army, units, tag };
}

function summarizePhase(
  phase: PhaseLog['phase'],
  turn: number,
  actor: PhaseLog['actor'],
  description: string,
  damageDealt?: number,
  distanceAfter?: number,
  actions?: ActionLog[],
  advancedUnits?: string[],
  movementDetails?: MovementDetail[]
): PhaseLog {
  return { phase, turn, actor, description, damageDealt, distanceAfter, actions, advancedUnits, movementDetails };
}

function expectedShootingDamage(attacker: UnitState, defenderToughness: number, includeOneTimeWeapons: boolean): number {
  return calculateUnitDamage(
    attacker.unit,
    defenderToughness,
    false,
    undefined,
    includeOneTimeWeapons,
    true
  ).total;
}

function applyDamage(target: UnitState, damage: number, casualties?: CasualtyLog[]): {
  modelsKilled: number;
  damagePerModel: number;
  remainingWoundsOnDamagedModel: number;
  totalModelsInUnit: number;
} {
  const woundsPerModel = parseInt(target.unit.stats.wounds || '1', 10);
  const beforeModels = target.remainingModels;
  let woundsRemaining = target.remainingWounds - damage;
  woundsRemaining = Math.max(0, woundsRemaining);
  const modelsRemaining = Math.floor(woundsRemaining / woundsPerModel);

  target.remainingWounds = woundsRemaining;
  target.remainingModels = Math.max(0, modelsRemaining);
  updateModelLife(target);

  const modelsKilled = beforeModels - target.remainingModels;
  const damagePerModel = beforeModels > 0 ? damage / beforeModels : 0;
  const remainingWoundsOnDamagedModel = woundsRemaining % woundsPerModel;

  if (casualties && modelsKilled > 0) {
    casualties.push({
      unitId: target.unit.id,
      unitName: target.unit.name,
      modelsLost: modelsKilled
    });
  }

  return {
    modelsKilled,
    damagePerModel,
    remainingWoundsOnDamagedModel,
    totalModelsInUnit: target.remainingModels
  };
}

/**
 * Run a single-round deterministic engagement where both armies close to optimal range and exchange blows once.
 */
export function runSimpleEngagement(
  armyA: Army,
  armyB: Army,
  config: SimulationConfig = {}
): SimulationResult {
  const includeOneTimeWeapons = config.includeOneTimeWeapons ?? false;
  const initiative = config.initiative ?? DEFAULT_INITIATIVE;
  const maxRounds = config.maxRounds ?? 3;
  const allowAdvance = config.allowAdvance ?? true;
  const randomCharge = config.randomCharge ?? false;
  const maxPoints = Math.max(armyA.pointsTotal || 2000, armyB.pointsTotal || 2000);
  const battlefield = battlefieldFromPoints(maxPoints);
  const stateA = initializeArmyState(armyA, 'armyA', battlefield.deployDepth, battlefield.width, battlefield.height);
  const stateB = initializeArmyState(armyB, 'armyB', battlefield.deployDepth, battlefield.width, battlefield.height);
  const startPositions = snapshotPositions(stateA, stateB);
  const startingDistance = minDistanceBetweenArmies(stateA, stateB);
  const perTurnPositions: SimulationResult['positionsPerTurn'] = [];
  const timeline: NonNullable<SimulationResult['positionsTimeline']> = [];
  const logs: PhaseLog[] = [];
  const damageTally = { armyA: 0, armyB: 0 };
  const survivorsCount = (state: ArmyState) => state.units.filter(u => u.remainingModels > 0).length;
  const turnOrder = initiative === 'armyA' ? [stateA, stateB] : [stateB, stateA];
  let endReason: 'maxRounds' | 'armyDestroyed' = 'maxRounds';

  for (let round = 1; round <= maxRounds; round++) {
    for (const active of turnOrder) {
      const opponent = active === stateA ? stateB : stateA;

      const movementDetails = moveArmiesTowardEachOther(active, opponent, allowAdvance, battlefield.width, battlefield.height);
      clampAllSpacing(stateA, stateB);
      const postMoveDistance = Math.max(0, minDistanceBetweenArmies(stateA, stateB));
      const advancedUnits = active.units.filter(u => u.advanced).map(u => u.unit.name);
      logs.push(summarizePhase('movement', round, active.tag, `Round ${round}: ${active.tag} moves.`, undefined, postMoveDistance, undefined, advancedUnits.length ? advancedUnits : undefined, movementDetails.length ? movementDetails : undefined));
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      const shootActions: ActionLog[] = [];
      const shootCasualties: CasualtyLog[] = [];
      const shootDamage = expectedShootingDamageBatch(active, opponent, includeOneTimeWeapons, shootActions, shootCasualties);
      logs.push(summarizePhase('shooting', round, active.tag, `Round ${round}: ${active.tag} shooting.`, shootDamage, undefined, shootActions));
      damageTally[active.tag] += shootDamage;
      logs[logs.length - 1].casualties = shootCasualties;
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      const chargeActions: ActionLog[] = [];
      performCharges(active, opponent, randomCharge);
      clampAllSpacing(stateA, stateB);
      setEngagements(stateA, stateB);
      const postChargeDistance = Math.max(0, minDistanceBetweenArmies(stateA, stateB));
      logs.push(summarizePhase('charge', round, active.tag, `Round ${round}: ${active.tag} charges.`, undefined, postChargeDistance, chargeActions));
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      const meleeActions: ActionLog[] = [];
      const meleeCasualties: CasualtyLog[] = [];
      const meleeDamage = expectedMeleeDamageBatch(active, opponent, includeOneTimeWeapons, meleeActions, meleeCasualties);
      logs.push(summarizePhase('melee', round, active.tag, `Round ${round}: ${active.tag} fights.`, meleeDamage, undefined, meleeActions));
      damageTally[active.tag] += meleeDamage;
      logs[logs.length - 1].casualties = meleeCasualties;
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      perTurnPositions.push({ turn: round, ...snapshotPositions(stateA, stateB) });

      if (stateA.units.every(u => u.remainingModels <= 0) || stateB.units.every(u => u.remainingModels <= 0)) {
        endReason = 'armyDestroyed';
        break;
      }
    }
    if (endReason === 'armyDestroyed') break;
  }

  const survA = survivorsCount(stateA);
  const survB = survivorsCount(stateB);
  let winner: 'armyA' | 'armyB' | null = null;
  if (endReason === 'armyDestroyed') {
    if (survA > 0 && survB <= 0) winner = 'armyA';
    else if (survB > 0 && survA <= 0) winner = 'armyB';
  } else if (survA !== survB) {
    winner = survA > survB ? 'armyA' : 'armyB';
  }

  return {
    startingDistance,
    initiative,
    logs,
    armyAState: stateA,
    armyBState: stateB,
    battlefield,
    positions: {
      start: startPositions,
      end: snapshotPositions(stateA, stateB)
    },
    positionsPerTurn: perTurnPositions,
    positionsTimeline: timeline,
    endReason,
    winner,
    summary: {
      armyA: {
        damageDealt: damageTally.armyA,
        damageTaken: damageTally.armyB,
        survivors: survA,
        totalUnits: stateA.units.length
      },
      armyB: {
        damageDealt: damageTally.armyB,
        damageTaken: damageTally.armyA,
        survivors: survB,
        totalUnits: stateB.units.length
      }
    }
  };
}
function averageMove(state: ArmyState): number {
  if (!state.units.length) return 0;
  const total = state.units.reduce((sum, u) => sum + parseInt(u.unit.stats.move || '0', 10), 0);
  return total / state.units.length;
}

function moveArmiesTowardEachOther(
  active: ArmyState,
  opponent: ArmyState,
  allowAdvance: boolean,
  battlefieldWidth: number,
  battlefieldHeight: number
): MovementDetail[] {
  const movements: MovementDetail[] = [];
  const desiredGap = (unit: UnitState) => {
    // Melee-primary units keep closing to engagement range
    if (unit.role.primary === 'melee-missile') return 1.1;
    return Math.max(6, unit.role.optimalRange || 12);
  };

  active.units.forEach(u => {
    if (u.remainingModels <= 0) return;
    const mv = parseInt(u.unit.stats.move || '0', 10) || 0;
    const startPos = { x: u.position.x, y: u.position.y };
    // Nearest defender
    const targets = opponent.units.filter(t => t.remainingModels > 0);
    if (!targets.length) return;
    targets.sort((a, b) => distanceBetween(u, a) - distanceBetween(u, b));
    const target = targets[0];
    const dist = distanceBetween(u, target);
    const desired = desiredGap(u);
    const delta = Math.max(0, dist - desired);
    const wantsAdvance = allowAdvance && delta > mv;
    const moveCap = wantsAdvance ? mv + 3 : mv;
    const step = Math.min(moveCap, delta);
    const dx = target.position.x - u.position.x;
    const dy = target.position.y - u.position.y;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    const moveX = (dx / len) * step;
    const moveY = (dy / len) * step;
    u.position.x += moveX;
    u.position.y += moveY;
    shiftModelPositions(u, moveX, moveY);
    clampToBoard(u, battlefieldWidth, battlefieldHeight);
    u.engaged = false;
    const actualDistance = Math.sqrt((u.position.x - startPos.x) ** 2 + (u.position.y - startPos.y) ** 2);
    u.advanced = wantsAdvance && actualDistance > 0;
    if (actualDistance > 0.05) {
      movements.push({
        unitId: u.unit.id,
        unitName: u.unit.name,
        army: active.tag,
        from: startPos,
        to: { x: u.position.x, y: u.position.y },
        distance: actualDistance,
        advanced: u.advanced ?? false
      });
    }
  });

  return movements;
}

function minDistanceBetweenArmies(stateA: ArmyState, stateB: ArmyState): number {
  let minDist = Infinity;
  stateA.units.forEach(a => {
    if (a.remainingModels <= 0) return;
    stateB.units.forEach(b => {
      if (b.remainingModels <= 0) return;
      const d = distanceBetween(a, b);
      if (d < minDist) minDist = d;
    });
  });
  return minDist === Infinity ? 0 : minDist;
}

function minOptimalRange(state: ArmyState): number {
  const ranges = state.units.map(u => u.role.optimalRange || 12);
  return ranges.length ? Math.min(...ranges) : 12;
}

function setEngagements(stateA: ArmyState, stateB: ArmyState): void {
  const ENGAGE_RANGE = 1.1;
  stateA.units.forEach(a => a.engaged = false);
  stateB.units.forEach(b => b.engaged = false);

  stateA.units.forEach(a => {
    if (a.remainingModels <= 0) return;
    stateB.units.forEach(b => {
      if (b.remainingModels <= 0) return;
      const d = distanceBetween(a, b);
      if (d <= ENGAGE_RANGE) {
        a.engaged = true;
        b.engaged = true;
      }
    });
  });
}

function clampAllSpacing(stateA: ArmyState, stateB: ArmyState): void {
  clampArmySpacing(stateA);
  clampArmySpacing(stateB);
  clampInterArmySpacing(stateA, stateB);
}

function clampArmySpacing(state: ArmyState): void {
  const units = state.units.filter(u => u.remainingModels > 0);
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      resolveOverlap(a, b);
    }
  }
}

function clampInterArmySpacing(stateA: ArmyState, stateB: ArmyState): void {
  stateA.units.forEach(a => {
    stateB.units.forEach(b => {
      resolveOverlap(a, b);
    });
  });
}

function resolveOverlap(a: UnitState, b: UnitState): void {
  if (a.remainingModels <= 0 || b.remainingModels <= 0) return;
  const minDist = unitCollisionRadius(a) + unitCollisionRadius(b) + 0.1;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= minDist && dist > 0.001) return;
  const primaryDx = dist > 0.001 ? dx : (a.position.x <= b.position.x ? -0.01 : 0.01);
  const primaryDy = dist > 0.001 ? dy : 0;
  const actualDist = dist > 0.001 ? dist : Math.sqrt(primaryDx * primaryDx + primaryDy * primaryDy);
  const scale = (minDist - actualDist) / Math.max(actualDist, 0.001) / 2;
  const adjustAx = -primaryDx * scale;
  const adjustAy = -primaryDy * scale;
  const adjustBx = primaryDx * scale;
  const adjustBy = primaryDy * scale;
  a.position.x += adjustAx;
  a.position.y += adjustAy;
  b.position.x += adjustBx;
  b.position.y += adjustBy;
  shiftModelPositions(a, adjustAx, adjustAy);
  shiftModelPositions(b, adjustBx, adjustBy);
}

function parseRangeStr(rangeValue?: string): number {
  if (!rangeValue) return 12;
  const match = rangeValue.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 12;
}

function battlefieldFromPoints(maxPoints: number) {
  // Short edge 44", long edge 60" for Strike Force/Onslaught; smaller for Incursion
  if (maxPoints >= 1500) {
    return { width: 44, height: 60, deployDepth: 12 };
  }
  return { width: 44, height: 30, deployDepth: 9 };
}

function clampToBoard(u: UnitState, battlefieldWidth: number, battlefieldHeight: number) {
  const halfW = battlefieldWidth / 2;
  const halfH = battlefieldHeight / 2;
  const beforeX = u.position.x;
  const beforeY = u.position.y;
  u.position.x = Math.max(-halfW, Math.min(halfW, u.position.x));
  u.position.y = Math.max(-halfH, Math.min(halfH, u.position.y));
  const dx = u.position.x - beforeX;
  const dy = u.position.y - beforeY;
  shiftModelPositions(u, dx, dy);
}

function baseRadius(unit: UnitState): number {
  if (unit.baseSizeInches) return unit.baseSizeInches / 2;
  const name = unit.unit.name.toLowerCase();
  for (const { match, radius } of BASE_RADII) {
    if (match.test(name)) return radius;
  }
  return 1;
}

function unitCollisionRadius(unit: UnitState): number {
  const base = baseRadius(unit);
  if (!unit.modelPositions?.length) return base;
  const maxDist = unit.modelPositions.reduce((max, model) => {
    const dx = model.x - unit.position.x;
    const dy = model.y - unit.position.y;
    return Math.max(max, Math.sqrt(dx * dx + dy * dy));
  }, 0);
  const spacing = Math.max(unit.baseSizeInches ?? DEFAULT_MODEL_SPACING, DEFAULT_MODEL_SPACING);
  return Math.max(base, maxDist + spacing / 2);
}

function maxWeaponRange(unit: Unit): number {
  let maxRange = 0;
  unit.weapons.forEach(w => {
    const r = parseRangeStr(w.characteristics?.range);
    if (r > maxRange) maxRange = r;
  });
  return maxRange || 12;
}

function distanceBetween(a: UnitState, b: UnitState): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function expectedShootingDamageBatch(
  attackerArmy: ArmyState,
  defenderArmy: ArmyState,
  includeOneTimeWeapons: boolean,
  actions?: ActionLog[],
  casualties?: CasualtyLog[]
): number {
  let total = 0;
  const attackers = attackerArmy.units.filter(u => u.remainingModels > 0);
  const defenders = defenderArmy.units.filter(d => d.remainingModels > 0);
  const fired = new Set<string>();

  for (const attacker of attackers) {
    if (fired.has(attacker.unit.id)) continue; // ensure each unit fires once
    fired.add(attacker.unit.id);
    if (!defenders.length) break;

    // If the unit advanced and has no Assault weapons, skip shooting
    const hasAssault = attacker.unit.weapons.some(w => (w.characteristics?.keywords || '').toLowerCase().includes('assault'));
    if (attacker.advanced && !hasAssault) continue;

    // Fire each weapon at its own best in-range target
    attacker.unit.weapons.forEach((weapon: Weapon) => {
      const keywords = (weapon.characteristics?.keywords || '').toLowerCase();
      const isAssault = keywords.includes('assault');
      if (attacker.advanced && !isAssault) return; // cannot fire non-Assault after advance
      const wType = getWeaponType(weapon);
      if (attacker.engaged && wType !== 'pistol') return; // in engagement, only pistols can fire

      const candidates = defenders
        .filter(d => d.remainingModels > 0)
        .map(def => {
          const dist = distanceBetween(attacker, def);
          const range = parseRangeStr(weapon.characteristics?.range);
          return {
            def,
            dist,
            dmg: dist <= range ? calculateWeaponDamage(weapon, parseInt(def.unit.stats.toughness || '4', 10), false, includeOneTimeWeapons, true) : 0
          };
        })
        .filter(c => c.dmg > 0)
        .sort((a, b) => b.dmg - a.dmg);

      if (!candidates.length) return;
      const best = candidates[0];
      const casualtyDetails = applyDamage(best.def, best.dmg, casualties);
      total += best.dmg;
      actions?.push({
        attackerId: attacker.unit.id,
        attackerName: attacker.unit.name,
        defenderId: best.def.unit.id,
        defenderName: best.def.unit.name,
        damage: best.dmg,
        phase: 'shooting',
        weaponName: weapon.name,
        distance: best.dist,
        modelsKilled: casualtyDetails.modelsKilled,
        damagePerModel: casualtyDetails.damagePerModel,
        remainingWounds: casualtyDetails.remainingWoundsOnDamagedModel,
        totalModelsInUnit: casualtyDetails.totalModelsInUnit
      });

      // remove defender if dead
      if (best.def.remainingModels <= 0) {
        const idx = defenders.indexOf(best.def);
        if (idx >= 0) defenders.splice(idx, 1);
      }
    });
  }

  return total;
}

function expectedMeleeDamageBatch(attackerArmy: ArmyState, defenderArmy: ArmyState, includeOneTimeWeapons: boolean, actions?: ActionLog[], casualties?: CasualtyLog[]): number {
  let total = 0;

  const meleeAttackers = attackerArmy.units.filter(u => u.remainingModels > 0 && (u.engaged || u.role.primary === 'melee-missile'));
  const defenders = defenderArmy.units.filter(d => d.remainingModels > 0);

  for (const attacker of meleeAttackers) {
    if (!defenders.length) break;

    const best = defenders
      .map(def => ({
        def,
        dmg: expectedMeleeDamage(attacker, parseInt(def.unit.stats.toughness || '4', 10), includeOneTimeWeapons)
      }))
      .sort((a, b) => b.dmg - a.dmg)[0];

    const dist = distanceBetween(attacker, best.def);
    const inRange = dist <= 1.1 || attacker.engaged;

    if (best && best.dmg > 0 && inRange) {
      const casualtyDetails = applyDamage(best.def, best.dmg, casualties);
      total += best.dmg;
      actions?.push({
        attackerId: attacker.unit.id,
        attackerName: attacker.unit.name,
        defenderId: best.def.unit.id,
        defenderName: best.def.unit.name,
        damage: best.dmg,
        phase: 'melee',
        weaponName: 'Melee',
        distance: dist,
        modelsKilled: casualtyDetails.modelsKilled,
        damagePerModel: casualtyDetails.damagePerModel,
        remainingWounds: casualtyDetails.remainingWoundsOnDamagedModel,
        totalModelsInUnit: casualtyDetails.totalModelsInUnit
      });

      if (best.def.remainingModels <= 0) {
        const idx = defenders.indexOf(best.def);
        if (idx >= 0) defenders.splice(idx, 1);
      }
    }
  }

  return total;
}

function expectedMeleeDamage(attacker: UnitState, defenderToughness: number, includeOneTimeWeapons: boolean): number {
  return calculateUnitDamage(
    attacker.unit,
    defenderToughness,
    false,
    undefined,
    includeOneTimeWeapons,
    true,
    [],
    1,
    true // treat as charging to favor melee-first units
  ).melee;
}

function totalWoundsForUnit(u: UnitState): number {
  const perModel = parseInt(u.unit.stats.wounds || '1', 10) || 1;
  const totalModels = u.modelPositions.length || getUnitModelCount(u.unit);
  return perModel * totalModels;
}

function snapshotUnit(u: UnitState) {
  return {
    unitId: u.unit.id,
    name: u.unit.name,
    x: u.position.x,
    y: u.position.y,
    remaining: u.remainingModels,
    engaged: !!u.engaged,
    role: u.roleLabel || u.role.primary,
    remainingWounds: Math.max(0, Math.round(u.remainingWounds)),
    totalWounds: totalWoundsForUnit(u),
    baseSizeMM: u.baseSizeMM,
    baseSizeInches: u.baseSizeInches,
    baseRadius: unitCollisionRadius(u),
    models: u.modelPositions.map((pos, idx) => ({
      index: idx,
      x: pos.x,
      y: pos.y,
      alive: pos.alive
    }))
  };
}

function snapshotPositions(stateA: ArmyState, stateB: ArmyState) {
  return {
    armyA: stateA.units.map(snapshotUnit),
    armyB: stateB.units.map(snapshotUnit)
  };
}

function snapshotState(stateA: ArmyState, stateB: ArmyState) {
  return {
    armyA: stateA.units.map(snapshotUnit),
    armyB: stateB.units.map(snapshotUnit)
  };
}

function performCharges(stateA: ArmyState, stateB: ArmyState, randomCharge: boolean): void {
  const ENGAGE_RANGE = 1.0;
  const rollCharge = () => randomCharge ? Math.floor(Math.random() * 6 + 1) + Math.floor(Math.random() * 6 + 1) : 7;

  const attemptCharge = (attacker: UnitState, targets: UnitState[]) => {
    if (attacker.remainingModels <= 0) return;
    const targetsAlive = targets.filter(t => t.remainingModels > 0);
    if (!targetsAlive.length) return;
    // Closest target
    targetsAlive.sort((a, b) => distanceBetween(attacker, a) - distanceBetween(attacker, b));
    const target = targetsAlive[0];
    const dist = distanceBetween(attacker, target);
    if (dist <= ENGAGE_RANGE) {
      attacker.engaged = true;
      target.engaged = true;
      return;
    }
    const chargeReach = rollCharge();
    if (dist > chargeReach) return; // failed charge
    const dx = target.position.x - attacker.position.x;
    const dy = target.position.y - attacker.position.y;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    const moveDist = Math.min(chargeReach, dist - ENGAGE_RANGE);
    const moveX = (dx / len) * moveDist;
    const moveY = (dy / len) * moveDist;
    attacker.position.x += moveX;
    attacker.position.y += moveY;
    shiftModelPositions(attacker, moveX, moveY);
    const newDist = distanceBetween(attacker, target);
    if (newDist <= ENGAGE_RANGE) {
      attacker.engaged = true;
      target.engaged = true;
    }
  };

  stateA.units.forEach(a => {
    if (a.role.primary === 'melee-missile') {
      attemptCharge(a, stateB.units);
    }
  });
  stateB.units.forEach(b => {
    if (b.role.primary === 'melee-missile') {
      attemptCharge(b, stateA.units);
    }
  });
}
