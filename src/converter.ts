/**
 * Roster Converter - Port of Python parse_json.py to TypeScript
 * Converts BattleScribe roster JSON/XML to optimized format
 */

import type { Army, Unit, Weapon, UnitStats } from './types';
import { XMLParser } from 'fast-xml-parser';

// BattleScribe roster input types
interface RosterSelection {
  id?: string;
  name: string;
  type?: string;
  number?: number;
  selections?: RosterSelection[];
  profiles?: RosterProfile[];
  rules?: RosterRule[];
  categories?: RosterCategory[];
  costs?: RosterCost[];
}

interface RosterProfile {
  id: string;
  name: string;
  typeName: string;
  characteristics?: RosterCharacteristic[];
}

interface RosterCharacteristic {
  name: string;
  $text?: string;
}

interface RosterRule {
  id: string;
  name: string;
  description?: string;
  hidden?: boolean;
}

interface RosterCategory {
  name: string;
  primary?: boolean;
}

interface RosterCost {
  name: string;
  value: number;
}

interface RosterForce {
  selections: RosterSelection[];
  rules?: RosterRule[];
}

interface RosterData {
  name?: string;
  roster: {
    forces: RosterForce[];
    points?: {
      total: number;
    };
  };
}

interface WeaponCount {
  weapon: Weapon;
  count: number;
  models_with_weapon: number;
}

/**
 * Parse XML (.roz) file and convert to RosterData JSON format
 */
export function parseXMLRoster(xmlContent: string): RosterData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '$text',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (tagName: string) => {
      // Force these tags to always be arrays
      return ['selection', 'force', 'profile', 'characteristic', 'rule', 'category', 'cost'].includes(tagName);
    }
  });

  const parsed = parser.parse(xmlContent);

  // Transform XML structure to match JSON structure
  const roster = parsed.roster;

  // Normalize the structure to match RosterData interface
  const normalized: RosterData = {
    name: roster.name || roster['@_name'] || 'Unknown Army',
    roster: {
      forces: [],
      points: {
        total: 0
      }
    }
  };

  // Extract points from costs
  if (roster.costs?.cost) {
    const costs = Array.isArray(roster.costs.cost) ? roster.costs.cost : [roster.costs.cost];
    const ptsCost = costs.find((c: any) => c.name === 'pts' || c['@_name'] === 'pts');
    if (ptsCost) {
      normalized.roster.points!.total = parseFloat(ptsCost.value || ptsCost['@_value'] || 0);
    }
  }

  // Process forces
  if (roster.forces?.force) {
    const forces = Array.isArray(roster.forces.force) ? roster.forces.force : [roster.forces.force];

    for (const force of forces) {
      const normalizedForce: any = {
        selections: []
      };

      // Extract force-level rules
      if (force.rules?.rule) {
        normalizedForce.rules = normalizeRules(force.rules.rule);
      }

      // Extract selections
      if (force.selections?.selection) {
        normalizedForce.selections = normalizeSelections(force.selections.selection);
      }

      normalized.roster.forces.push(normalizedForce);
    }
  }

  return normalized;
}

/**
 * Normalize XML rules to JSON format
 */
function normalizeRules(rules: any): any[] {
  const rulesArray = Array.isArray(rules) ? rules : [rules];
  return rulesArray.map((rule: any) => ({
    id: rule.id || rule['@_id'],
    name: rule.name || rule['@_name'],
    description: rule.description || rule['@_description'] || '',
    hidden: rule.hidden === 'true' || rule['@_hidden'] === 'true' || false
  }));
}

/**
 * Normalize XML selections to JSON format (recursive)
 */
