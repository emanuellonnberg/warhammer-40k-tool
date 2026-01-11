/**
 * Battle Simulator - Main entry point
 * Dedicated page for running tactical battle simulations
 */

import type { Army, AttachmentMap } from './types';
import type { SimulationResult } from './simulation';
import type { StrategyProfile } from './simulation/planner';
import type { MovementIntent } from './simulation/types';
import { runSimpleEngagement, pickStartingDistance } from './simulation';
import {
  loadAppState,
  saveAppState,
  saveCurrentArmy,
  saveOpponentArmy,
  saveBattleSimConfig,
  isComingFrom,
  returnToAnalyzer
} from './utils/app-state';
import { applyLeaderAttachments } from './utils/leader';
import { renderBattlefield, getScaleFactors, updateThreatRanges } from './sim-ui/battlefield-renderer';
import { renderBattleLog, renderBattleSummary, renderUnitStatesTable } from './sim-ui/results-display';

let armyA: Army | null = null;
let armyB: Army | null = null;
let leaderAttachmentsA: AttachmentMap = {};
let leaderAttachmentsB: AttachmentMap = {};
let lastSimResult: SimulationResult | null = null;
let currentPhaseIndex: number = -1;

// Threat range visualization state
let threatRangeOptions = {
  visible: false,
  showArmyA: true,
  showArmyB: true,
  showShooting: true,
  showCharge: true
};

/**
 * Get movement color based on army, intent, and whether it's an advance move.
 * Color scheme:
 * - Normal move: Army base color (blue/red)
 * - Advance: Bright gold/orange (standout - high visibility)
 * - Charge: Magenta/purple (aggressive)
 * - Backstep/retreat: Cyan (defensive)
 * - Flank: Green variants (tactical positioning)
 * - Hold: Dim gray (no movement)
 */
function getMovementColor(army: 'armyA' | 'armyB', intent?: MovementIntent, advanced?: boolean): string {
  // Advance moves get priority coloring (bright, easy to spot)
  if (advanced) {
    return '#ffa500'; // Orange for advance moves
  }

  // Intent-based coloring
  switch (intent) {
    case 'charge':
      return '#e040fb'; // Magenta for charges
    case 'backstep':
      return '#00bcd4'; // Cyan for defensive retreats
    case 'flank-up':
    case 'flank-down':
      return '#4caf50'; // Green for flanking maneuvers
    case 'advance-obj':
    case 'advance-obj-partial':
      return '#8bc34a'; // Light green for objective movement
    case 'waypoint':
      return '#ff9800'; // Amber for pathfinding waypoints
    case 'hold':
      return '#9e9e9e'; // Gray for holding position
    default:
      // Default army colors for normal movement
      return army === 'armyB' ? '#d62728' : '#1f77b4';
  }
}

/**
 * Load army data from file or URL
 */
async function loadArmyData(file: File | string): Promise<Army> {
  let armyData: string;

  if (typeof file === 'string') {
    // Load from predefined file
    const response = await fetch(file);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    armyData = await response.text();
  } else {
    // Load from uploaded file
    armyData = await file.text();
  }

  const army: Army = JSON.parse(armyData);
  return army;
}

/**
 * Display army information
 */
function displayArmyInfo(army: Army, containerId: string): void {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`Container ${containerId} not found`);
    return;
  }

  if (!army || !army.units) {
    console.warn('Invalid army data', army);
    container.innerHTML = '<p>Invalid army data</p>';
    container.style.display = 'block';
    return;
  }

  const unitCount = army.units.length;

  // Calculate total points from units if army total is 0
  let points = army.pointsTotal || 0;
  if (points === 0 && army.units) {
    points = army.units.reduce((total, unit) => total + (unit.points || 0), 0);
  }

  // Get meaningful army name
  let displayName = army.armyName || 'Unknown Army';
  if (displayName === 'Unknown Army' && army.faction && army.faction !== 'Unknown') {
    displayName = army.faction;
  }

  container.innerHTML = `
    <h5>${displayName}</h5>
    <div class="stat"><i class="bi bi-shield-fill"></i> <strong>Faction:</strong> ${army.faction || 'Unknown'}</div>
    <div class="stat"><i class="bi bi-star-fill"></i> <strong>Points:</strong> ${points}</div>
    <div class="stat"><i class="bi bi-people-fill"></i> <strong>Units:</strong> ${unitCount}</div>
  `;
  container.style.display = 'block';
}

/**
 * Update battle matchup display
 */
