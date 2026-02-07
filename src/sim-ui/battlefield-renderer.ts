/**
 * SVG battlefield rendering for battle simulator
 */

import type { SimulationResult, TerrainFeature } from '../simulation';

const SIM_SVG_WIDTH = 800;
const SIM_SVG_HEIGHT = 400;
const SIM_SVG_PAD = 20;

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
  if (!terrain || terrain.length === 0) {
    console.log('renderTerrainFeatures: No terrain to render');
    return '';
  }

  console.log('renderTerrainFeatures: Rendering', terrain.length, 'features');
  console.log('Sample terrain feature:', terrain[0]);
  const result = terrain.map(t => {
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

  console.log('Generated terrain SVG length:', result.length, 'characters');
  return result;
}

export function renderBattlefield(result: SimulationResult, phaseIndex?: number): string {
  const field = result.battlefield || { width: 60, height: 44 };

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
  // Use uniform scaling to prevent skewing
  const rawScaleX = (width - SIM_SVG_PAD * 2) / field.width;
  const rawScaleY = (height - SIM_SVG_PAD * 2) / field.height;
  const scaleX = Math.min(rawScaleX, rawScaleY);
  const scaleY = scaleX; // Uniform scaling

  // Center the battlefield
  const offsetX = (width - field.width * scaleX) / 2;
  const offsetY = (height - field.height * scaleY) / 2;

  const sx = (x: number) => offsetX + (x + field.width / 2) * scaleX;
  const sy = (y: number) => offsetY + (y + field.height / 2) * scaleY;
  const escapeAttr = (value?: string) => (value || '').replace(/"/g, '&quot;');
  const avgScale = (scaleX + scaleY) / 2;

  const pxRadius = (model: FlattenedModel, multiplier = 0.65) => {
    const diameterInches = model.baseSizeMM ? model.baseSizeMM / 25.4 : undefined;
    const radiusInches = diameterInches ? diameterInches / 2 : model.fallbackRadius || 0.5;
    return Math.max(2.5, Math.min(12, radiusInches * avgScale * multiplier));
  };

  const flattenModels = (
    units: Array<{ name: string; x: number; y: number; remaining?: number; role?: string; baseSizeMM?: number; inReserves?: boolean; models?: { index: number; x: number; y: number; alive?: boolean }[] }>,
    armyTag: 'armyA' | 'armyB',
    includeAlive: boolean
  ): FlattenedModel[] => {
    // Filter out units that are in reserves - they shouldn't be shown on the map
    const visibleUnits = units.filter(unit => !unit.inReserves);
    return visibleUnits.flatMap(unit => {
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

  // Generate model markers with icons
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

    // Determine icon based on role
    let icon = '';
    const r = (model.role || '').toLowerCase();

    // Character / HQ - Priority 1
    if (r.includes('hq') || r.includes('character') || r.includes('leader') || r.includes('captain') || r.includes('warlord')) {
      icon = '★';
    }
    // Vehicles / Large
    else if (r.includes('vehicle') || r.includes('monster') || r.includes('walker') || r.includes('dread') || r.includes('tank')) {
      icon = '⬢';
    }
    // Specific Roles
    else if (r.includes('transport')) icon = '⛟';
    else if (r.includes('artillery')) icon = '🎯'; // Target for artillery
    else if (r.includes('fast') || r.includes('bike') || r.includes('fly') || r.includes('cavalry')) icon = '⚡';
    else if (r.includes('heavy') || r.includes('devastator')) icon = '▼';
    else if (r.includes('elite') || r.includes('terminator')) icon = '◆';
    else if (r.includes('melee') || r.includes('assault')) icon = '⚔';
    else if (r.includes('gunline') || r.includes('firepower') || r.includes('shooty')) icon = '⌖';
    else if (r.includes('skirmish')) icon = '👣';
    else if (r.includes('anvil') || r.includes('tanky')) icon = '🛡';
    else if (r.includes('utility')) icon = '🔧';
    else if (r.includes('fortification')) icon = '☗';

    // Default fallback if we have a role but no specific icon
    if (!icon && r.trim().length > 0) {
      if (r.includes('infantry') || r.includes('troops') || r.includes('line')) {
        icon = '•'; // Small bullet for generic infantry
      } else {
        icon = '•';
      }
    }

    // Adjust font size based on radius
    const fontSize = Math.max(9, radius * 1.3);
    const textYOffset = radius * 0.35; // Center vertically visually

    if (model.alive) {
      return `
        <g class="sim-unit-group" tabindex="0" role="button" ${dataAttrs}>
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" fill-opacity="0.9" stroke="#111" stroke-width="1.5" />
          ${icon ? `<text x="${cx.toFixed(1)}" y="${(cy + textYOffset).toFixed(1)}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="#fff" pointer-events="none">${icon}</text>` : ''}
        </g>
      `;
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
  console.log('Rendering terrain features:', result.terrain?.length || 0, 'features');
  const terrainLayer = renderTerrainFeatures(
    result.terrain || [],
    sx,
    sy,
    scaleX,
    scaleY,
    escapeAttr
  );

  // Render objective markers
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

    const primaryLabel = obj.priority === 'primary' ? ' [PRIMARY]' : '';
    const tooltipText = `${obj.id}${primaryLabel}: ${obj.controlledBy === 'contested' ? 'Contested' : (obj.controlledBy === 'armyA' ? 'Army A' : 'Army B')} (A: ${obj.levelOfControlA} OC, B: ${obj.levelOfControlB} OC) Hold: A=${obj.heldByA}, B=${obj.heldByB}`;

    const markerRadius = objRadius * radiusMultiplier;

    return `
      <g class="objective-marker" data-obj-id="${escapeAttr(obj.id)}" data-priority="${obj.priority}">
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(markerRadius + 3).toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-dasharray="3 2" opacity="0.5" />
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${markerRadius.toFixed(1)}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="2" />
        <text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.5">${obj.priority === 'primary' ? '★' : '⬢'}</text>
        <title>${tooltipText}</title>
      </g>
    `;
  }).join('');

  // Add Legend HTML
  const legendHtml = `
    <div class="mt-2 p-2 border rounded bg-light small">
      <div class="d-flex flex-wrap gap-3">
        <div>
          <strong>Terrain:</strong>
          <span class="badge" style="background:${TERRAIN_COLORS.ruins.fill}; color:#fff; border:1px solid ${TERRAIN_COLORS.ruins.stroke}">Ruins</span>
          <span class="badge" style="background:${TERRAIN_COLORS.woods.fill}; color:#fff; border:1px solid ${TERRAIN_COLORS.woods.stroke}">Woods</span>
          <span class="badge" style="background:${TERRAIN_COLORS.container.fill}; color:#fff; border:1px solid ${TERRAIN_COLORS.container.stroke}">Container</span>
          <span class="badge" style="background:${TERRAIN_COLORS.barricade.fill}; color:#fff; border:1px solid ${TERRAIN_COLORS.barricade.stroke}">Barricade</span>
        </div>
        <div class="flex-grow-1">
          <strong>Roles:</strong>
          <span class="badge border text-dark bg-white">★ HQ</span>
          <span class="badge border text-dark bg-white">⬢ Vehicle</span>
          <span class="badge border text-dark bg-white">⛟ Transport</span>
          <span class="badge border text-dark bg-white">🎯 Art./Indirect</span>
          <span class="badge border text-dark bg-white">⚡ Fast</span>
          <span class="badge border text-dark bg-white">▼ Heavy</span>
          <span class="badge border text-dark bg-white">◆ Elite</span>
          <span class="badge border text-dark bg-white">⚔ Melee</span>
          <span class="badge border text-dark bg-white">⌖ Gunline</span>
          <span class="badge border text-dark bg-white">🛡 Anvil</span>
        </div>
        <div>
          <strong>Objectives:</strong>
          <span class="text-primary">★ Primary</span>
          <span class="text-secondary">⬢ Secondary</span>
        </div>
      </div>
    </div>
  `;

  return `
    <svg id="battlefieldSvg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Unit positions" style="background: #f8f9fa; border: 1px solid #ddd; display: block; margin-bottom: 0.5rem;">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8f9fa" />
      <rect x="0" y="0" width="${(field.deployDepth * scaleX).toFixed(1)}" height="${height}" fill="#e8f0ff" fill-opacity="0.25" />
      <rect x="${(width - field.deployDepth * scaleX).toFixed(1)}" y="0" width="${(field.deployDepth * scaleX).toFixed(1)}" height="${height}" fill="#ffe8e8" fill-opacity="0.25" />
      <line x1="${sx(0).toFixed(1)}" y1="0" x2="${sx(0).toFixed(1)}" y2="${height}" stroke="#888" stroke-dasharray="4 4" />
      <text x="${4}" y="${12}" font-size="10" fill="#1f77b4">Army A zone</text>
      <text x="${width - field.deployDepth * scaleX + 4}" y="${12}" font-size="10" fill="#d62728">Army B zone</text>
      <g id="terrainLayer">${terrainLayer}</g>
      ${objectiveMarkers}
      ${startCircles}
      ${currentMarkers}
      <g id="movementPhasePaths"></g>
      <g id="movementHighlight"></g>
      <g id="attackHighlight"></g>
    </svg>
    ${legendHtml}
  `;
}

export function getScaleFactors(result: SimulationResult) {
  const field = result.battlefield || { width: 44, height: 60 };
  const width = SIM_SVG_WIDTH;
  const height = SIM_SVG_HEIGHT;
  const pad = SIM_SVG_PAD;
  // Use uniform scaling to prevent skewing
  const rawScaleX = (width - pad * 2) / field.width;
  const rawScaleY = (height - pad * 2) / field.height;
  const scale = Math.min(rawScaleX, rawScaleY);

  // Center the battlefield
  const offsetX = (width - field.width * scale) / 2;
  const offsetY = (height - field.height * scale) / 2;

  return {
    toSvgX: (val: number) => offsetX + (val + field.width / 2) * scale,
    toSvgY: (val: number) => offsetY + (val + field.height / 2) * scale,
    scaleX: scale,
    scaleY: scale
  };
}