function normalizeSelections(selections: any): any[] {
  const selectionsArray = Array.isArray(selections) ? selections : [selections];

  return selectionsArray.map((sel: any) => {
    const normalized: any = {
      id: sel.id || sel['@_id'],
      name: sel.name || sel['@_name'],
      type: sel.type || sel['@_type'],
      number: parseFloat(sel.number || sel['@_number'] || 1)
    };

    // Handle nested selections
    if (sel.selections?.selection) {
      normalized.selections = normalizeSelections(sel.selections.selection);
    }

    // Handle profiles
    if (sel.profiles?.profile) {
      normalized.profiles = normalizeProfiles(sel.profiles.profile);
    }

    // Handle rules
    if (sel.rules?.rule) {
      normalized.rules = normalizeRules(sel.rules.rule);
    }

    // Handle categories
    if (sel.categories?.category) {
      normalized.categories = normalizeCategories(sel.categories.category);
    }

    // Handle costs
    if (sel.costs?.cost) {
      normalized.costs = normalizeCosts(sel.costs.cost);
    }

    return normalized;
  });
}

/**
 * Normalize XML profiles to JSON format
 */
function normalizeProfiles(profiles: any): any[] {
  const profilesArray = Array.isArray(profiles) ? profiles : [profiles];

  return profilesArray.map((profile: any) => ({
    id: profile.id || profile['@_id'],
    name: profile.name || profile['@_name'],
    typeName: profile.typeName || profile['@_typeName'],
    characteristics: profile.characteristics?.characteristic
      ? normalizeCharacteristics(profile.characteristics.characteristic)
      : []
  }));
}

/**
 * Normalize XML characteristics to JSON format
 */
function normalizeCharacteristics(characteristics: any): any[] {
  const charsArray = Array.isArray(characteristics) ? characteristics : [characteristics];

  return charsArray.map((char: any) => ({
    name: char.name || char['@_name'],
    $text: char.$text || char['#text'] || char || ''
  }));
}

/**
 * Normalize XML categories to JSON format
 */
function normalizeCategories(categories: any): any[] {
  const categoriesArray = Array.isArray(categories) ? categories : [categories];

  return categoriesArray.map((cat: any) => ({
    id: cat.id || cat['@_id'],
    name: cat.name || cat['@_name'],
    entryId: cat.entryId || cat['@_entryId'],
    primary: cat.primary === 'true' || cat['@_primary'] === 'true' || false
  }));
}

/**
 * Normalize XML costs to JSON format
 */
function normalizeCosts(costs: any): any[] {
  const costsArray = Array.isArray(costs) ? costs : [costs];

  return costsArray.map((cost: any) => ({
    name: cost.name || cost['@_name'],
    typeId: cost.typeId || cost['@_typeId'],
    value: parseFloat(cost.value || cost['@_value'] || 0)
  }));
}

/**
 * Main conversion function - optimizes a Warhammer 40k roster
 */
export function optimizeWarhammerRoster(data: RosterData): Army {
  // Initialize the optimized structure
  const optimized: Army = {
    armyName: data.name || "Unknown Army",
    faction: extractFaction(data),
    pointsTotal: extractPoints(data),
    rules: {},
    abilities: {},
    units: []
  };

  // Process the forces
  for (const force of data.roster.forces) {
    // Extract global rules
    if (force.rules) {
      for (const rule of force.rules) {
        const ruleId = rule.id;
        optimized.rules![ruleId] = {
          id: ruleId,
          name: rule.name,
          description: rule.description || "",
          hidden: rule.hidden || false
        };
      }
    }

    // Extract units
    extractUnits(force.selections, optimized);
  }

  return optimized;
}

/**
 * Extract the faction name from the roster data
 */
function extractFaction(data: RosterData): string {
  try {
    const forces = data.roster.forces;
    if (forces && forces[0]?.selections) {
      for (const selection of forces[0].selections) {
        if (selection.name === "Detachment" && selection.selections) {
          return selection.selections[0]?.name || "Unknown Faction";
        }
      }
    }
  } catch (error) {
    console.warn("Error extracting faction:", error);
  }

  return "Unknown Faction";
}

/**
 * Extract the total points cost from the roster data
 */
function extractPoints(data: RosterData): number {
  try {
    return data.roster.points?.total || 0;
  } catch (error) {
    console.warn("Error extracting points:", error);
    return 0;
  }
}