function updateBattleMatchup(): void {
  const matchupEl = document.getElementById('battleMatchup');
  if (!matchupEl) return;

  const getDisplayName = (army: Army): string => {
    if (army.armyName && army.armyName !== 'Unknown Army') {
      return army.armyName;
    }
    if (army.faction && army.faction !== 'Unknown') {
      return army.faction;
    }
    return 'Unknown Army';
  };

  if (armyA && armyB) {
    const armyAName = getDisplayName(armyA);
    const armyBName = getDisplayName(armyB);
    matchupEl.textContent = `${armyAName} vs ${armyBName}`;
  } else if (armyA) {
    matchupEl.textContent = `${getDisplayName(armyA)} - Select opponent`;
  } else {
    matchupEl.textContent = 'Load armies to begin';
  }
}

/**
 * Update auto distance display
 */
function updateAutoDistance(): void {
  const autoDistanceEl = document.getElementById('autoDistanceText');
  const manualInput = document.getElementById('startingDistance') as HTMLInputElement;
  if (!autoDistanceEl || !manualInput) return;

  if (armyA && armyB) {
    const autoDistance = pickStartingDistance(armyA, armyB);
    const manual = parseFloat(manualInput.value);

    if (!isNaN(manual) && manual > 0) {
      autoDistanceEl.textContent = `Using manual: ${manual}" (auto would be ${autoDistance}")`;
    } else {
      autoDistanceEl.textContent = `Auto: ${autoDistance}" based on army size`;
    }
  } else {
    autoDistanceEl.textContent = 'Auto: calculated from army size';
  }
}

/**
 * Run battle simulation
 */
function runBattle(): void {
  if (!armyA || !armyB) {
    alert('Please load both armies before running simulation');
    return;
  }

  // Get configuration
  const startingDistanceInput = document.getElementById('startingDistance') as HTMLInputElement;
  const initiativeSelect = document.getElementById('initiative') as HTMLSelectElement;
  const maxRoundsInput = document.getElementById('maxRounds') as HTMLInputElement;
  const includeOneTimeInput = document.getElementById('includeOneTimeWeapons') as HTMLInputElement;
  const allowAdvanceInput = document.getElementById('allowAdvance') as HTMLInputElement;
  const randomChargeInput = document.getElementById('randomCharge') as HTMLInputElement;
  const useDiceRollsInput = document.getElementById('useDiceRolls') as HTMLInputElement;
  const plannerStrategySelect = document.getElementById('plannerStrategy') as HTMLSelectElement;
  const useAdaptiveStrategyInput = document.getElementById('useAdaptiveStrategy') as HTMLInputElement;
  const useBeamSearchInput = document.getElementById('useBeamSearch') as HTMLInputElement;
  const beamWidthInput = document.getElementById('beamWidth') as HTMLInputElement;
  const missionScoringSelect = document.getElementById('missionScoring') as HTMLSelectElement;

  const manualDistance = parseFloat(startingDistanceInput.value);
  const startingDistance = !isNaN(manualDistance) && manualDistance > 0
    ? manualDistance
    : pickStartingDistance(armyA, armyB);

  const config = {
    startingDistance,
    initiative: initiativeSelect.value as 'armyA' | 'armyB',
    maxRounds: parseInt(maxRoundsInput.value) || 5,
    includeOneTimeWeapons: includeOneTimeInput.checked,
    allowAdvance: allowAdvanceInput.checked,
    randomCharge: randomChargeInput.checked,
    useDiceRolls: useDiceRollsInput.checked,
    strategyProfile: (plannerStrategySelect?.value as StrategyProfile) || 'greedy',
    useAdaptiveStrategy: useAdaptiveStrategyInput?.checked ?? false,
    useBeamSearch: useBeamSearchInput?.checked ?? false,
    beamWidth: parseInt(beamWidthInput?.value || '3', 10) || 3,
    missionScoring: (missionScoringSelect?.value as 'matched-play' | 'hold-2' | 'high-stakes') || 'matched-play'
  };

  // Save config
  saveBattleSimConfig(config);

  // Apply leader attachments before simulation
  const armyAWithLeaders = applyLeaderAttachments(armyA, leaderAttachmentsA);
  const armyBWithLeaders = applyLeaderAttachments(armyB, leaderAttachmentsB);

  // Run simulation
  try {
    lastSimResult = runSimpleEngagement(armyAWithLeaders, armyBWithLeaders, config);
    currentPhaseIndex = 0;
    renderSimulationResult();
  } catch (error) {
    console.error('Simulation error:', error);
    alert('An error occurred during simulation. Check console for details.');
  }
}

