import type { Army, AttachmentMap, Unit, AttachedLeaderInfo, AttackModifiers } from '../types';

/**
 * Deep clone a unit to avoid mutating original data structures
 */
function cloneUnit(unit: Unit): Unit {
  const cloned = JSON.parse(JSON.stringify(unit)) as Unit;
  // Drop attachment metadata when cloning base units
  delete cloned.attachedLeaders;
  return cloned;
}

/**
 * Merge two arrays of string identifiers without duplicates
 */
function mergeStringLists(base?: string[], addition?: string[]): string[] | undefined {
  const merged = new Set<string>();
  base?.forEach(value => value && merged.add(value));
  addition?.forEach(value => value && merged.add(value));
  return merged.size > 0 ? Array.from(merged) : undefined;
}

/**
 * Merge linked weapons metadata from a leader into the host unit
 */
function mergeLinkedWeapons(
  hostLinked?: Unit['linked_weapons'],
  leaderLinked?: Unit['linked_weapons']
): Unit['linked_weapons'] | undefined {
  if (!hostLinked && !leaderLinked) {
    return undefined;
  }

  const merged = { ...(hostLinked || {}) };
  if (leaderLinked) {
    Object.entries(leaderLinked).forEach(([key, data]) => {
      merged[key] = {
        standard: data.standard ?? null,
        overcharge: data.overcharge ?? null,
        ...(merged[key] || {})
      };
    });
  }
  return merged;
}

/**
 * Merge unit reroll configurations, preferring host values when overlaps exist
 */
function mergeUnitRerolls(
  hostRerolls: Unit['unitRerolls'],
  leaderRerolls: Unit['unitRerolls']
): Unit['unitRerolls'] | undefined {
  if (!hostRerolls && !leaderRerolls) {
    return undefined;
  }
  return {
    ...leaderRerolls,
    ...hostRerolls
  };
}

function mergeAttackModifiers(
  hostModifiers: AttackModifiers | undefined,
  leaderModifiers: AttackModifiers | undefined
): AttackModifiers | undefined {
  if (!hostModifiers && !leaderModifiers) {
    return undefined;
  }
  const merged: AttackModifiers = { ...(leaderModifiers || {}), ...(hostModifiers || {}) };
  (['hit', 'wound'] as (keyof AttackModifiers)[]).forEach(key => {
    const hostValue = hostModifiers?.[key] || 0;
    const leaderValue = leaderModifiers?.[key] || 0;
    if (hostValue || leaderValue) {
      merged[key] = hostValue + leaderValue;
    }
  });
  return merged;
}

/**
 * Build the attached leader summary used by the UI
 */
function buildAttachedLeaderSummary(leader: Unit): AttachedLeaderInfo {
  return {
    id: leader.id,
    name: leader.name,
    points: leader.points,
    type: leader.type,
    stats: leader.stats,
    weapons: leader.weapons || [],
    rules: leader.rules,
    abilities: leader.abilities
  };
}

/**
 * Merge a leader unit into a host unit, returning a new unit instance
 */
export function mergeLeaderIntoUnit(host: Unit, leader: Unit): Unit {
  const mergedHost = cloneUnit(host);
  const leaderClone = cloneUnit(leader);

  mergedHost.points = (mergedHost.points || 0) + (leaderClone.points || 0);
  mergedHost.weapons = [
    ...(mergedHost.weapons || []),
    ...(leaderClone.weapons || [])
  ];

  mergedHost.rules = mergeStringLists(mergedHost.rules, leaderClone.rules);
  mergedHost.abilities = mergeStringLists(mergedHost.abilities, leaderClone.abilities);
  mergedHost.linked_weapons = mergeLinkedWeapons(mergedHost.linked_weapons, leaderClone.linked_weapons);
  mergedHost.unitRerolls = mergeUnitRerolls(mergedHost.unitRerolls, leaderClone.unitRerolls);
  if (leaderClone.leaderAuraRerolls) {
    mergedHost.unitRerolls = mergeUnitRerolls(mergedHost.unitRerolls, leaderClone.leaderAuraRerolls);
  }
  mergedHost.unitModifiers = mergeAttackModifiers(mergedHost.unitModifiers, leaderClone.unitModifiers);
  if (leaderClone.leaderAuraModifiers) {
    mergedHost.unitModifiers = mergeAttackModifiers(mergedHost.unitModifiers, leaderClone.leaderAuraModifiers);
  }

  const attachedLeaders = mergedHost.attachedLeaders ? [...mergedHost.attachedLeaders] : [];
  attachedLeaders.push(buildAttachedLeaderSummary(leaderClone));
  mergedHost.attachedLeaders = attachedLeaders;

  return mergedHost;
}

/**
 * Apply leader attachments to an army, returning a derived army for display
 */
export function applyLeaderAttachments(army: Army, attachments?: AttachmentMap): Army {
  if (!attachments || Object.keys(attachments).length === 0) {
    return army;
  }

  const attachmentEntries = Object.entries(attachments).filter(([, leaders]) => Array.isArray(leaders) && leaders.length > 0);
  if (attachmentEntries.length === 0) {
    return army;
  }

  const unitMap = new Map<string, Unit>();
  army.units.forEach(unit => {
    unitMap.set(unit.id, cloneUnit(unit));
  });

  const consumedLeaderIds = new Set<string>();
  const derivedUnits: Unit[] = [];

  army.units.forEach(originalUnit => {
    const unitId = originalUnit.id;

    if (consumedLeaderIds.has(unitId)) {
      // This unit has already been merged into another unit as a leader
      return;
    }

    let workingUnit = unitMap.get(unitId);
    if (!workingUnit) {
      return;
    }

    const leadersForUnit = attachments[unitId] || [];
    if (leadersForUnit.length > 0) {
      leadersForUnit.forEach(leaderId => {
        const leaderUnit = unitMap.get(leaderId);
        if (!leaderUnit || consumedLeaderIds.has(leaderId)) {
          return;
        }
        workingUnit = mergeLeaderIntoUnit(workingUnit as Unit, leaderUnit);
        consumedLeaderIds.add(leaderId);
      });
    }

    derivedUnits.push(workingUnit);
  });

  // Add any remaining units that were not processed (e.g., unattached leaders not in attachments map)
  army.units.forEach(originalUnit => {
    if (consumedLeaderIds.has(originalUnit.id)) {
      return;
    }
    if (derivedUnits.some(unit => unit.id === originalUnit.id)) {
      return;
    }
    const unitClone = unitMap.get(originalUnit.id);
    if (unitClone) {
      derivedUnits.push(unitClone);
    }
  });

  return {
    ...army,
    units: derivedUnits
  };
}