/**
 * Check if a selection is a configuration entry
 */
function isConfiguration(selection: RosterSelection): boolean {
  return selection.type === "configuration";
}

/**
 * Check if a selection is a unit or model
 */
function isUnitOrModel(selection: RosterSelection): boolean {
  return selection.type === "unit" || selection.type === "model";
}

/**
 * Check if a selection is a multi-model unit
 */
function isMultiModelUnit(selection: RosterSelection): boolean {
  return selection.type === "unit" && (selection.number || 1) > 1;
}

/**
 * Get the primary category of a selection
 */
function getPrimaryCategory(selection: RosterSelection): string {
  if (selection.categories) {
    for (const category of selection.categories) {
      if (category.primary) {
        return category.name;
      }
    }
  }
  return "Unknown";
}

/**
 * Get the points cost of a selection
 */
function getPointsCost(selection: RosterSelection): number {
  if (selection.costs) {
    for (const cost of selection.costs) {
      if (cost.name === "pts") {
        return Math.floor(cost.value);
      }
    }
  }
  return 0;
}

/**
 * Extract characteristics from a profile
 */
function extractCharacteristics(profile: RosterProfile): { [key: string]: string } {
  const characteristics: { [key: string]: string } = {};
  if (profile.characteristics) {
    for (const char of profile.characteristics) {
      const name = char.name.toLowerCase();
      const value = char.$text || "";
      characteristics[name] = value;
    }
  }
  return characteristics;
}

/**
 * Extract unit stats from profiles
 */
function extractUnitStats(selection: RosterSelection): UnitStats {
  // Initialize default stats
  const stats: UnitStats = {
    move: "",
    toughness: "",
    save: "",
    wounds: "",
    leadership: "",
    objectiveControl: ""
  };

  // First try to get stats from the unit's own profiles
  if (selection.profiles) {
    for (const profile of selection.profiles) {
      if (profile.typeName === "Unit" && profile.characteristics) {
        for (const char of profile.characteristics) {
          const name = char.name;
          const value = char.$text || "";

          switch (name) {
            case "M":
              stats.move = value;
              break;
            case "T":
              stats.toughness = value;
              break;
            case "SV":
              stats.save = value;
              break;
            case "W":
              stats.wounds = value;
              break;
            case "LD":
              stats.leadership = value;
              break;
            case "OC":
              stats.objectiveControl = value;
              break;
          }
        }
      }
    }
  }

  // If we didn't find stats, try subselections
  const hasStats = Object.values(stats).some(v => v !== "");
  if (!hasStats && selection.selections) {
    for (const subselection of selection.selections) {
      if (isConfiguration(subselection) || !isUnitOrModel(subselection)) {
        continue;
      }

      if (subselection.profiles) {
        for (const profile of subselection.profiles) {
          if (profile.typeName === "Unit" && profile.characteristics) {
            for (const char of profile.characteristics) {
              const name = char.name;
              const value = char.$text || "";

              switch (name) {
                case "M":
                  if (!stats.move) stats.move = value;
                  break;
                case "T":
                  if (!stats.toughness) stats.toughness = value;
                  break;
                case "SV":
                  if (!stats.save) stats.save = value;
                  break;
                case "W":
                  if (!stats.wounds) stats.wounds = value;
                  break;
                case "LD":
                  if (!stats.leadership) stats.leadership = value;
                  break;
                case "OC":
                  if (!stats.objectiveControl) stats.objectiveControl = value;
                  break;
              }
            }
          }
        }
      }
    }
  }

  return stats;
}

/**
 * Create a unit entry from a selection
 */