/**
 * Render simulation results
 */
function renderSimulationResult(): void {
  if (!lastSimResult || !armyA || !armyB) return;

  const resultsSection = document.getElementById('resultsSection');
  if (!resultsSection) return;

  resultsSection.style.display = 'block';

  // Get meaningful army labels (handle "Unknown Army" case)
  const getArmyLabel = (army: Army, defaultLabel: string): string => {
    if (army.armyName && army.armyName !== 'Unknown Army') {
      return army.armyName;
    }
    if (army.faction && army.faction !== 'Unknown') {
      // Calculate points from units if army total is 0
      let points = army.pointsTotal || 0;
      if (points === 0 && army.units) {
        points = army.units.reduce((total, unit) => total + (unit.points || 0), 0);
      }
      return `${army.faction} (${points} pts)`;
    }
    return defaultLabel;
  };

  const armyALabel = getArmyLabel(armyA, 'Army A');
  const armyBLabel = getArmyLabel(armyB, 'Army B');

  // Render battlefield
  const battlefieldViz = document.getElementById('battlefieldVisualization');
  if (battlefieldViz) {
    battlefieldViz.innerHTML = renderBattlefield(lastSimResult, currentPhaseIndex);

    // Add threat range controls if not already present
    if (!document.getElementById('threatRangeControls')) {
      const controlsHtml = `
        <div id="threatRangeControls" class="mt-2 d-flex flex-wrap gap-2 align-items-center" style="font-size: 0.85rem;">
          <button id="toggleThreatRanges" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-bullseye"></i> Threat Ranges
          </button>
          <div class="btn-group btn-group-sm" role="group" style="display: none;" id="threatRangeFilters">
            <button type="button" class="btn btn-outline-primary active" id="threatArmyA" title="Show Army A threats">A</button>
            <button type="button" class="btn btn-outline-danger active" id="threatArmyB" title="Show Army B threats">B</button>
            <button type="button" class="btn btn-outline-warning active" id="threatShooting" title="Show shooting ranges">🎯</button>
            <button type="button" class="btn btn-outline-info active" id="threatCharge" title="Show charge ranges">⚔️</button>
          </div>
        </div>
      `;
      battlefieldViz.insertAdjacentHTML('afterend', controlsHtml);
      setupThreatRangeControls();
    }
  }

  // Draw passive movement overlays for current movement phase (low opacity)
  const scales = getScaleFactors(lastSimResult);
  renderPhaseMovementOverlay(currentPhaseIndex, scales);

  // Update threat ranges if visible
  if (threatRangeOptions.visible && lastSimResult) {
    updateThreatRanges(lastSimResult, threatRangeOptions);
  }

  // Render unit states table
  const unitStatesTable = document.getElementById('unitStatesTable');
  if (unitStatesTable) {
    unitStatesTable.innerHTML = renderUnitStatesTable(lastSimResult, currentPhaseIndex, armyALabel, armyBLabel);
  }

  // Render battle log
  const battleLog = document.getElementById('battleLog');
  if (battleLog) {
    battleLog.innerHTML = renderBattleLog(lastSimResult, currentPhaseIndex, armyALabel, armyBLabel);
  }

  // Render summary
  const battleSummary = document.getElementById('battleSummary');
  if (battleSummary) {
    battleSummary.innerHTML = renderBattleSummary(lastSimResult, armyALabel, armyBLabel);
  }

  // Update phase indicator
  updatePhaseIndicator();

  // Setup interactive elements
  setupBattlefieldInteractions();

  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Update phase indicator text
 */
function updatePhaseIndicator(): void {
  if (!lastSimResult) return;

  const phaseIndicator = document.getElementById('phaseIndicator');
  if (!phaseIndicator) return;

  const totalPhases = lastSimResult.logs.length;

  if (currentPhaseIndex < 0) {
    phaseIndicator.textContent = `Showing all ${totalPhases} phases`;
  } else {
    const currentLog = lastSimResult.logs[Math.min(currentPhaseIndex, totalPhases - 1)];
    if (currentLog) {
      phaseIndicator.textContent = `Round ${currentLog.turn} · ${currentLog.actor === 'armyA' ? 'Army A' : 'Army B'} · ${currentLog.phase} (${currentPhaseIndex + 1}/${totalPhases})`;
    }
  }
}

/**
 * Setup threat range toggle controls
 */
function setupThreatRangeControls(): void {
  const toggleBtn = document.getElementById('toggleThreatRanges');
  const filtersDiv = document.getElementById('threatRangeFilters');

  if (toggleBtn && filtersDiv) {
    toggleBtn.addEventListener('click', () => {
      threatRangeOptions.visible = !threatRangeOptions.visible;
      toggleBtn.classList.toggle('active', threatRangeOptions.visible);

      // Show/hide filter buttons
      filtersDiv.style.display = threatRangeOptions.visible ? 'flex' : 'none';

      if (lastSimResult) {
        updateThreatRanges(lastSimResult, threatRangeOptions);
      }
    });
  }

  // Army A toggle
  const armyABtn = document.getElementById('threatArmyA');
  if (armyABtn) {
    armyABtn.addEventListener('click', () => {
      threatRangeOptions.showArmyA = !threatRangeOptions.showArmyA;
      armyABtn.classList.toggle('active', threatRangeOptions.showArmyA);
      if (lastSimResult && threatRangeOptions.visible) {
        updateThreatRanges(lastSimResult, threatRangeOptions);
      }
    });
  }

  // Army B toggle
  const armyBBtn = document.getElementById('threatArmyB');
  if (armyBBtn) {
    armyBBtn.addEventListener('click', () => {
      threatRangeOptions.showArmyB = !threatRangeOptions.showArmyB;
      armyBBtn.classList.toggle('active', threatRangeOptions.showArmyB);
      if (lastSimResult && threatRangeOptions.visible) {
        updateThreatRanges(lastSimResult, threatRangeOptions);
      }
    });
  }

  // Shooting toggle
  const shootingBtn = document.getElementById('threatShooting');
  if (shootingBtn) {
    shootingBtn.addEventListener('click', () => {
      threatRangeOptions.showShooting = !threatRangeOptions.showShooting;
      shootingBtn.classList.toggle('active', threatRangeOptions.showShooting);
      if (lastSimResult && threatRangeOptions.visible) {
        updateThreatRanges(lastSimResult, threatRangeOptions);
      }
    });
  }

  // Charge toggle
  const chargeBtn = document.getElementById('threatCharge');
  if (chargeBtn) {
    chargeBtn.addEventListener('click', () => {
      threatRangeOptions.showCharge = !threatRangeOptions.showCharge;
      chargeBtn.classList.toggle('active', threatRangeOptions.showCharge);
      if (lastSimResult && threatRangeOptions.visible) {
        updateThreatRanges(lastSimResult, threatRangeOptions);
      }
    });
  }
}

/**
 * Setup battlefield interactions (tooltips, highlights)
 */
function setupBattlefieldInteractions(): void {
  if (!lastSimResult) return;

  const scales = getScaleFactors(lastSimResult);

  // Setup movement highlighting
  const movementEntries = document.querySelectorAll<HTMLElement>('.sim-move-entry');
  movementEntries.forEach(entry => {
    entry.addEventListener('mouseenter', () => {
      const { fromX, fromY, toX, toY, army, path: pathEncoded, intent, advanced } = entry.dataset;
      if (fromX && fromY && toX && toY && army) {
        // Parse path if present
        let path: { x: number; y: number }[] | undefined;
        if (pathEncoded) {
          try {
            path = JSON.parse(decodeURIComponent(pathEncoded));
          } catch {
            // Ignore parse errors, just use straight line
          }
        }
        highlightMovement({
          fromX: parseFloat(fromX),
          fromY: parseFloat(fromY),
          toX: parseFloat(toX),
          toY: parseFloat(toY),
          army: army as 'armyA' | 'armyB',
          path,
          intent: intent as MovementIntent | undefined,
          advanced: advanced === 'true'
        }, scales);
      }
    });
    entry.addEventListener('mouseleave', () => clearHighlights());
  });

  // Setup attack highlighting
  const actionEntries = document.querySelectorAll<HTMLElement>('.sim-action-entry');
  actionEntries.forEach(entry => {
    entry.addEventListener('mouseenter', () => {
      const { attackerX, attackerY, defenderX, defenderY, attackerArmy, defenderArmy } = entry.dataset;
      if (attackerX && attackerY && defenderX && defenderY && attackerArmy && defenderArmy) {
        highlightAttack({
          attackerX: parseFloat(attackerX),
          attackerY: parseFloat(attackerY),
          defenderX: parseFloat(defenderX),
          defenderY: parseFloat(defenderY),
          attackerArmy: attackerArmy as 'armyA' | 'armyB',
          defenderArmy: defenderArmy as 'armyA' | 'armyB'
        }, scales);
      }
    });
    entry.addEventListener('mouseleave', () => clearHighlights());
  });

  // Setup unit tooltips
  setupUnitTooltips();
}

/**
 * Highlight movement on battlefield (hover-driven)
 */
function highlightMovement(detail: { fromX: number; fromY: number; toX: number; toY: number; army: 'armyA' | 'armyB'; path?: { x: number; y: number }[]; intent?: MovementIntent; advanced?: boolean }, scales: ReturnType<typeof getScaleFactors>): void {
  const svg = document.getElementById('battlefieldSvg') as SVGSVGElement | null;
  const overlay = svg?.querySelector('#movementHighlight') as SVGGElement | null;
  if (!overlay) return;

  overlay.innerHTML = '';
  const color = getMovementColor(detail.army, detail.intent, detail.advanced);
  const ns = 'http://www.w3.org/2000/svg';

  // If we have a path with waypoints, render as polyline; otherwise straight line
  if (detail.path && detail.path.length > 2) {
    const polyline = document.createElementNS(ns, 'polyline');
    const points = detail.path.map(p =>
      `${scales.toSvgX(p.x).toFixed(1)},${scales.toSvgY(p.y).toFixed(1)}`
    ).join(' ');
    polyline.setAttribute('points', points);
    polyline.setAttribute('stroke', color);
    polyline.setAttribute('stroke-width', '3');
    polyline.setAttribute('stroke-dasharray', '6 3');
    polyline.setAttribute('opacity', '0.85');
    polyline.setAttribute('fill', 'none');
    overlay.appendChild(polyline);
  } else {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', scales.toSvgX(detail.fromX).toFixed(1));
    line.setAttribute('y1', scales.toSvgY(detail.fromY).toFixed(1));
    line.setAttribute('x2', scales.toSvgX(detail.toX).toFixed(1));
    line.setAttribute('y2', scales.toSvgY(detail.toY).toFixed(1));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-dasharray', '6 3');
    line.setAttribute('opacity', '0.85');
    overlay.appendChild(line);
  }

  const start = document.createElementNS(ns, 'circle');
  start.setAttribute('cx', scales.toSvgX(detail.fromX).toFixed(1));
  start.setAttribute('cy', scales.toSvgY(detail.fromY).toFixed(1));
  start.setAttribute('r', '6');
  start.setAttribute('fill', color);
  start.setAttribute('fill-opacity', '0.35');
  start.setAttribute('stroke', color);
  overlay.appendChild(start);

  const end = document.createElementNS(ns, 'circle');
  end.setAttribute('cx', scales.toSvgX(detail.toX).toFixed(1));
  end.setAttribute('cy', scales.toSvgY(detail.toY).toFixed(1));
  end.setAttribute('r', '7');
  end.setAttribute('fill', color);
  end.setAttribute('fill-opacity', '0.55');
  end.setAttribute('stroke', '#111');
  overlay.appendChild(end);
}

/**
 * Render passive movement paths for the current movement phase (low opacity)
 */
function renderPhaseMovementOverlay(phaseIndex: number, scales: ReturnType<typeof getScaleFactors>): void {
  if (!lastSimResult) return;
  const svg = document.getElementById('battlefieldSvg') as SVGSVGElement | null;
  const layer = svg?.querySelector('#movementPhasePaths') as SVGGElement | null;
  if (!layer) return;

  layer.innerHTML = '';
  if (phaseIndex < 0) return;

  const log = lastSimResult.logs[phaseIndex];
  if (!log || log.phase !== 'movement' || !log.movementDetails || !log.movementDetails.length) return;

  const ns = 'http://www.w3.org/2000/svg';
  log.movementDetails.forEach(detail => {
    // Skip zero-distance deployments/reserve placements so we don't draw artifacts from origin
    const dx = detail.to.x - detail.from.x;
    const dy = detail.to.y - detail.from.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 0.01) return;

    const color = getMovementColor(detail.army, detail.intent, detail.advanced);

    // If we have a path with waypoints, render as polyline; otherwise straight line
    if (detail.path && detail.path.length > 2) {
      const polyline = document.createElementNS(ns, 'polyline');
      const points = detail.path.map(p =>
        `${scales.toSvgX(p.x).toFixed(1)},${scales.toSvgY(p.y).toFixed(1)}`
      ).join(' ');
      polyline.setAttribute('points', points);
      polyline.setAttribute('stroke', color);
      polyline.setAttribute('stroke-width', '2');
      polyline.setAttribute('stroke-dasharray', '4 4');
      polyline.setAttribute('opacity', '0.25');
      polyline.setAttribute('fill', 'none');
      layer.appendChild(polyline);
    } else {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', scales.toSvgX(detail.from.x).toFixed(1));
      line.setAttribute('y1', scales.toSvgY(detail.from.y).toFixed(1));
      line.setAttribute('x2', scales.toSvgX(detail.to.x).toFixed(1));
      line.setAttribute('y2', scales.toSvgY(detail.to.y).toFixed(1));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '4 4');
      line.setAttribute('opacity', '0.25');
      layer.appendChild(line);
    }

    const start = document.createElementNS(ns, 'circle');
    start.setAttribute('cx', scales.toSvgX(detail.from.x).toFixed(1));
    start.setAttribute('cy', scales.toSvgY(detail.from.y).toFixed(1));
    start.setAttribute('r', '5');
    start.setAttribute('fill', color);
    start.setAttribute('fill-opacity', '0.15');
    start.setAttribute('stroke', color);
    start.setAttribute('stroke-opacity', '0.4');
    layer.appendChild(start);

    const end = document.createElementNS(ns, 'circle');
    end.setAttribute('cx', scales.toSvgX(detail.to.x).toFixed(1));
    end.setAttribute('cy', scales.toSvgY(detail.to.y).toFixed(1));
    end.setAttribute('r', '6');
    end.setAttribute('fill', color);
    end.setAttribute('fill-opacity', '0.3');
    end.setAttribute('stroke', '#111');
    end.setAttribute('stroke-opacity', '0.4');
    layer.appendChild(end);
  });
}

