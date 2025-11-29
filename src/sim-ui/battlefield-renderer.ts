/**
 * SVG battlefield rendering for battle simulator
 */

import type { SimulationResult } from '../simulation';

const SIM_SVG_WIDTH = 800;
const SIM_SVG_HEIGHT = 400;
const SIM_SVG_PAD = 20;

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

  return `
    <svg id="battlefieldSvg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Unit positions">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8f9fa" stroke="#ddd" />
      <rect x="0" y="0" width="${(field.deployDepth * scaleX).toFixed(1)}" height="${height}" fill="#e8f0ff" fill-opacity="0.25" />
      <rect x="${(width - field.deployDepth * scaleX).toFixed(1)}" y="0" width="${(field.deployDepth * scaleX).toFixed(1)}" height="${height}" fill="#ffe8e8" fill-opacity="0.25" />
      <line x1="${sx(0).toFixed(1)}" y1="0" x2="${sx(0).toFixed(1)}" y2="${height}" stroke="#888" stroke-dasharray="4 4" />
      <text x="${4}" y="${12}" font-size="10" fill="#1f77b4">Army A zone</text>
      <text x="${width - field.deployDepth * scaleX + 4}" y="${12}" font-size="10" fill="#d62728">Army B zone</text>
      ${startCircles}
      ${currentMarkers}
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
    scaleY
  };
}
