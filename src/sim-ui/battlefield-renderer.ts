/**
 * SVG battlefield rendering for battle simulator
 */

import type { SimulationResult, TerrainFeature, ArmyState } from '../simulation';

const SIM_SVG_WIDTH = 800;
const SIM_SVG_HEIGHT = 400;
const SIM_SVG_PAD = 20;

/** Parse weapon range string to inches (e.g., "24\"" -> 24, "Melee" -> 0) */
function parseRange(rangeStr?: string): number {
  if (!rangeStr || rangeStr.toLowerCase() === 'melee') return 0;
  const match = rangeStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Calculate threat data for a unit */
interface UnitThreatData {
  unitId: string;
  unitName: string;
  x: number;
  y: number;
  army: 'armyA' | 'armyB';
  maxShootingRange: number;
  chargeRange: number; // movement + average charge (6")
  moveDistance: number;
  alive: boolean;
}

/** Extract threat data from army state */
function extractThreatData(
  armyState: ArmyState,
  armyTag: 'armyA' | 'armyB'
): UnitThreatData[] {
  return armyState.units.map(unit => {
    // Get max shooting range from all weapons
    const weapons = unit.unit.weapons || [];
    const maxShootingRange = weapons.reduce((max, w) => {
      const range = parseRange(w.characteristics?.range);
      return range > max ? range : max;
    }, 0);

    // Get movement distance
    const moveDistance = parseInt(unit.unit.stats?.move || '0', 10) || 0;

    // Charge threat = movement + average charge distance (2D6 avg = 7")
    const chargeRange = moveDistance + 7;

    return {
      unitId: unit.unit.id,
      unitName: unit.unit.name,
      x: unit.position.x,
      y: unit.position.y,
      army: armyTag,
      maxShootingRange,
      chargeRange,
      moveDistance,
      alive: unit.remainingModels > 0
    };
  });
}

/** Color palette for different terrain types */
const TERRAIN_COLORS: Record<string, { fill: string; stroke: string; opacity: number }> = {
  ruins: { fill: '#8b7355', stroke: '#5c4d3c', opacity: 0.6 },
  woods: { fill: '#228b22', stroke: '#006400', opacity: 0.5 },
  crater: { fill: '#4a4a4a', stroke: '#2d2d2d', opacity: 0.4 },
  barricade: { fill: '#6b6b6b', stroke: '#404040', opacity: 0.7 },
  building: { fill: '#8b7355', stroke: '#5c4d3c', opacity: 0.7 },
  container: { fill: '#4682b4', stroke: '#2f5577', opacity: 0.7 },
  hills: { fill: '#90a959', stroke: '#6b8040', opacity: 0.35 },
  debris: { fill: '#808080', stroke: '#505050', opacity: 0.4 },
  custom: { fill: '#9370db', stroke: '#6a5acd', opacity: 0.5 },
};

interface FlattenedModel {
  x: number;
  y: number;
  army: 'armyA' | 'armyB';
  alive: boolean;
  unitName: string;
  role?: string;
  remaining?: number;
  totalModels?: number;
  baseSizeMM?: number;
  fallbackRadius?: number;
  modelIndex?: number;
}

const BASE_SIZE_HINTS: { match: RegExp; radius: number }[] = [
  { match: /(knight|baneblade|lord of change|great unclean)/i, radius: 3.5 },
  { match: /(land raider|predator|hammerhead|riptide|wraithlord|wraithknight|castigator|monolith)/i, radius: 2.75 },
  { match: /(dread|crisis|terminator|broadside|redemptor|daemon prince|fiend|warglaive|helverin|brigand)/i, radius: 1.75 },
  { match: /(cavalry|biker|jetbike|skimmer|sunforge|stealth)/i, radius: 1.25 },
  { match: /(infantry|squad|team|sisters|cultist|pathfinder|gaunt|guardian|boyz|daemonette|nurgling)/i, radius: 1 }
];

function estimateBaseRadiusFromName(name?: string): number {
  if (!name) return 1;
  const lower = name.toLowerCase();
  for (const hint of BASE_SIZE_HINTS) {
    if (hint.match.test(lower)) return hint.radius;
  }
  return 1;
}

/**
 * Render terrain features as SVG elements
 */
function renderTerrainFeatures(
  terrain: TerrainFeature[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  scaleX: number,
  scaleY: number,
  escapeAttr: (s?: string) => string
): string {
  if (!terrain || terrain.length === 0) return '';

  return terrain.map(t => {
    const colors = TERRAIN_COLORS[t.type] || TERRAIN_COLORS.custom;
    const cx = sx(t.x);
    const cy = sy(t.y);

    // Build tooltip text
    const traits: string[] = [];
    if (t.traits.coverLight) traits.push('Light Cover');
    if (t.traits.coverHeavy) traits.push('Heavy Cover');
    if (t.traits.obscuring) traits.push('Obscuring');
    if (t.traits.denseCover) traits.push('Dense');
    if (t.traits.difficultGround) traits.push('Difficult Ground');
    if (t.traits.breachable) traits.push('Breachable');
    if (t.impassable) traits.push('Impassable');
    const tooltipText = `${t.name} (${t.type})${traits.length ? ': ' + traits.join(', ') : ''}`;

    // Shape rendering
    if (t.shape === 'circle') {
      const radius = (t.radius || t.width / 2) * ((scaleX + scaleY) / 2);
      return `
        <g class="terrain-feature" data-terrain-id="${escapeAttr(t.id)}" data-terrain-type="${t.type}">
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}"
            fill="${colors.fill}" fill-opacity="${colors.opacity}"
            stroke="${colors.stroke}" stroke-width="1.5" stroke-dasharray="4 2" />
          <title>${escapeAttr(tooltipText)}</title>
        </g>
      `;
    }

    if (t.shape === 'polygon' && t.vertices && t.vertices.length > 2) {
      const points = t.vertices
        .map(v => `${sx(t.x + v.x).toFixed(1)},${sy(t.y + v.y).toFixed(1)}`)
        .join(' ');
      return `
        <g class="terrain-feature" data-terrain-id="${escapeAttr(t.id)}" data-terrain-type="${t.type}">
          <polygon points="${points}"
            fill="${colors.fill}" fill-opacity="${colors.opacity}"
            stroke="${colors.stroke}" stroke-width="1.5" stroke-dasharray="4 2" />
          <title>${escapeAttr(tooltipText)}</title>
        </g>
      `;
    }

    // Default: rectangle
    const width = t.width * scaleX;
    const height = t.height * scaleY;
    const rx = cx - width / 2;
    const ry = cy - height / 2;

    // Add visual indicators for special terrain
    let extraElements = '';

    // Obscuring terrain gets diagonal lines pattern
    if (t.traits.obscuring) {
      const patternId = `pattern-${t.id}`;
      extraElements += `
        <defs>
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
            <line x1="0" y1="8" x2="8" y2="0" stroke="${colors.stroke}" stroke-width="0.5" opacity="0.5"/>
          </pattern>
        </defs>
        <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"
          fill="url(#${patternId})" />
      `;
    }

    // Impassable terrain gets a crossed pattern
    if (t.impassable) {
      extraElements += `
        <line x1="${rx.toFixed(1)}" y1="${ry.toFixed(1)}" x2="${(rx + width).toFixed(1)}" y2="${(ry + height).toFixed(1)}"
          stroke="${colors.stroke}" stroke-width="1" opacity="0.3" />
        <line x1="${(rx + width).toFixed(1)}" y1="${ry.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${(ry + height).toFixed(1)}"
          stroke="${colors.stroke}" stroke-width="1" opacity="0.3" />
      `;
    }

    return `
      <g class="terrain-feature" data-terrain-id="${escapeAttr(t.id)}" data-terrain-type="${t.type}">
        <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"
          fill="${colors.fill}" fill-opacity="${colors.opacity}"
          stroke="${colors.stroke}" stroke-width="1.5" stroke-dasharray="4 2" rx="2" />
        ${extraElements}
        <text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
          font-size="8" fill="${colors.stroke}" opacity="0.7">${t.type.charAt(0).toUpperCase()}</text>
        <title>${escapeAttr(tooltipText)}</title>
      </g>
    `;
  }).join('');
}

/**
 * Render threat range circles for units
 * Shows shooting range (solid) and charge threat range (dashed)
 */
function renderThreatRanges(
  threatData: UnitThreatData[],
  sx: (x: number) => number,
  sy: (y: number) => number,
  avgScale: number,
  showArmyA: boolean,
  showArmyB: boolean
): string {
  return threatData
    .filter(unit => unit.alive && ((unit.army === 'armyA' && showArmyA) || (unit.army === 'armyB' && showArmyB)))
    .map(unit => {
      const cx = sx(unit.x);
      const cy = sy(unit.y);
      const baseColor = unit.army === 'armyA' ? '#1f77b4' : '#d62728';
      const chargeColor = unit.army === 'armyA' ? '#ff7f0e' : '#ff6b6b';

      const elements: string[] = [];

      // Shooting range circle (filled, low opacity)
      if (unit.maxShootingRange > 0) {
        const shootRadius = unit.maxShootingRange * avgScale;
        elements.push(`
          <circle class="threat-shooting" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${shootRadius.toFixed(1)}"
            fill="${baseColor}" fill-opacity="0.08"
            stroke="${baseColor}" stroke-width="1" stroke-opacity="0.3" />
        `);
      }

      // Charge threat range circle (dashed outline only)
      if (unit.chargeRange > 0) {
        const chargeRadius = unit.chargeRange * avgScale;
        elements.push(`
          <circle class="threat-charge" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${chargeRadius.toFixed(1)}"
            fill="none"
            stroke="${chargeColor}" stroke-width="1.5" stroke-dasharray="4 3" stroke-opacity="0.5" />
        `);
      }

      // Tooltip with threat info
      const tooltip = `${unit.unitName}: Shooting ${unit.maxShootingRange}\\", Charge threat ${unit.chargeRange}\\" (Move ${unit.moveDistance}\\" + 7\\" avg charge)`;

      return `
        <g class="unit-threat-range" data-unit-id="${unit.unitId}" data-army="${unit.army}">
          ${elements.join('')}
          <title>${tooltip}</title>
        </g>
      `;
    }).join('');
}

export function renderBattlefield(result: SimulationResult, phaseIndex?: number): string {
  const field = result.battlefield || { width: 44, height: 60 };

  const findSnapshot = () => {
    if (typeof phaseIndex === 'number' && result.positionsTimeline?.length) {
      const specific = result.positionsTimeline.find(p => p.phaseIndex === phaseIndex);
      if (specific) return specific;
    }
    if (result.positionsTimeline?.length) {
      return result.positionsTimeline[result.positionsTimeline.length - 1];
    }
    return null;
  };

  const snapshot = findSnapshot();
  const endPositions = snapshot
    ? { armyA: snapshot.armyA, armyB: snapshot.armyB }
    : result.positions.end;

  const hasPoints = result.positions.start.armyA.length || result.positions.start.armyB.length || endPositions.armyA.length || endPositions.armyB.length;
  if (!hasPoints) return '<p class="text-muted">No unit positions available</p>';

  const width = SIM_SVG_WIDTH;
  const height = SIM_SVG_HEIGHT;
  const pad = SIM_SVG_PAD;
  const scaleX = (width - pad * 2) / field.width;
  const scaleY = (height - pad * 2) / field.height;
  const sx = (x: number) => pad + (x + field.width / 2) * scaleX;
  const sy = (y: number) => pad + (y + field.height / 2) * scaleY;
  const escapeAttr = (value?: string) => (value || '').replace(/"/g, '&quot;');
  const avgScale = (scaleX + scaleY) / 2;

  const pxRadius = (model: FlattenedModel, multiplier = 0.65) => {
    const diameterInches = model.baseSizeMM ? model.baseSizeMM / 25.4 : undefined;
    const radiusInches = diameterInches ? diameterInches / 2 : model.fallbackRadius || 0.5;
    return Math.max(2.5, Math.min(12, radiusInches * avgScale * multiplier));
  };

  const flattenModels = (
    units: Array<{ name: string; x: number; y: number; remaining?: number; role?: string; baseSizeMM?: number; models?: { index: number; x: number; y: number; alive?: boolean }[] }>,
    armyTag: 'armyA' | 'armyB',
    includeAlive: boolean
  ): FlattenedModel[] => {
    return units.flatMap(unit => {
      const baseRadiusValue = estimateBaseRadiusFromName(unit.name);
      const totalModels = unit.models?.length ?? unit.remaining ?? 0;
      const unitName = unit.name || 'Unit';
      const role = unit.role || '';

      if (unit.models?.length) {
        return unit.models.map(model => ({
          x: model.x,
          y: model.y,
          army: armyTag,
          alive: includeAlive ? (model.alive ?? true) : true,
          unitName,
          role,
          remaining: unit.remaining,
          totalModels,
          baseSizeMM: unit.baseSizeMM,
          fallbackRadius: baseRadiusValue,
          modelIndex: model.index ?? 0
        }));
      }

      return [{
        x: unit.x,
        y: unit.y,
        army: armyTag,
        alive: includeAlive ? (unit.remaining ?? 0) > 0 : true,
        unitName,
        role,
        remaining: unit.remaining,
        totalModels: totalModels || (includeAlive ? unit.remaining ?? 0 : 1),
        baseSizeMM: unit.baseSizeMM,
        fallbackRadius: baseRadiusValue,
        modelIndex: 0
      }];
    });
  };

  const startModels = [
    ...flattenModels(result.positions.start.armyA, 'armyA', false),
    ...flattenModels(result.positions.start.armyB, 'armyB', false)
  ];

  const currentModels = [
    ...flattenModels(endPositions.armyA, 'armyA', true),
    ...flattenModels(endPositions.armyB, 'armyB', true)
  ];

  const startCircles = startModels.map(model => {
    const color = model.army === 'armyA' ? '#1f77b4' : '#d62728';
    const cx = sx(model.x);
    const cy = sy(model.y);
    return `<circle class="sim-start-dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${pxRadius(model, 0.5).toFixed(1)}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-opacity="0.1" />`;
  }).join('');

  const currentMarkers = currentModels.map(model => {
    const color = model.army === 'armyA' ? '#1f77b4' : '#d62728';
    const cx = sx(model.x);
    const cy = sy(model.y);
    const radius = pxRadius(model);
    const nameText = escapeAttr(model.unitName || 'Unit');
    const roleText = escapeAttr(model.role || '');
    const remainingText = model.remaining ?? '';
    const totalText = model.totalModels ?? '';
    const baseText = model.baseSizeMM ?? '';
    const dataAttrs = `data-name="${nameText}" data-role="${roleText}" data-unit-remaining="${remainingText}" data-unit-total="${totalText}" data-model-index="${model.modelIndex ?? 0}" data-model-alive="${model.alive ? 'true' : 'false'}" data-base-mm="${baseText}"`;

    if (model.alive) {
      return `<circle class="sim-unit-dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" fill-opacity="0.9" stroke="#111" stroke-width="1.5" tabindex="0" role="button" ${dataAttrs}></circle>`;
    }

    const crossSize = Math.max(5, radius * 0.75);
    return `
      <g>
        <circle class="sim-unit-dot sim-model-dead" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" fill-opacity="0.2" stroke="#444" stroke-width="1.5" stroke-dasharray="4 3" tabindex="0" role="button" ${dataAttrs}></circle>
        <line x1="${(cx - crossSize).toFixed(1)}" y1="${(cy - crossSize).toFixed(1)}" x2="${(cx + crossSize).toFixed(1)}" y2="${(cy + crossSize).toFixed(1)}" stroke="#111" stroke-width="1.5" />
        <line x1="${(cx - crossSize).toFixed(1)}" y1="${(cy + crossSize).toFixed(1)}" x2="${(cx + crossSize).toFixed(1)}" y2="${(cy - crossSize).toFixed(1)}" stroke="#111" stroke-width="1.5" />
      </g>
    `;
  }).join('');

  // Render terrain features
  const terrainLayer = renderTerrainFeatures(
    result.terrain || [],
    sx,
    sy,
    scaleX,
    scaleY,
    escapeAttr
  );

  // Render objective markers with enhanced indicators
  const objectiveMarkers = (result.objectives || []).map(obj => {
    const cx = sx(obj.x);
    const cy = sy(obj.y);
    const objRadius = 8;

    // Color based on control status and priority
    let fillColor = '#888'; // contested (grey)
    let strokeColor = '#333';
    let fillOpacity = 0.3;
    let radiusMultiplier = 1.0; // Larger markers for primary objectives

    if (obj.controlledBy === 'armyA') {
      fillColor = '#1f77b4';
      strokeColor = '#0d47a1';
      fillOpacity = 0.7;
    } else if (obj.controlledBy === 'armyB') {
      fillColor = '#d62728';
      strokeColor = '#8b0000';
      fillOpacity = 0.7;
    }

    // Primary objectives are larger and brighter
    if (obj.priority === 'primary') {
      radiusMultiplier = 1.3;
      fillOpacity = Math.min(1.0, fillOpacity + 0.15);
    }

    const markerRadius = objRadius * radiusMultiplier;

    // Build extra visual indicators
    let extraElements = '';

    // Hold progress arc (shows how close to scoring)
    const holdNeeded = obj.holdNeeded || 0;
    if (holdNeeded > 0 && obj.controlledBy !== 'contested') {
      const currentHold = obj.controlledBy === 'armyA' ? obj.heldByA : obj.heldByB;
      const holdProgress = Math.min(1, currentHold / holdNeeded);
      if (holdProgress > 0 && holdProgress < 1) {
        // Draw progress arc
        const arcRadius = markerRadius + 6;
        const startAngle = -90; // Start from top
        const endAngle = startAngle + (holdProgress * 360);
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;
        const x1 = cx + arcRadius * Math.cos(startRad);
        const y1 = cy + arcRadius * Math.sin(startRad);
        const x2 = cx + arcRadius * Math.cos(endRad);
        const y2 = cy + arcRadius * Math.sin(endRad);
        const largeArc = holdProgress > 0.5 ? 1 : 0;
        const arcColor = obj.controlledBy === 'armyA' ? '#4fc3f7' : '#ff8a65';
        extraElements += `
          <path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"
            fill="none" stroke="${arcColor}" stroke-width="3" stroke-linecap="round" opacity="0.9" />
        `;
      }
    }

    // "Ready to score" glow effect
    if (obj.readyFor) {
      const glowColor = obj.readyFor === 'armyA' ? '#64b5f6' : '#ef5350';
      extraElements += `
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(markerRadius + 10).toFixed(1)}"
          fill="none" stroke="${glowColor}" stroke-width="2" opacity="0.6">
          <animate attributeName="r" values="${(markerRadius + 8).toFixed(1)};${(markerRadius + 12).toFixed(1)};${(markerRadius + 8).toFixed(1)}" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.3;0.6" dur="1.5s" repeatCount="indefinite" />
        </circle>
      `;
    }

    // VP badge (top-right corner)
    const vpValue = obj.baseVp || 0;
    if (vpValue > 0) {
      const badgeX = cx + markerRadius * 0.7;
      const badgeY = cy - markerRadius * 0.7;
      const badgeColor = obj.readyFor ? '#ffd700' : '#fff';
      extraElements += `
        <circle cx="${badgeX.toFixed(1)}" cy="${badgeY.toFixed(1)}" r="6" fill="#333" stroke="${badgeColor}" stroke-width="1" />
        <text x="${badgeX.toFixed(1)}" y="${(badgeY + 3).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="bold" fill="${badgeColor}">${vpValue}</text>
      `;
    }

    // OC comparison indicator (bottom, shows which army has more OC)
    const ocA = obj.levelOfControlA || 0;
    const ocB = obj.levelOfControlB || 0;
    if (ocA > 0 || ocB > 0) {
      const ocY = cy + markerRadius + 10;
      let ocText = '';
      let ocColor = '#666';
      if (ocA > ocB) {
        ocText = `A:${ocA}`;
        ocColor = '#1f77b4';
      } else if (ocB > ocA) {
        ocText = `B:${ocB}`;
        ocColor = '#d62728';
      } else if (ocA > 0) {
        ocText = `${ocA}=${ocB}`;
        ocColor = '#888';
      }
      if (ocText) {
        extraElements += `
          <text x="${cx.toFixed(1)}" y="${ocY.toFixed(1)}" text-anchor="middle" font-size="7" fill="${ocColor}" font-weight="bold">${ocText}</text>
        `;
      }
    }

    const primaryLabel = obj.priority === 'primary' ? ' [PRIMARY]' : '';
    const readyText = obj.readyFor ? ` READY for ${obj.readyFor === 'armyA' ? 'A' : 'B'} (+${vpValue}VP)` : '';
    const holdText = holdNeeded > 0 ? ` Hold: A=${obj.heldByA}/${holdNeeded}, B=${obj.heldByB}/${holdNeeded}` : '';
    const tooltipText = `${obj.id}${primaryLabel}: ${obj.controlledBy === 'contested' ? 'Contested' : (obj.controlledBy === 'armyA' ? 'Army A' : 'Army B')} (A: ${ocA} OC, B: ${ocB} OC)${holdText}${readyText}`;

    return `
      <g class="objective-marker" data-obj-id="${escapeAttr(obj.id)}" data-priority="${obj.priority}">
        ${extraElements}
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(markerRadius + 3).toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-dasharray="3 2" opacity="0.5" />
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${markerRadius.toFixed(1)}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="2" />
        <text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.5">${obj.priority === 'primary' ? '★' : '⬢'}</text>
        <title>${tooltipText}</title>
      </g>
    `;
  }).join('');

  return `
    <svg id="battlefieldSvg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Unit positions">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8f9fa" stroke="#ddd" />
      <rect x="0" y="0" width="${(field.deployDepth * scaleX).toFixed(1)}" height="${height}" fill="#e8f0ff" fill-opacity="0.25" />
      <rect x="${(width - field.deployDepth * scaleX).toFixed(1)}" y="0" width="${(field.deployDepth * scaleX).toFixed(1)}" height="${height}" fill="#ffe8e8" fill-opacity="0.25" />
      <line x1="${sx(0).toFixed(1)}" y1="0" x2="${sx(0).toFixed(1)}" y2="${height}" stroke="#888" stroke-dasharray="4 4" />
      <text x="${4}" y="${12}" font-size="10" fill="#1f77b4">Army A zone</text>
      <text x="${width - field.deployDepth * scaleX + 4}" y="${12}" font-size="10" fill="#d62728">Army B zone</text>
      <g id="threatRangesLayer" style="display: none;"></g>
      <g id="terrainLayer">${terrainLayer}</g>
      ${objectiveMarkers}
      ${startCircles}
      ${currentMarkers}
      <g id="movementPhasePaths"></g>
      <g id="movementHighlight"></g>
      <g id="attackHighlight"></g>
    </svg>
  `;
}

export function getScaleFactors(result: SimulationResult) {
  const field = result.battlefield || { width: 44, height: 60 };
  const width = SIM_SVG_WIDTH;
  const height = SIM_SVG_HEIGHT;
  const pad = SIM_SVG_PAD;
  const scaleX = (width - pad * 2) / field.width;
  const scaleY = (height - pad * 2) / field.height;

  return {
    toSvgX: (val: number) => pad + (val + field.width / 2) * scaleX,
    toSvgY: (val: number) => pad + (val + field.height / 2) * scaleY,
    scaleX,
    scaleY,
    avgScale: (scaleX + scaleY) / 2
  };
}

/**
 * Update threat ranges display on the battlefield
 * Call this to show/hide or refresh threat range circles
 */
export function updateThreatRanges(
  result: SimulationResult,
  options: {
    visible: boolean;
    showArmyA?: boolean;
    showArmyB?: boolean;
    showShooting?: boolean;
    showCharge?: boolean;
  }
): void {
  const svg = document.getElementById('battlefieldSvg') as SVGSVGElement | null;
  const layer = svg?.querySelector('#threatRangesLayer') as SVGGElement | null;
  if (!layer) return;

  // Toggle visibility
  layer.style.display = options.visible ? '' : 'none';
  if (!options.visible) return;

  // Get scale factors
  const scales = getScaleFactors(result);

  // Extract threat data from current army states
  const threatData = [
    ...extractThreatData(result.armyAState, 'armyA'),
    ...extractThreatData(result.armyBState, 'armyB')
  ];

  // Render threat ranges
  const showArmyA = options.showArmyA ?? true;
  const showArmyB = options.showArmyB ?? true;

  layer.innerHTML = renderThreatRanges(
    threatData,
    scales.toSvgX,
    scales.toSvgY,
    scales.avgScale,
    showArmyA,
    showArmyB
  );

  // Apply shooting/charge visibility
  if (options.showShooting === false) {
    layer.querySelectorAll('.threat-shooting').forEach(el => {
      (el as SVGElement).style.display = 'none';
    });
  }
  if (options.showCharge === false) {
    layer.querySelectorAll('.threat-charge').forEach(el => {
      (el as SVGElement).style.display = 'none';
    });
  }
}