/**
 * Highlight attack on battlefield
 */
function highlightAttack(detail: { attackerX: number; attackerY: number; defenderX: number; defenderY: number; attackerArmy: 'armyA' | 'armyB'; defenderArmy: 'armyA' | 'armyB' }, scales: ReturnType<typeof getScaleFactors>): void {
  const svg = document.getElementById('battlefieldSvg') as SVGSVGElement | null;
  const overlay = svg?.querySelector('#attackHighlight') as SVGGElement | null;
  if (!overlay) return;

  overlay.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const attackerColor = detail.attackerArmy === 'armyB' ? '#d62728' : '#1f77b4';
  const defenderColor = detail.defenderArmy === 'armyB' ? '#d62728' : '#1f77b4';

  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', scales.toSvgX(detail.attackerX).toFixed(1));
  line.setAttribute('y1', scales.toSvgY(detail.attackerY).toFixed(1));
  line.setAttribute('x2', scales.toSvgX(detail.defenderX).toFixed(1));
  line.setAttribute('y2', scales.toSvgY(detail.defenderY).toFixed(1));
  line.setAttribute('stroke', '#111');
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-opacity', '0.7');
  line.setAttribute('stroke-dasharray', '4 3');
  overlay.appendChild(line);

  const makeMarker = (x: number, y: number, color: string) => {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', scales.toSvgX(x).toFixed(1));
    circle.setAttribute('cy', scales.toSvgY(y).toFixed(1));
    circle.setAttribute('r', '9');
    circle.setAttribute('fill', color);
    circle.setAttribute('fill-opacity', '0.35');
    circle.setAttribute('stroke', '#000');
    overlay.appendChild(circle);
  };

  makeMarker(detail.attackerX, detail.attackerY, attackerColor);
  makeMarker(detail.defenderX, detail.defenderY, defenderColor);
}

