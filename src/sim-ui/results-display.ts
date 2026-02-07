/**
 * Results and statistics display for battle simulator
 */

import type { SimulationResult, ArmyState } from '../simulation';

export function renderBattleLog(result: SimulationResult, phaseIndex: number, armyALabel: string, armyBLabel: string): string {
  // Use tabbed interface for better readability
  return renderBattleLogTabs(result, phaseIndex, armyALabel, armyBLabel);
}

export function renderBattleLogTabs(result: SimulationResult, phaseIndex: number, armyALabel: string, armyBLabel: string): string {
  const totalPhases = result.logs.length;
  if (totalPhases === 0) return '<p class="text-muted">No battle log entries</p>';

  const logEntries = result.logs.map((log, index) => ({ log, index }));
  const activeTabs = phaseIndex >= 0
    ? logEntries.slice(0, Math.min(totalPhases, phaseIndex + 1))
    : logEntries;

  const formatPhaseHeader = (log: typeof result.logs[number]) => {
    const playerLabel = log.actor === 'armyA' ? armyALabel : armyBLabel;
    return `Round ${log.turn} · ${playerLabel} · ${log.phase}`;
  };

  const describeMovement = (detail: {
    unitName?: string;
    distance: number;
    to: { x: number; y: number };
    advanced: boolean;
    chargeTarget?: string;
    chargeRoll?: number;
    chargeDistanceNeeded?: number;
    chargeSuccess?: boolean;
    chargeBlocked?: boolean;
  }) => {
    const name = detail.unitName || 'Unit';

    // Handle charge-specific descriptions
    if (detail.chargeTarget !== undefined) {
      const neededText = detail.chargeDistanceNeeded ? `, needed ${detail.chargeDistanceNeeded.toFixed(1)}"` : '';
      if (detail.chargeBlocked) {
        return `❌ ${name} → ${detail.chargeTarget} BLOCKED (terrain)`;
      }
      if (detail.chargeSuccess === false) {
        const rollText = detail.chargeRoll ? `rolled ${detail.chargeRoll}` : '';
        return `❌ ${name} → ${detail.chargeTarget} FAILED (${rollText}${neededText})`;
      }
      if (detail.chargeSuccess === true) {
        const rollText = detail.chargeRoll ? `rolled ${detail.chargeRoll}` : '';
        return `✅ ${name} → ${detail.chargeTarget} (${rollText}${neededText}, moved ${detail.distance.toFixed(1)}")`;
      }
    }

    // Normal movement
    const verb = detail.advanced ? 'advances' : 'moves';
    return `${name} ${verb} ${detail.distance.toFixed(1)}" to (${detail.to.x.toFixed(1)}, ${detail.to.y.toFixed(1)})`;
  };

  const renderObjectiveStates = (
    states: typeof result.logs[number]['objectiveStates'],
    aLabel: string,
    bLabel: string
  ) => {
    if (!states || !states.length) return '';
    const items = states.map(state => {
      const controller = state.controlledBy === 'armyA' ? aLabel : state.controlledBy === 'armyB' ? bLabel : 'Contested';
      const holdProgress = state.controlledBy === 'armyA' ? state.heldByA : state.controlledBy === 'armyB' ? state.heldByB : 0;
      const roundsNeeded = Math.max(0, state.holdNeeded - holdProgress);
      const readyText = state.readyFor
        ? `ready +${state.baseVp}VP for ${state.readyFor === 'armyA' ? aLabel : bLabel}`
        : state.controlledBy === 'contested'
          ? '0VP (contested)'
          : state.holdNeeded > 0
            ? `+${state.baseVp}VP in ${roundsNeeded}r`
            : '0VP';
      const holdText = state.holdNeeded > 0
        ? `hold ${holdProgress}/${state.holdNeeded}`
        : 'scores immediately';
      const badge = state.priority === 'primary' ? '★' : '⬢';
      return `<li class="sim-objective-item">${badge} <strong>${state.name}</strong> (${state.priority}) — ${controller}; ${holdText}; ${readyText}</li>`;
    }).join('');
    return `<div class="mb-2"><em>Objectives:</em><ul class="sim-objective-list mb-1 ps-3">${items}</ul></div>`;
  };

  const renderMovementDetails = (details?: { unitId: string; unitName: string; from: { x: number; y: number }; to: { x: number; y: number }; distance: number; advanced: boolean; army: 'armyA' | 'armyB'; modelMovements?: any[] }[]) => {
    if (!details || !details.length) return '';
    const items = details.map(detail => {
      const label = describeMovement(detail);
      const modelMoves = detail.modelMovements ? JSON.stringify(detail.modelMovements) : '';
      return `<li class="sim-move-item"><span class="sim-move-entry" role="button" tabindex="0" data-unit-id="${detail.unitId}" data-army="${detail.army}" data-from-x="${detail.from.x.toFixed(2)}" data-from-y="${detail.from.y.toFixed(2)}" data-to-x="${detail.to.x.toFixed(2)}" data-to-y="${detail.to.y.toFixed(2)}" data-model-movements='${modelMoves}'>${label}</span></li>`;
    }).join('');
    return `<ul class="sim-movement-list mb-1 ps-3">${items}</ul>`;
  };

  // Helper to get unit positions and armies for attacks
  const timelineByPhase = new Map<number, any>();
  result.positionsTimeline?.forEach(entry => {
    timelineByPhase.set(entry.phaseIndex, entry);
  });

  const armyByUnitId = new Map<string, 'armyA' | 'armyB'>();
  result.armyAState.units.forEach(u => armyByUnitId.set(u.unit.id, 'armyA'));
  result.armyBState.units.forEach(u => armyByUnitId.set(u.unit.id, 'armyB'));

  const findUnitPosition = (phaseIndexValue: number, unitId: string, armyHint?: 'armyA' | 'armyB') => {
    const snapshot = timelineByPhase.get(phaseIndexValue);
    if (!snapshot) return null;
    const search = (list: typeof snapshot.armyA, army: 'armyA' | 'armyB') => {
      const unit = list.find((u: any) => u.unitId === unitId);
      return unit ? { x: unit.x, y: unit.y, remaining: unit.remaining, army } : null;
    };
    if (armyHint) {
      const candidate = armyHint === 'armyA' ? search(snapshot.armyA, 'armyA') : search(snapshot.armyB, 'armyB');
      if (candidate) return candidate;
    }
    return search(snapshot.armyA, 'armyA') || search(snapshot.armyB, 'armyB');
  };

  const renderAttackDetails = (actions: typeof entry.log.actions, phaseIndex: number) => {
    if (!actions || !actions.length) return '';
    const items = actions.map(action => {
      const attackerArmy = armyByUnitId.get(action.attackerId);
      const defenderArmy = armyByUnitId.get(action.defenderId);
      const attackerPos = findUnitPosition(phaseIndex, action.attackerId, attackerArmy);
      const defenderPos = findUnitPosition(phaseIndex, action.defenderId, defenderArmy);

      const attr = (pos: ReturnType<typeof findUnitPosition>, prefix: 'attacker' | 'defender') => {
        if (!pos) return '';
        return `data-${prefix}-x="${pos.x.toFixed(2)}" data-${prefix}-y="${pos.y.toFixed(2)}" data-${prefix}-army="${pos.army}"`;
      };
      const dataAttrs = `${attr(attackerPos, 'attacker')} ${attr(defenderPos, 'defender')}`.trim();

      // Build comprehensive tooltip with damage breakdown
      const formatNum = (n: number) => Number.isInteger(n) ? n.toString() : n.toFixed(1);
      const tooltipLines: string[] = [];

      // Weapon info
      if (action.weaponName) {
        let weaponLine = `<strong>${action.weaponName}</strong>`;
        if (action.distance !== undefined) weaponLine += ` @ ${action.distance.toFixed(1)}"`;
        tooltipLines.push(weaponLine);
      }

      // Weapon characteristics
      const charParts: string[] = [];
      if (action.attacks !== undefined) charParts.push(`A:${formatNum(action.attacks)}`);
      if (action.skill) charParts.push(`Skill:${action.skill}`);
      if (action.strength) charParts.push(`S:${action.strength}`);
      if (action.ap) charParts.push(`AP:${action.ap}`);
      if (action.damageCharacteristic) charParts.push(`D:${action.damageCharacteristic}`);
      if (charParts.length > 0) tooltipLines.push(charParts.join(' '));

      // Target stats
      const targetParts: string[] = [];
      if (action.targetToughness) targetParts.push(`T:${action.targetToughness}`);
      if (action.targetSave) targetParts.push(`Sv:${action.targetSave}`);
      if (targetParts.length > 0) tooltipLines.push(`<strong>Target:</strong> ${targetParts.join(' ')}`);

      // Attack sequence results
      const resultParts: string[] = [];
      if (action.attacks !== undefined) resultParts.push(`${formatNum(action.attacks)} Attacks`);
      if (action.hits !== undefined) resultParts.push(`${formatNum(action.hits)} Hits`);
      if (action.wounds !== undefined) resultParts.push(`${formatNum(action.wounds)} Wounds`);
      if (action.failedSaves !== undefined) resultParts.push(`${formatNum(action.failedSaves)} Failed Saves`);
      if (resultParts.length > 0) tooltipLines.push(resultParts.join(' → '));

      // Weapon ability results
      const abilityParts: string[] = [];
      if (action.lethalHits !== undefined && action.lethalHits > 0) {
        abilityParts.push(`⚔️ ${formatNum(action.lethalHits)} Lethal Hits`);
      }
      if (action.sustainedHits !== undefined && action.sustainedHits > 0) {
        abilityParts.push(`➕ ${formatNum(action.sustainedHits)} Sustained Hits`);
      }
      if (action.devastatingWounds !== undefined && action.devastatingWounds > 0) {
        abilityParts.push(`💥 ${formatNum(action.devastatingWounds)} Devastating Wounds`);
      }
      if (abilityParts.length > 0) tooltipLines.push(abilityParts.join(', '));

      if (action.damage !== undefined) tooltipLines.push(`<strong>${formatNum(action.damage)} Total Damage</strong>`);
      if (action.mortalWounds !== undefined && action.mortalWounds > 0) tooltipLines.push(`💀 ${formatNum(action.mortalWounds)} Mortal Wounds`);

      const tooltipHtml = tooltipLines.length > 0
        ? `<span class="tooltip-content multiline">${tooltipLines.join('<br>')}</span>`
        : '';

      // Build casualty information for display
      const casualtyParts: string[] = [];
      if (action.modelsKilled !== undefined && action.modelsKilled > 0) {
        casualtyParts.push(`<span class="text-danger">💀 ${action.modelsKilled} killed</span>`);
      }
      // Only show damage per model if models were killed (otherwise it's confusing for partial damage)
      if (action.damagePerModel !== undefined && action.modelsKilled && action.modelsKilled > 0) {
        casualtyParts.push(`${formatNum(action.damagePerModel)} dmg/model`);
      }
      if (action.remainingWounds !== undefined && action.remainingWounds > 0) {
        casualtyParts.push(`<span class="text-warning">⚠️ ${formatNum(action.remainingWounds)}W remaining on damaged model</span>`);
      }
      if (action.totalModelsInUnit !== undefined) {
        casualtyParts.push(`(${action.totalModelsInUnit} models left)`);
      }
      const casualtyText = casualtyParts.length > 0 ? ` — ${casualtyParts.join(', ')}` : '';

      const label = `${action.attackerName} → ${action.defenderName}: ${formatNum(action.damage)} dmg${casualtyText}`;
      const wrapperClass = tooltipHtml ? 'has-tooltip' : '';
      return `<li class="sim-action-item"><span class="sim-action-entry ${wrapperClass}" role="button" tabindex="0" ${dataAttrs}>${label}${tooltipHtml}</span></li>`;
    }).join('');
    return `<ul class="sim-attack-list mb-1 ps-3">${items}</ul>`;
  };

  const sequentialLogs = activeTabs.map((entry, idx) => {
    const log = entry.log;
    const stats: string[] = [];
    if (typeof log.damageDealt === 'number') stats.push(`Damage ${log.damageDealt.toFixed(1)}`);
    if (typeof log.distanceAfter === 'number') stats.push(`Distance ${log.distanceAfter.toFixed(1)}"`);
    if (log.advancedUnits?.length) stats.push(`Advanced: ${log.advancedUnits.join(', ')}`);
    const statsText = stats.length ? `<div class="small text-muted mb-2">${stats.join(' | ')}</div>` : '';

    const casualtiesText = log.casualties?.length
      ? `<div class="mb-2"><em>Casualties:</em> ${log.casualties.map(c => `${c.unitName} -${c.modelsLost}`).join(', ')}</div>`
      : '';

    const movementList = (log.phase === 'movement' || log.phase === 'charge') ? renderMovementDetails(log.movementDetails) : '';
    const objectiveList = log.phase === 'command' ? renderObjectiveStates(log.objectiveStates, armyALabel, armyBLabel) : '';
    const attackList = (log.phase === 'shooting' || log.phase === 'melee') ? renderAttackDetails(log.actions, entry.index) : '';

    const description = `<div class="mb-2"><strong>${formatPhaseHeader(log)}</strong></div><p>${log.description}</p>`;

    const paneId = `log-pane-${entry.index}`;
    const tabId = `log-tab-${entry.index}`;
    const isActive = idx === activeTabs.length - 1;
    const icon = log.phase === 'movement' ? '🚀' : log.phase === 'shooting' ? '🎯' : log.phase === 'melee' ? '⚔️' : log.phase === 'charge' ? '💨' : log.phase === 'command' ? '📢' : '📋';
    const label = `${icon} R${log.turn} ${log.phase[0].toUpperCase()}`;

    return {
      header: `<li class="nav-item" role="presentation"><button class="nav-link ${isActive ? 'active' : ''}" id="${tabId}" data-bs-toggle="tab" data-bs-target="#${paneId}" type="button" role="tab" aria-controls="${paneId}" aria-selected="${isActive}">${label}</button></li>`,
      pane: `<div class="tab-pane fade ${isActive ? 'show active' : ''}" id="${paneId}" role="tabpanel" aria-labelledby="${tabId}">${description}${objectiveList}${statsText}${casualtiesText}${movementList}${attackList}</div>`
    };
  });

  const tabHeaders = sequentialLogs.map(entry => entry.header).join('');
  const tabPanes = sequentialLogs.map(entry => entry.pane).join('');

  return `<ul class="nav nav-tabs" role="tablist" style="border-bottom: 1px solid var(--divider); margin-bottom: 1rem; overflow-x: auto; flex-wrap: nowrap;">${tabHeaders}</ul><div class="tab-content">${tabPanes}</div>`;
}

