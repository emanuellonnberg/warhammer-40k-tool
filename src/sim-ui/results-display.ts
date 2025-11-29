/**
 * Results and statistics display for battle simulator
 */

import type { SimulationResult, ArmyState } from '../simulation';

export function renderBattleLog(result: SimulationResult, phaseIndex: number, armyALabel: string, armyBLabel: string): string {
  const totalPhases = result.logs.length;
  const logEntries = result.logs.map((log, index) => ({ log, index }));

  const visibleEntries = phaseIndex >= 0
    ? logEntries.slice(0, Math.min(totalPhases, phaseIndex + 1))
    : logEntries;

  const formatPhaseHeader = (log: typeof result.logs[number]) => {
    const playerLabel = log.actor === 'armyA' ? armyALabel : armyBLabel;
    return `Round ${log.turn} · ${playerLabel} · ${log.phase}`;
  };

  const describeMovement = (detail: { unitName?: string; distance: number; to: { x: number; y: number }; advanced: boolean }) => {
    const name = detail.unitName || 'Unit';
    const verb = detail.advanced ? 'advances' : 'moves';
    return `${name} ${verb} ${detail.distance.toFixed(1)}" to (${detail.to.x.toFixed(1)}, ${detail.to.y.toFixed(1)})`;
  };

  const renderMovementDetails = (details?: { unitId: string; unitName: string; from: { x: number; y: number }; to: { x: number; y: number }; distance: number; advanced: boolean; army: 'armyA' | 'armyB' }[]) => {
    if (!details || !details.length) return '';
    const items = details.map(detail => {
      const label = describeMovement(detail);
      return `<li class="sim-move-item"><span class="sim-move-entry" role="button" tabindex="0" data-unit-id="${detail.unitId}" data-army="${detail.army}" data-from-x="${detail.from.x.toFixed(2)}" data-from-y="${detail.from.y.toFixed(2)}" data-to-x="${detail.to.x.toFixed(2)}" data-to-y="${detail.to.y.toFixed(2)}">${label}</span></li>`;
    }).join('');
    return `<ul class="sim-movement-list mb-1 ps-3">${items}</ul>`;
  };

  const sequentialLogs = visibleEntries.map(entry => {
    const log = entry.log;
    const stats: string[] = [];
    if (typeof log.damageDealt === 'number') stats.push(`Damage ${log.damageDealt.toFixed(1)}`);
    if (typeof log.distanceAfter === 'number') stats.push(`Distance ${log.distanceAfter.toFixed(1)}"`);
    if (log.advancedUnits?.length) stats.push(`Advanced: ${log.advancedUnits.join(', ')}`);
    const statsText = stats.length ? ` | ${stats.join(' | ')}` : '';
    const casualtiesText = log.casualties?.length
      ? `<br><em>Casualties:</em> ${log.casualties.map(c => `${c.unitName} -${c.modelsLost}`).join(', ')}`
      : '';
    const movementList = log.phase === 'movement' ? renderMovementDetails(log.movementDetails) : '';
    return `<li><strong>${formatPhaseHeader(log)}</strong>: ${log.description}${statsText}${casualtiesText}${movementList}</li>`;
  }).join('');

  return `<ul>${sequentialLogs}</ul>`;
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
        return `<div class="sim-action-entry" role="button" tabindex="0" ${dataAttrs}>${action.attackerName} → ${action.defenderName}: ${action.damage.toFixed(1)} dmg</div>`;
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

  const formatArmyState = (summary: { survivors: number; totalUnits: number; damageDealt: number; damageTaken: number }) => {
    return `
      <div class="stat"><strong>Survivors:</strong> ${summary.survivors}/${summary.totalUnits} units</div>
      <div class="stat"><strong>Damage Dealt:</strong> ${summary.damageDealt.toFixed(1)}</div>
      <div class="stat"><strong>Damage Taken:</strong> ${summary.damageTaken.toFixed(1)}</div>
    `;
  };

  const armyAClass = result.winner === 'armyA' ? 'winner' : (result.winner === 'armyB' ? 'loser' : '');
  const armyBClass = result.winner === 'armyB' ? 'winner' : (result.winner === 'armyA' ? 'loser' : '');

  return `
    <div class="summary-card ${armyAClass} mb-3">
      <h5 class="mb-2">${armyALabel}</h5>
      ${formatArmyState(result.summary.armyA)}
    </div>
    <div class="summary-card ${armyBClass} mb-3">
      <h5 class="mb-2">${armyBLabel}</h5>
      ${formatArmyState(result.summary.armyB)}
    </div>
    <div class="alert alert-info mb-0">
      <h6 class="mb-2">${outcomeText}</h6>
      <p class="mb-0 small">${endReasonText}</p>
      <p class="mb-0 small mt-1"><strong>Starting distance:</strong> ${result.startingDistance}" | <strong>Initiative:</strong> ${result.initiative === 'armyA' ? armyALabel : armyBLabel}</p>
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
    list: { name: string; remaining: number; engaged: boolean; role?: string; remainingWounds?: number; totalWounds?: number }[] = [],
    accent: 'primary' | 'danger'
  ) => `
    <div class="col-md-6">
      <div class="fw-semibold mb-1">${label}</div>
      <div class="table-responsive">
        <table class="table table-sm table-${accent} table-striped mb-0 unit-table">
          <thead>
            <tr><th>Unit</th><th>Role</th><th>Models</th><th>Wounds</th><th>Engaged</th></tr>
          </thead>
          <tbody>
            ${list.map(u => {
              const dead = u.remaining <= 0;
              const rowClass = dead ? 'class="text-muted"' : '';
              const woundsText = typeof u.remainingWounds === 'number' && typeof u.totalWounds === 'number'
                ? `${Math.max(0, u.remainingWounds)}/${u.totalWounds}`
                : '—';
              return `<tr ${rowClass}><td>${u.name || 'Unknown'}</td><td>${u.role || ''}</td><td>${u.remaining}</td><td>${woundsText}</td><td>${u.engaged ? 'Yes' : 'No'}</td></tr>`;
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