function createUnit(selection: RosterSelection, optimized: Army): Unit {
  const unit: Unit = {
    id: selection.id || generateId(),
    name: selection.name,
    type: getPrimaryCategory(selection),
    stats: extractUnitStats(selection),
    points: getPointsCost(selection),
    count: selection.number || 1,
    weapons: []
  };

  // Process rules directly attached to the unit
  if (selection.rules) {
    unit.rules = [];
    for (const rule of selection.rules) {
      const ruleId = rule.id;

      // Add rule to global collection
      if (!optimized.rules![ruleId]) {
        optimized.rules![ruleId] = {
          id: ruleId,
          name: rule.name,
          description: rule.description || "",
          hidden: rule.hidden || false
        };
      }

      // Add reference to the unit
      unit.rules.push(ruleId);
    }
  }

  // Process abilities directly attached to the unit
  if (selection.profiles) {
    for (const profile of selection.profiles) {
      if (profile.typeName === "Abilities") {
        const abilityId = profile.id;

        // Add ability to global collection
        if (!optimized.abilities![abilityId]) {
          const ability = {
            id: abilityId,
            name: profile.name,
            description: ""
          };

          // Extract description
          if (profile.characteristics) {
            for (const char of profile.characteristics) {
              if (char.name === "Description") {
                ability.description = char.$text || "";
              }
            }
          }

          optimized.abilities![abilityId] = ability;
        }

        // Add reference to the unit
        if (!unit.abilities) {
          unit.abilities = [];
        }
        if (!unit.abilities.includes(abilityId)) {
          unit.abilities.push(abilityId);
        }
      }
    }
  }

  return unit;
}

/**
 * Generate a short unique ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Extract weapons, abilities, and rules from selections
 */
function extractWeaponsAbilitiesRules(selections: RosterSelection[], optimized: Army, unit: Unit): void {
  // Dictionary to track weapon counts for this unit only
  const weaponCounts: { [id: string]: WeaponCount } = {};

  function processSelection(selection: RosterSelection, modelCount: number = 1): void {
    // Process weapons from profiles
    if (selection.profiles) {
      for (const profile of selection.profiles) {
        if (profile.typeName === "Ranged Weapons" || profile.typeName === "Melee Weapons") {
          const weaponId = profile.id;

          // Create the weapon entry
          const weapon: Weapon = {
            id: weaponId,
            name: profile.name,
            type: profile.typeName,
            characteristics: extractCharacteristics(profile),
            count: 1,
            models_with_weapon: 1
          };

          // Check if this is a firing mode weapon (starts with ➤)
          if (profile.name.startsWith("➤")) {
            // Extract the base weapon name by removing the mode
            const baseName = profile.name.split(" - ")[0];
            weapon.base_name = baseName;
            weapon.overcharge_mode = profile.name.toLowerCase().includes("overcharge") ? "overcharge" : "standard";

            // Add to linked weapons collection
            if (!unit.linked_weapons) {
              unit.linked_weapons = {};
            }
            if (!unit.linked_weapons[baseName]) {
              unit.linked_weapons[baseName] = {
                standard: null,
                overcharge: null
              };
            }
            // Store the weapon ID in the appropriate mode
            unit.linked_weapons[baseName][weapon.overcharge_mode as 'standard' | 'overcharge'] = weaponId;
          }

          // Get the number of weapons per model from the weapon profile
          const numberOfWeapons = selection.number || 1;

          // Calculate total weapon count for this unit only
          const totalWeapons = numberOfWeapons;

          // Update weapon counts for this unit only
          if (weaponCounts[weaponId]) {
            weaponCounts[weaponId].count += totalWeapons;
            weaponCounts[weaponId].models_with_weapon += modelCount;
          } else {
            weaponCounts[weaponId] = {
              weapon: weapon,
              count: totalWeapons,
              models_with_weapon: modelCount
            };
          }
        } else if (profile.typeName === "Abilities") {
          const abilityId = profile.id;

          // Add ability to the global abilities collection
          if (!optimized.abilities![abilityId]) {
            const ability = {
              id: abilityId,
              name: profile.name,
              description: ""
            };

            // Extract description
            if (profile.characteristics) {
              for (const char of profile.characteristics) {
                if (char.name === "Description") {
                  ability.description = char.$text || "";
                }
              }
            }

            optimized.abilities![abilityId] = ability;
          }

          // Add ability reference to the unit
          if (!unit.abilities) {
            unit.abilities = [];
          }
          if (!unit.abilities.includes(abilityId)) {
            unit.abilities.push(abilityId);
          }
        }
      }
    }

    // Process rules
    if (selection.rules) {
      for (const rule of selection.rules) {
        const ruleId = rule.id;

        // Add rule to global collection
        if (!optimized.rules![ruleId]) {
          optimized.rules![ruleId] = {
            id: ruleId,
            name: rule.name,
            description: rule.description || "",
            hidden: rule.hidden || false
          };
        }

        // Add rule reference to the unit
        if (!unit.rules) {
          unit.rules = [];
        }
        if (!unit.rules.includes(ruleId)) {
          unit.rules.push(ruleId);
        }
      }
    }

    // Recursively process subselections
    if (selection.selections) {
      for (const subselection of selection.selections) {
        // Skip if this is a configuration
        if (isConfiguration(subselection)) {
          continue;
        }

        // Get the number of models for this subselection
        const subCount = subselection.number || 1;

        // If this is a model selection, use its count
        if (isUnitOrModel(subselection)) {
          processSelection(subselection, subCount);
        } else {
          // For non-model selections, use the current model count
          processSelection(subselection, modelCount);
        }
      }
    }
  }

  // Process all selections for this unit only
  for (const selection of selections) {
    // Skip if this is a configuration
    if (isConfiguration(selection)) {
      continue;
    }

    // Get the number of models for this selection
    const modelCount = selection.number || 1;

    // If this is a model selection, use its count
    if (isUnitOrModel(selection)) {
      processSelection(selection, modelCount);
    } else {
      // For non-model selections, use the unit's count
      processSelection(selection, unit.count);
    }
  }

  // Add weapons to the unit with their counts
  if (Object.keys(weaponCounts).length > 0) {
    unit.weapons = [];
    for (const weaponData of Object.values(weaponCounts)) {
      const weapon = weaponData.weapon;
      weapon.count = weaponData.count;
      weapon.models_with_weapon = weaponData.models_with_weapon;
      unit.weapons.push(weapon);
    }
  }
}