export function renderActionLog(result: SimulationResult, phaseIndex: number, armyALabel: string, armyBLabel: string): string {
  const totalPhases = result.logs.length;
  const logEntries = result.logs.map((log, index) => ({ log, index }));

  const visibleEntries = phaseIndex >= 0
    ? logEntries.slice(0, Math.min(totalPhases, phaseIndex + 1))
    : logEntries;

  const timelineByPhase = new Map<number, any>();
  result.positionsTimeline?.forEach(entry => {
    timelineByPhase.set(entry.phaseIndex, entry);
  });

  const armyByUnitId = new Map<string, 'armyA' | 'armyB'>();
  result.armyAState.units.forEach(u => armyByUnitId.set(u.unit.id, 'armyA'));
  result.armyBState.units.forEach(u => armyByUnitId.set(u.unit.id, 'armyB'));

  const formatPhaseHeader = (log: typeof result.logs[number]) => {
    const playerLabel = log.actor === 'armyA' ? armyALabel : armyBLabel;
    return `Round ${log.turn} · ${playerLabel} · ${log.phase}`;
  };

  const findUnitPosition = (phaseIndexValue: number, unitId: string, armyHint?: 'armyA' | 'armyB') => {
    const snapshot = timelineByPhase.get(phaseIndexValue);
    if (!snapshot) return null;
    const search = (list: typeof snapshot.armyA, army: 'armyA' | 'armyB') => {
      const unit = list.find((u: any) => u.unitId === unitId);
      return unit ? { x: unit.x, y: unit.y, remaining: unit.remaining, army } : null;
    };
    if (armyHint) {
      const candidate = armyHint === 'armyA' ? search(snapshot.armyA, 'armyA') : search(snapshot.armyB, 'armyB');
      if (candidate) return candidate;
    }
    return search(snapshot.armyA, 'armyA') || search(snapshot.armyB, 'armyB');
  };

  const actionList = visibleEntries
    .filter(entry => entry.log.actions && entry.log.actions.length)
    .map(entry => {
      const header = formatPhaseHeader(entry.log);
      const actionHtml = (entry.log.actions || []).map(action => {
        const attackerArmy = armyByUnitId.get(action.attackerId);
        const defenderArmy = armyByUnitId.get(action.defenderId);
        const attackerPos = findUnitPosition(entry.index, action.attackerId, attackerArmy);
        const defenderPos = findUnitPosition(entry.index, action.defenderId, defenderArmy);
        const attr = (pos: ReturnType<typeof findUnitPosition>, prefix: 'attacker' | 'defender') => {
          if (!pos) return '';
          return `data-${prefix}-x="${pos.x.toFixed(2)}" data-${prefix}-y="${pos.y.toFixed(2)}" data-${prefix}-army="${pos.army}"`;
        };
        const dataAttrs = `${attr(attackerPos, 'attacker')} ${attr(defenderPos, 'defender')}`.trim();

        // Build comprehensive tooltip with damage breakdown
        const formatNum = (n: number) => Number.isInteger(n) ? n.toString() : n.toFixed(1);
        const tooltipLines: string[] = [];

        // Weapon info
        if (action.weaponName) {
          let weaponLine = `<strong>${action.weaponName}</strong>`;
          if (action.distance !== undefined) weaponLine += ` @ ${action.distance.toFixed(1)}"`;
          tooltipLines.push(weaponLine);
        }

        // Weapon characteristics
        const charParts: string[] = [];
        if (action.attacks !== undefined) charParts.push(`A:${formatNum(action.attacks)}`);
        if (action.skill) charParts.push(`Skill:${action.skill}`);
        if (action.strength) charParts.push(`S:${action.strength}`);
        if (action.ap) charParts.push(`AP:${action.ap}`);
        if (action.damageCharacteristic) charParts.push(`D:${action.damageCharacteristic}`);
        if (charParts.length > 0) tooltipLines.push(charParts.join(' '));

        // Target stats
        const targetParts: string[] = [];
        if (action.targetToughness) targetParts.push(`T:${action.targetToughness}`);
        if (action.targetSave) targetParts.push(`Sv:${action.targetSave}`);
        if (targetParts.length > 0) tooltipLines.push(`<strong>Target:</strong> ${targetParts.join(' ')}`);

        // Attack sequence results
        const resultParts: string[] = [];
        if (action.attacks !== undefined) resultParts.push(`${formatNum(action.attacks)} Attacks`);
        if (action.hits !== undefined) resultParts.push(`${formatNum(action.hits)} Hits`);
        if (action.wounds !== undefined) resultParts.push(`${formatNum(action.wounds)} Wounds`);
        if (action.failedSaves !== undefined) resultParts.push(`${formatNum(action.failedSaves)} Failed Saves`);
        if (resultParts.length > 0) tooltipLines.push(resultParts.join(' → '));

        // Weapon ability results
        const abilityParts: string[] = [];
        if (action.lethalHits !== undefined && action.lethalHits > 0) {
          abilityParts.push(`⚔️ ${formatNum(action.lethalHits)} Lethal Hits`);
        }
        if (action.sustainedHits !== undefined && action.sustainedHits > 0) {
          abilityParts.push(`➕ ${formatNum(action.sustainedHits)} Sustained Hits`);
        }
        if (action.devastatingWounds !== undefined && action.devastatingWounds > 0) {
          abilityParts.push(`💥 ${formatNum(action.devastatingWounds)} Devastating Wounds`);
        }
        if (abilityParts.length > 0) tooltipLines.push(abilityParts.join(', '));

        if (action.damage !== undefined) tooltipLines.push(`<strong>${formatNum(action.damage)} Total Damage</strong>`);
        if (action.mortalWounds !== undefined && action.mortalWounds > 0) tooltipLines.push(`💀 ${formatNum(action.mortalWounds)} Mortal Wounds`);

        const tooltipHtml = tooltipLines.length > 0
          ? `<span class="tooltip-content multiline">${tooltipLines.join('<br>')}</span>`
          : '';

        // Build casualty information for display
        const casualtyParts: string[] = [];
        if (action.modelsKilled !== undefined && action.modelsKilled > 0) {
          casualtyParts.push(`<span class="text-danger">💀 ${action.modelsKilled} killed</span>`);
        }
        // Only show damage per model if models were killed (otherwise it's confusing for partial damage)
        if (action.damagePerModel !== undefined && action.modelsKilled && action.modelsKilled > 0) {
          casualtyParts.push(`${formatNum(action.damagePerModel)} dmg/model`);
        }
        if (action.remainingWounds !== undefined && action.remainingWounds > 0) {
          casualtyParts.push(`<span class="text-warning">⚠️ ${formatNum(action.remainingWounds)}W remaining</span>`);
        }
        if (action.totalModelsInUnit !== undefined) {
          casualtyParts.push(`(${action.totalModelsInUnit} models left)`);
        }
        const casualtyText = casualtyParts.length > 0 ? ` — ${casualtyParts.join(', ')}` : '';

        const wrapperClass = tooltipHtml ? 'has-tooltip' : '';
        return `<div class="sim-action-entry ${wrapperClass}" role="button" tabindex="0" ${dataAttrs}>${action.attackerName} → ${action.defenderName}: ${formatNum(action.damage)} dmg${casualtyText}${tooltipHtml}</div>`;
      }).join('');
      return `<li><strong>${header}</strong>${actionHtml}</li>`;
    }).join('');

  return actionList ? `<h6 class="small fw-bold mb-1">Attacks</h6><ul class="small mb-2">${actionList}</ul>` : '';
}