/**
 * Clear all highlights
 */
function clearHighlights(): void {
  const svg = document.getElementById('battlefieldSvg') as SVGSVGElement | null;
  const movementOverlay = svg?.querySelector('#movementHighlight') as SVGGElement | null;
  const attackOverlay = svg?.querySelector('#attackHighlight') as SVGGElement | null;
  if (movementOverlay) movementOverlay.innerHTML = '';
  if (attackOverlay) attackOverlay.innerHTML = '';
}

/**
 * Setup unit tooltips
 */
function setupUnitTooltips(): void {
  let tooltip: HTMLDivElement | null = null;

  const ensureTooltip = () => {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.style.position = 'absolute';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.padding = '4px 8px';
      tooltip.style.background = 'rgba(0,0,0,0.85)';
      tooltip.style.color = '#fff';
      tooltip.style.fontSize = '12px';
      tooltip.style.borderRadius = '4px';
      tooltip.style.zIndex = '9999';
      tooltip.style.display = 'none';
      document.body.appendChild(tooltip);
    }
    return tooltip;
  };

  const formatTooltip = (target: Element) => {
    const name = target.getAttribute('data-name') || 'Unit';
    const role = target.getAttribute('data-role');
    const remaining = target.getAttribute('data-unit-remaining');
    const total = target.getAttribute('data-unit-total');
    const alive = target.getAttribute('data-model-alive');

    const parts = [name];
    if (role) parts.push(`(${role})`);
    if (remaining && total) parts.push(`${remaining}/${total} models`);
    if (alive === 'false') parts.push('DESTROYED');

    return parts.join(' ');
  };

  const unitDots = document.querySelectorAll<SVGElement>('.sim-unit-dot[data-name]');
  unitDots.forEach(dot => {
    dot.addEventListener('mouseenter', (evt) => {
      const tip = ensureTooltip();
      tip.textContent = formatTooltip(dot);
      tip.style.display = 'block';
      const mouseEvt = evt as MouseEvent;
      tip.style.left = `${mouseEvt.clientX + 12 + window.scrollX}px`;
      tip.style.top = `${mouseEvt.clientY + 12 + window.scrollY}px`;
    });
    dot.addEventListener('mousemove', (evt) => {
      const tip = ensureTooltip();
      const mouseEvt = evt as MouseEvent;
      tip.style.left = `${mouseEvt.clientX + 12 + window.scrollX}px`;
      tip.style.top = `${mouseEvt.clientY + 12 + window.scrollY}px`;
    });
    dot.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.style.display = 'none';
    });
  });
}