/**
 * Extract units from selections
 */
function extractUnits(selections: RosterSelection[], optimized: Army, parent?: Unit): void {
  for (const selection of selections) {
    // Skip configuration entries
    if (isConfiguration(selection)) {
      continue;
    }

    // Check if this is a unit or model
    if (isUnitOrModel(selection)) {
      const unit = createUnit(selection, optimized);

      // Add the unit to the units list
      optimized.units.push(unit);

      // Process subselections for this unit
      if (selection.selections) {
        extractWeaponsAbilitiesRules(selection.selections, optimized, unit);

        // Process sub-models if this is a multi-model unit
        if (isMultiModelUnit(selection)) {
          extractUnits(selection.selections, optimized, unit);
        }
      }
    } else if (selection.selections) {
      // Process subselections
      extractUnits(selection.selections, optimized, parent);
    }
  }
}

/**
 * Calculate conversion statistics
 */
export function calculateStats(original: RosterData, optimized: Army): {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  spaceSaving: number;
} {
  const originalSize = JSON.stringify(original).length;
  const optimizedSize = JSON.stringify(optimized).length;
  const compressionRatio = optimizedSize / originalSize;
  const spaceSaving = (1 - compressionRatio) * 100;

  return {
    originalSize,
    optimizedSize,
    compressionRatio,
    spaceSaving
  };
}