export function renderBattleSummary(result: SimulationResult, armyALabel: string, armyBLabel: string): string {
  const winnerLabel = result.winner ? (result.winner === 'armyA' ? armyALabel : armyBLabel) : 'No decisive winner';
  const endReasonText = result.endReason === 'armyDestroyed'
    ? 'Engagement ended when an army was destroyed.'
    : 'Engagement ended after the round cap.';
  const outcomeText = result.winner
    ? `🏆 <strong>${winnerLabel}</strong> prevails!`
    : '🤝 The battle ends in a draw.';

  // Calculate reserves info from initial deployment
  const calculateReservesInfo = (armyState: typeof result.armyAState) => {
    const allUnits = armyState.units;
    const reservesUnits = allUnits.filter(u => u.inReserves || u.arrivedTurn);
    const deepStrikeUnits = reservesUnits.filter(u => u.reserveType === 'deep-strike');
    const strategicReservesUnits = reservesUnits.filter(u => u.reserveType === 'strategic-reserves');

    const totalPoints = armyState.army.pointsTotal || armyState.units.reduce((sum, u) => sum + (u.unit.points || 0), 0);
    const reservesPoints = reservesUnits.reduce((sum, u) => sum + (u.unit.points || 0), 0);
    const srPoints = strategicReservesUnits.reduce((sum, u) => sum + (u.unit.points || 0), 0);

    return {
      hasReserves: reservesUnits.length > 0,
      deepStrike: deepStrikeUnits.length,
      strategicReserves: strategicReservesUnits.length,
      totalReservesPoints: reservesPoints,
      srPoints: srPoints,
      totalPoints: totalPoints,
      reservesPercent: totalPoints > 0 ? (reservesPoints / totalPoints * 100) : 0,
      srPercent: totalPoints > 0 ? (srPoints / totalPoints * 100) : 0
    };
  };

  const reservesA = calculateReservesInfo(result.armyAState);
  const reservesB = calculateReservesInfo(result.armyBState);

  const formatArmyState = (
    summary: { survivors: number; totalUnits: number; damageDealt: number; damageTaken: number; victoryPoints?: number },
    reserves: ReturnType<typeof calculateReservesInfo>
  ) => {
    const reservesInfo = reserves.hasReserves
      ? `<div class="stat text-muted small">
          <strong>Reserves:</strong> ${reserves.deepStrike} Deep Strike, ${reserves.strategicReserves} Strategic Reserves
          (${reserves.totalReservesPoints.toFixed(0)} pts / ${reserves.reservesPercent.toFixed(1)}%)
          ${reserves.strategicReserves > 0 ? `<br/><span class="ms-3">SR: ${reserves.srPoints.toFixed(0)} pts / ${reserves.srPercent.toFixed(1)}% (max 25%)</span>` : ''}
        </div>`
      : '';

    const vpInfo = summary.victoryPoints !== undefined
      ? `<div class="stat"><strong>Victory Points:</strong> ${summary.victoryPoints}</div>`
      : '';

    return `
      ${vpInfo}
      <div class="stat"><strong>Survivors:</strong> ${summary.survivors}/${summary.totalUnits} units</div>
      <div class="stat"><strong>Damage Dealt:</strong> ${summary.damageDealt.toFixed(1)}</div>
      <div class="stat"><strong>Damage Taken:</strong> ${summary.damageTaken.toFixed(1)}</div>
      ${reservesInfo}
    `;
  };

  const armyAClass = result.winner === 'armyA' ? 'winner' : (result.winner === 'armyB' ? 'loser' : '');
  const armyBClass = result.winner === 'armyB' ? 'winner' : (result.winner === 'armyA' ? 'loser' : '');

  // Calculate final objective control
  const objectives = result.objectives || [];
  const objA = objectives.filter(o => o.controlledBy === 'armyA').length;
  const objB = objectives.filter(o => o.controlledBy === 'armyB').length;
  const objContested = objectives.filter(o => o.controlledBy === 'contested').length;

  const objectivesInfo = objectives.length > 0
    ? `<p class="mb-0 small mt-1"><strong>Final Objectives:</strong> ${armyALabel}: ${objA}, ${armyBLabel}: ${objB}, Contested: ${objContested}</p>`
    : '';

  return `
    <div class="summary-card ${armyAClass} mb-3">
      <h5 class="mb-2">${armyALabel}</h5>
      ${formatArmyState(result.summary.armyA, reservesA)}
    </div>
    <div class="summary-card ${armyBClass} mb-3">
      <h5 class="mb-2">${armyBLabel}</h5>
      ${formatArmyState(result.summary.armyB, reservesB)}
    </div>
    <div class="alert alert-info mb-0">
      <h6 class="mb-2">${outcomeText}</h6>
      <p class="mb-0 small">${endReasonText}</p>
      <p class="mb-0 small mt-1"><strong>Starting distance:</strong> ${result.startingDistance}" | <strong>Initiative:</strong> ${result.initiative === 'armyA' ? armyALabel : armyBLabel}</p>
      ${objectivesInfo}
    </div>
  `;
}