/**
 * Main initialization
 */
async function main() {
  try {
    // Load app state
    const state = loadAppState();

    // Get UI elements
    const armyASelect = document.getElementById('armyASelect') as HTMLSelectElement;
    const armyBSelect = document.getElementById('armyBSelect') as HTMLSelectElement;
    const dropZoneA = document.getElementById('dropZoneA');
    const dropZoneB = document.getElementById('dropZoneB');
    const fileInputA = document.getElementById('fileInputA') as HTMLInputElement;
    const fileInputB = document.getElementById('fileInputB') as HTMLInputElement;
    const startingDistanceInput = document.getElementById('startingDistance') as HTMLInputElement;
    const runSimButton = document.getElementById('runSimButton');
    const prevPhaseBtn = document.getElementById('prevPhaseBtn');
    const nextPhaseBtn = document.getElementById('nextPhaseBtn');
    const showAllBtn = document.getElementById('showAllBtn');
    const rerunSimBtn = document.getElementById('rerunSimBtn');
    const plannerStrategySelect = document.getElementById('plannerStrategy') as HTMLSelectElement;
    const useBeamSearchInput = document.getElementById('useBeamSearch') as HTMLInputElement;
    const beamWidthInput = document.getElementById('beamWidth') as HTMLInputElement;

    // Load armies from state if available
    if (state.currentArmy) {
      armyA = state.currentArmy;
      leaderAttachmentsA = state.leaderAttachments || {};
      displayArmyInfo(armyA, 'armyAInfo');
      // Note: dropdown value will remain at default since we loaded from state
    }

    if (state.opponentArmy) {
      armyB = state.opponentArmy;
      leaderAttachmentsB = state.opponentAttachments || {};
      displayArmyInfo(armyB, 'armyBInfo');
      // Note: dropdown value will remain at default since we loaded from state
    }

    // Apply saved config
    if (state.battleSimConfig) {
      const config = state.battleSimConfig;
      const initiativeSelect = document.getElementById('initiative') as HTMLSelectElement;
      const maxRoundsInput = document.getElementById('maxRounds') as HTMLInputElement;
      const includeOneTimeInput = document.getElementById('includeOneTimeWeapons') as HTMLInputElement;
      const allowAdvanceInput = document.getElementById('allowAdvance') as HTMLInputElement;
      const randomChargeInput = document.getElementById('randomCharge') as HTMLInputElement;
      const useDiceRollsInput = document.getElementById('useDiceRolls') as HTMLInputElement;
      const useAdaptiveStrategyInput = document.getElementById('useAdaptiveStrategy') as HTMLInputElement;

      if (initiativeSelect) initiativeSelect.value = config.initiative;
      if (maxRoundsInput && config.maxRounds) maxRoundsInput.value = config.maxRounds.toString();
      if (includeOneTimeInput) includeOneTimeInput.checked = config.includeOneTimeWeapons ?? false;
      if (allowAdvanceInput) allowAdvanceInput.checked = config.allowAdvance;
      if (randomChargeInput) randomChargeInput.checked = config.randomCharge;
      if (useDiceRollsInput) useDiceRollsInput.checked = config.useDiceRolls ?? false;
      if (plannerStrategySelect && config.strategyProfile) plannerStrategySelect.value = config.strategyProfile;
      if (useAdaptiveStrategyInput && typeof config.useAdaptiveStrategy === 'boolean') useAdaptiveStrategyInput.checked = config.useAdaptiveStrategy;
      if (useBeamSearchInput && typeof config.useBeamSearch === 'boolean') useBeamSearchInput.checked = config.useBeamSearch;
      if (beamWidthInput && config.beamWidth) beamWidthInput.value = config.beamWidth.toString();
      if (startingDistanceInput && config.startingDistance) startingDistanceInput.value = config.startingDistance.toString();
      const missionScoringSelect = document.getElementById('missionScoring') as HTMLSelectElement;
      if (missionScoringSelect && config.missionScoring) missionScoringSelect.value = config.missionScoring;
    }

    // Toggle beam width input based on checkbox
    const syncBeamWidthState = () => {
      if (!beamWidthInput || !useBeamSearchInput) return;
      beamWidthInput.disabled = !useBeamSearchInput.checked;
    };
    if (useBeamSearchInput && beamWidthInput) {
      useBeamSearchInput.addEventListener('change', syncBeamWidthState);
      syncBeamWidthState();
    }

    updateBattleMatchup();
    updateAutoDistance();

    // Army A select handler
    if (armyASelect) {
      armyASelect.addEventListener('change', async () => {
        if (!armyASelect.value) return;
        try {
          armyA = await loadArmyData(armyASelect.value);
          saveCurrentArmy(armyA);
          displayArmyInfo(armyA, 'armyAInfo');
          updateBattleMatchup();
          updateAutoDistance();
        } catch (error) {
          console.error('Error loading Army A:', error);
          alert('Failed to load Army A');
        }
      });
    }

    // Army B select handler
    if (armyBSelect) {
      armyBSelect.addEventListener('change', async () => {
        if (!armyBSelect.value) return;
        try {
          armyB = await loadArmyData(armyBSelect.value);
          saveOpponentArmy(armyB);
          displayArmyInfo(armyB, 'armyBInfo');
          updateBattleMatchup();
          updateAutoDistance();
        } catch (error) {
          console.error('Error loading Army B:', error);
          alert('Failed to load Army B');
        }
      });
    }

    // File upload handlers
    const setupFileUpload = (dropZone: HTMLElement | null, fileInput: HTMLInputElement, onLoad: (army: Army) => void) => {
      if (!dropZone) return;

      dropZone.addEventListener('click', () => fileInput.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          try {
            const army = await loadArmyData(files[0]);
            onLoad(army);
          } catch (error) {
            console.error('Error loading dropped file:', error);
            alert('Failed to load army file');
          }
        }
      });

      fileInput.addEventListener('change', async () => {
        const files = fileInput.files;
        if (files && files.length > 0) {
          try {
            const army = await loadArmyData(files[0]);
            onLoad(army);
          } catch (error) {
            console.error('Error loading selected file:', error);
            alert('Failed to load army file');
          }
        }
      });
    };

    setupFileUpload(dropZoneA, fileInputA, (army) => {
      armyA = army;
      saveCurrentArmy(armyA);
      displayArmyInfo(armyA, 'armyAInfo');
      updateBattleMatchup();
      updateAutoDistance();
    });

    setupFileUpload(dropZoneB, fileInputB, (army) => {
      armyB = army;
      saveOpponentArmy(armyB);
      displayArmyInfo(armyB, 'armyBInfo');
      updateBattleMatchup();
      updateAutoDistance();
    });

    // Distance input handler
    startingDistanceInput?.addEventListener('input', updateAutoDistance);

    // Run simulation button
    runSimButton?.addEventListener('click', runBattle);

    // Rerun button
    rerunSimBtn?.addEventListener('click', runBattle);

    // Phase navigation
    prevPhaseBtn?.addEventListener('click', () => {
      if (!lastSimResult) return;
      currentPhaseIndex = Math.max(0, currentPhaseIndex - 1);
      renderSimulationResult();
    });

    nextPhaseBtn?.addEventListener('click', () => {
      if (!lastSimResult) return;
      const maxIndex = lastSimResult.logs.length - 1;
      currentPhaseIndex = Math.min(maxIndex, currentPhaseIndex + 1);
      renderSimulationResult();
    });

    showAllBtn?.addEventListener('click', () => {
      if (!lastSimResult) return;
      currentPhaseIndex = -1;
      renderSimulationResult();
    });

    // Auto-run if coming from analyzer with both armies loaded
    if (isComingFrom('analyzer') && armyA && armyB) {
      runBattle();
    }
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Failed to initialize battle simulator');
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