// UI Event Handlers
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('dropZone') as HTMLDivElement;
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const fileName = document.getElementById('fileName') as HTMLDivElement;
  const fileNameText = document.getElementById('fileNameText') as HTMLElement;
  const fileSizeText = document.getElementById('fileSizeText') as HTMLElement;
  const clearFileBtn = document.getElementById('clearFile') as HTMLButtonElement;
  const convertBtn = document.getElementById('convertBtn') as HTMLButtonElement;
  const progressContainer = document.getElementById('progressContainer') as HTMLDivElement;
  const progressBar = document.getElementById('progressBar') as HTMLDivElement;
  const progressText = document.getElementById('progressText') as HTMLParagraphElement;
  const statusMessage = document.getElementById('statusMessage') as HTMLDivElement;
  const statsDisplay = document.getElementById('statsDisplay') as HTMLDivElement;
  const statsText = document.getElementById('statsText') as HTMLParagraphElement;

  let currentFile: File | null = null;

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e: Event) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop zone when dragging over
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('dragover');
    }, false);
  });

  // Handle dropped files
  dropZone.addEventListener('drop', (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  });

  // Handle click to browse
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  // Handle file input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  // Handle clear file button
  clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
  });

  // Handle convert button
  convertBtn.addEventListener('click', async () => {
    if (currentFile) {
      await convertRoster(currentFile);
    }
  });

  function handleFile(file: File) {
    // Check file extension
    const validExtensions = ['.json', '.roz'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      showStatus('error', 'Invalid file type. Please upload a .json or .roz file.');
      return;
    }

    currentFile = file;
    fileNameText.textContent = file.name;
    fileSizeText.textContent = formatFileSize(file.size);
    fileName.classList.add('show');
    convertBtn.disabled = false;
    hideStatus();
    statsDisplay.classList.remove('show');
  }

  function clearFile() {
    currentFile = null;
    fileInput.value = '';
    fileName.classList.remove('show');
    convertBtn.disabled = true;
    hideStatus();
    statsDisplay.classList.remove('show');
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function showStatus(type: 'success' | 'error', message: string) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message show ${type}`;
  }

  function hideStatus() {
    statusMessage.classList.remove('show');
  }

  function showProgress(percent: number, text: string) {
    progressContainer.classList.add('show');
    progressBar.style.width = `${percent}%`;
    progressText.textContent = text;
  }

  function hideProgress() {
    progressContainer.classList.remove('show');
  }

  async function convertRoster(file: File) {
    try {
      convertBtn.disabled = true;
      hideStatus();
      showProgress(20, 'Reading file...');

      // Read file
      const text = await file.text();
      showProgress(40, 'Parsing roster data...');

      // Detect file type and parse accordingly
      let rosterData: RosterData;
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      if (fileExtension === '.roz' || text.trim().startsWith('<?xml')) {
        // Parse XML (.roz) file
        rosterData = parseXMLRoster(text);
      } else {
        // Parse JSON file
        rosterData = JSON.parse(text);
      }

      showProgress(60, 'Optimizing structure...');

      // Convert to optimized format
      const optimizedArmy = optimizeWarhammerRoster(rosterData);
      showProgress(80, 'Calculating statistics...');

      // Calculate stats
      const stats = calculateStats(rosterData, optimizedArmy);

      // Display stats
      statsText.innerHTML = `
        <strong>Original size:</strong> ${formatFileSize(stats.originalSize)}<br>
        <strong>Optimized size:</strong> ${formatFileSize(stats.optimizedSize)}<br>
        <strong>Compression ratio:</strong> ${stats.compressionRatio.toFixed(2)}<br>
        <strong>Space saving:</strong> ${stats.spaceSaving.toFixed(1)}%
      `;
      statsDisplay.classList.add('show');

      showProgress(100, 'Complete!');

      // Store in localStorage
      localStorage.setItem('convertedArmy', JSON.stringify(optimizedArmy));

      setTimeout(() => {
        showStatus('success', 'Conversion successful! Redirecting to analysis tool...');

        // Redirect to main page after 1.5 seconds
        setTimeout(() => {
          window.location.href = 'index.html?from=converter';
        }, 1500);
      }, 500);

    } catch (error) {
      console.error('Conversion error:', error);
      showStatus('error', `Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      hideProgress();
      convertBtn.disabled = false;
    }
  }
});