export function renderUnitStatesTable(result: SimulationResult, phaseIndex: number, armyALabel: string, armyBLabel: string): string {
  if (!result.positionsTimeline?.length) return '';
  const phaseIdx = phaseIndex >= 0 ? phaseIndex : result.positionsTimeline[result.positionsTimeline.length - 1]?.phaseIndex ?? 0;
  const snap = result.positionsTimeline.find(p => p.phaseIndex === phaseIdx)
    || result.positionsTimeline[result.positionsTimeline.length - 1];
  if (!snap) return '';

  const snapshotLog = result.logs[phaseIdx];
  const snapshotLabel = snapshotLog
    ? `Snapshot · Round ${snapshotLog.turn} · ${snapshotLog.actor === 'armyA' ? armyALabel : armyBLabel} · ${snapshotLog.phase}`
    : 'Snapshot of current board state';

  const armyTable = (
    label: string,
    list: { name: string; remaining: number; engaged: boolean; role?: string; remainingWounds?: number; totalWounds?: number; inReserves?: boolean; reserveType?: string; arrivedTurn?: number }[] = [],
    accent: 'primary' | 'danger'
  ) => `
    <div class="col-md-6">
      <div class="fw-semibold mb-1">${label}</div>
      <div class="table-responsive">
        <table class="table table-sm table-${accent} table-striped mb-0 unit-table">
          <thead>
            <tr><th>Unit</th><th>Role</th><th>Models</th><th>Wounds</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${list.map(u => {
    const dead = u.remaining <= 0;
    const rowClass = dead ? 'class="text-muted"' : '';
    const woundsText = typeof u.remainingWounds === 'number' && typeof u.totalWounds === 'number'
      ? `${Math.max(0, u.remainingWounds)}/${u.totalWounds}`
      : '—';

    // Determine status
    let statusText = '';
    let statusClass = '';
    if (u.inReserves) {
      const reserveLabel = u.reserveType === 'deep-strike' ? 'Deep Strike' : 'Strategic Reserves';
      statusText = `<span class="badge bg-warning text-dark" title="In Reserves">${reserveLabel}</span>`;
      statusClass = 'class="table-warning"';
    } else if (u.arrivedTurn !== undefined && u.arrivedTurn > 0) {
      const reserveLabel = u.reserveType === 'deep-strike' ? 'DS' : 'SR';
      statusText = `<span class="badge bg-info text-dark" title="Arrived from reserves turn ${u.arrivedTurn}">${reserveLabel} T${u.arrivedTurn}</span>`;
    } else if (u.engaged) {
      statusText = '<span class="badge bg-danger">Engaged</span>';
    } else {
      statusText = '<span class="text-success">Active</span>';
    }

    const finalRowClass = u.inReserves ? statusClass : rowClass;

    return `<tr ${finalRowClass}><td>${u.name || 'Unknown'}</td><td>${u.role || ''}</td><td>${u.remaining}</td><td>${woundsText}</td><td>${statusText}</td></tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return `
    <div class="mb-2 text-muted small">${snapshotLabel}</div>
    <div class="row">
      ${armyTable(armyALabel, snap.armyA, 'primary')}
      ${armyTable(armyBLabel, snap.armyB, 'danger')}
    </div>
  `;
}
