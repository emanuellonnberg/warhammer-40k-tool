// Remove the fs import since we're in the browser
// import * as fs from 'fs';

interface Weapon {
    id: string;
    name: string;
    type: string;
    characteristics: { [key: string]: string };
    count: number;
    models_with_weapon: number;
    base_name?: string;
    overcharge_mode?: string;
    is_one_time?: boolean;  // New property for one-time weapons
}

interface Unit {
    id: string;
    name: string;
    type: string;
    stats: {
        move: string;
        toughness: string;
        save: string;
        wounds: string;
        leadership: string;
        objectiveControl: string;
    };
    points: number;
    count: number;
    weapons: Weapon[];
    linked_weapons?: { [key: string]: { standard: string | null; overcharge: string | null } };
}

interface Army {
    armyName: string;
    faction: string;
    pointsTotal: number;
    units: Unit[];
}

// Helper function to parse numeric values from strings
function parseNumeric(value: string): number {
    if (!value) return 0;
    
    // Handle D6+X format
    if (value.startsWith('D6')) {
        const plusPart = value.split('+')[1];
        if (plusPart) {
            // For D6+X, use average of D6 (3.5) plus the bonus
            return 3.5 + parseFloat(plusPart);
        }
        // For plain D6, use average of 3.5
        return 3.5;
    }
    
    // Handle D3+X format
    if (value.startsWith('D3')) {
        const plusPart = value.split('+')[1];
        if (plusPart) {
            // For D3+X, use average of D3 (2) plus the bonus
            return 2 + parseFloat(plusPart);
        }
        // For plain D3, use average of 2
        return 2;
    }
    
    // Handle regular numeric values
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
}

// Helper function to parse damage values including special cases
function parseDamage(value: string): number {
    if (!value) return 0;
    
    // Handle D6+X format
    if (value.startsWith('D6')) {
        const plusPart = value.split('+')[1];
        if (plusPart) {
            // For D6+X, use average of D6 (3.5) plus the bonus
            return 3.5 + parseFloat(plusPart);
        }
        // For plain D6, use average of 3.5
        return 3.5;
    }
    
    // Handle D3+X format
    if (value.startsWith('D3')) {
        const plusPart = value.split('+')[1];
        if (plusPart) {
            // For D3+X, use average of D3 (2) plus the bonus
            return 2 + parseFloat(plusPart);
        }
        // For plain D3, use average of 2
        return 2;
    }
    
    // Handle regular numeric values
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
}

// Calculate weapon efficiency against a target
function calculateWeaponEfficiency(weapon: Weapon, targetToughness: number, useOvercharge: boolean = false, includeOneTimeWeapons: boolean = false): number {
    const chars = weapon.characteristics;
    
    // Get weapon stats with correct keys
    let strength = parseNumeric(chars.s || "0");
    let attacks = parseNumeric(chars.a || "0");
    let damage = parseDamage(chars.d || "0");
    let ap = parseNumeric(chars.ap || "0");
    
    // Check for overcharge mode
    if (useOvercharge && weapon.overcharge_mode) {
        const overchargeChars = weapon.overcharge_mode.split(',').reduce((acc, curr) => {
            const [key, value] = curr.trim().split(':').map(s => s.trim());
            acc[key] = value;
            return acc;
        }, {} as { [key: string]: string });
        
        // Update stats with overcharge values
        if (overchargeChars.s) strength = parseNumeric(overchargeChars.s);
        if (overchargeChars.d) damage = parseDamage(overchargeChars.d);
        if (overchargeChars.ap) ap = parseNumeric(overchargeChars.ap);
    }
    
    console.log(`Weapon ${weapon.name} stats:`, JSON.stringify({
        strength,
        attacks,
        damage,
        ap,
        count: weapon.count,
        characteristics: chars,
        rawDamage: chars.d,
        isOvercharge: useOvercharge
    }, null, 2));
    
    // Calculate hit chance based on BS
    const bs = chars.bs || "4+";
    let hitChance = 2/3; // Default to 4+
    if (bs === "2+") hitChance = 5/6;
    if (bs === "3+") hitChance = 2/3;
    if (bs === "4+") hitChance = 1/2;
    if (bs === "5+") hitChance = 1/3;
    if (bs === "6+") hitChance = 1/6;
    
    // Calculate wound chance
    let woundChance = 0;
    if (strength >= targetToughness * 2) {
        woundChance = 5/6; // 2+
    } else if (strength > targetToughness) {
        woundChance = 2/3; // 3+
    } else if (strength === targetToughness) {
        woundChance = 1/2; // 4+
    } else if (strength * 2 <= targetToughness) {
        woundChance = 1/6; // 6+
    } else {
        woundChance = 1/3; // 5+
    }
    
    // Calculate expected damage
    const expectedDamage = weapon.count * attacks * hitChance * woundChance * damage;
    
    // Calculate points per expected damage
    const basePoints = weapon.count * 5; // Assuming 5 points per weapon as a base
    const efficiency = expectedDamage / basePoints;
    
    console.log(`Weapon ${weapon.name} efficiency calculation:`, JSON.stringify({
        expectedDamage,
        basePoints,
        efficiency,
        woundChance,
        hitChance,
        targetToughness,
        strength,
        bs,
        rawDamage: chars.d,
        parsedDamage: damage,
        isOvercharge: useOvercharge
    }, null, 2));
    
    return efficiency;
}

// Helper function to check if a weapon is one-time use (like seeker missiles)
function isOneTimeWeapon(weapon: Weapon): boolean {
    // Debug logging for Longstrike's weapons
    if (weapon.name.includes("Longstrike") || weapon.name.includes("seeker") || weapon.name.includes("Seeker")) {
        console.log(`Checking potential one-time weapon: ${weapon.name}`, weapon);
    }
    
    // Check if explicitly marked as one-time
    if (weapon.is_one_time) return true;
    
    // Check weapon name with broader matching
    const oneTimeKeywords = [
        'seeker missile', 'seeker missiles', 
        'missile drone', 'missile drones',
        'one time', 'one-time', 
        'single-use', 'single use',
        'hunter-killer', 'hunter killer'
    ];
    
    // Normalize the weapon name for more reliable matching
    const lowerName = weapon.name.toLowerCase().trim();
    
    // Check weapon keywords - more careful handling of undefined
    const keywords = (weapon.characteristics?.keywords || '').toLowerCase();
    
    // Enhanced pattern matching
    for (const keyword of oneTimeKeywords) {
        if (lowerName.includes(keyword)) {
            console.log(`Found one-time weapon by name: ${weapon.name} (matched ${keyword})`);
            return true;
        }
        if (keywords && keywords.includes(keyword)) {
            console.log(`Found one-time weapon by keyword: ${weapon.name} (matched ${keyword})`);
            return true;
        }
    }
    
    // Special case for hammerhead gunships and Longstrike
    if ((lowerName.includes('hammerhead') || lowerName.includes('longstrike')) && 
        lowerName.includes('missile')) {
        console.log(`Found one-time missile weapon on special unit: ${weapon.name}`);
        return true;
    }
    
    return false;
}

// Calculate expected damage for a weapon
function calculateExpectedDamage(weapon: Weapon, targetToughness: number, useOvercharge: boolean = false, includeOneTimeWeapons: boolean = false): number {
    // Skip one-time weapons if not included
    if (isOneTimeWeapon(weapon) && !includeOneTimeWeapons) {
        return 0;
    }
    
    const chars = weapon.characteristics;
    
    // Get weapon stats with correct keys
    let strength = parseNumeric(chars.s || "0");
    let attacks = parseNumeric(chars.a || "0");
    let damage = parseDamage(chars.d || "0");
    let ap = parseNumeric(chars.ap || "0");
    
    // Check for overcharge mode
    if (useOvercharge && weapon.overcharge_mode) {
        console.log(`Using overcharge for ${weapon.name}`);
        const overchargeChars = weapon.overcharge_mode.split(',').reduce((acc, curr) => {
            const [key, value] = curr.trim().split(':').map(s => s.trim());
            acc[key] = value;
            return acc;
        }, {} as { [key: string]: string });
        
        // Update stats with overcharge values
        if (overchargeChars.s) strength = parseNumeric(overchargeChars.s);
        if (overchargeChars.d) damage = parseDamage(overchargeChars.d);
        if (overchargeChars.ap) ap = parseNumeric(overchargeChars.ap);
    }
    
    // Calculate hit chance based on BS
    const bs = chars.bs || "4+";
    let hitChance = 2/3; // Default to 4+
    if (bs === "2+") hitChance = 5/6;
    if (bs === "3+") hitChance = 2/3;
    if (bs === "4+") hitChance = 1/2;
    if (bs === "5+") hitChance = 1/3;
    if (bs === "6+") hitChance = 1/6;
    
    // Calculate wound chance
    let woundChance = 0;
    if (strength >= targetToughness * 2) {
        woundChance = 5/6; // 2+
    } else if (strength > targetToughness) {
        woundChance = 2/3; // 3+
    } else if (strength === targetToughness) {
        woundChance = 1/2; // 4+
    } else if (strength * 2 <= targetToughness) {
        woundChance = 1/6; // 6+
    } else {
        woundChance = 1/3; // 5+
    }
    
    // Calculate expected damage
    return weapon.count * attacks * hitChance * woundChance * damage;
}

// Helper function to determine weapon type
function getWeaponType(weapon: Weapon): 'ranged' | 'melee' | 'pistol' {
    const type = weapon.type.toLowerCase();
    if (type.includes('pistol')) return 'pistol';
    if (type.includes('melee')) return 'melee';
    return 'ranged';
}

// Calculate total damage for a unit
function calculateUnitDamage(unit: Unit, targetToughness: number, useOvercharge: boolean = false, activeModes?: Map<string, number>, includeOneTimeWeapons: boolean = false): {
    total: number;
    ranged: number;
    melee: number;
    pistol: number;
    onetime: number; // New property to track one-time weapon damage
} {
    console.log(`Calculating unit damage with overcharge: ${useOvercharge}, includeOneTime: ${includeOneTimeWeapons}`);
    const damages = {
        total: 0,
        ranged: 0,
        melee: 0,
        pistol: 0,
        onetime: 0
    };

    // Group weapons by base name to handle standard/overcharge variants
    const weaponGroups = new Map<string, Weapon[]>();
    unit.weapons.forEach(weapon => {
        const baseName = weapon.base_name || weapon.name.replace(' - standard', '').replace(' - overcharge', '');
        if (!weaponGroups.has(baseName)) {
            weaponGroups.set(baseName, []);
        }
        weaponGroups.get(baseName)!.push(weapon);
    });

    // Check if unit has ranged weapons
    const hasRangedWeapons = Array.from(weaponGroups.values()).some(weapons => {
        const weapon = weapons[0];
        return getWeaponType(weapon) === 'ranged' && (!isOneTimeWeapon(weapon) || includeOneTimeWeapons);
    });

    // Calculate damage for each weapon group
    weaponGroups.forEach((weapons, baseName) => {
        // Skip if there's no weapon
        if (weapons.length === 0) return;
        
        // Handle standard/overcharge weapons
        const standardWeapon = weapons.find(w => w.name.includes('standard') || !w.name.includes('overcharge'));
        const overchargeWeapon = weapons.find(w => w.name.includes('overcharge'));
        
        if (standardWeapon && overchargeWeapon) {
            // Use overcharge weapon if toggled, otherwise use standard
            const activeWeapon = useOvercharge ? overchargeWeapon : standardWeapon;
            const weaponType = getWeaponType(activeWeapon);
            
            // Skip pistols if there are other ranged weapons
            if (weaponType === 'pistol' && hasRangedWeapons) return;
            
            const damage = calculateExpectedDamage(activeWeapon, targetToughness, useOvercharge, includeOneTimeWeapons);
            
            // Track one-time weapon damage separately
            if (isOneTimeWeapon(activeWeapon) && includeOneTimeWeapons) {
                damages.onetime += damage;
            }
            
            damages[weaponType] += damage;
            damages.total += damage;
        }
        // Handle weapons with multiple modes (like Dawn Blade)
        else if (weapons.length > 1 && activeModes) {
            // Get the active weapon based on the toggle state
            const activeMode = activeModes.get(baseName) || 0;
            const activeWeapon = weapons[activeMode];
            const weaponType = getWeaponType(activeWeapon);
            
            // Skip pistols if there are other ranged weapons
            if (weaponType === 'pistol' && hasRangedWeapons) return;
            
            const damage = calculateExpectedDamage(activeWeapon, targetToughness, useOvercharge, includeOneTimeWeapons);
            
            // Track one-time weapon damage separately
            if (isOneTimeWeapon(activeWeapon) && includeOneTimeWeapons) {
                damages.onetime += damage;
            }
            
            damages[weaponType] += damage;
            damages.total += damage;
        }
        // Regular weapon
        else {
            const weapon = weapons[0];
            const weaponType = getWeaponType(weapon);
            
            // Skip pistols if there are other ranged weapons
            if (weaponType === 'pistol' && hasRangedWeapons) return;
            
            const damage = calculateExpectedDamage(weapon, targetToughness, useOvercharge, includeOneTimeWeapons);
            
            // Track one-time weapon damage separately
            if (isOneTimeWeapon(weapon) && includeOneTimeWeapons) {
                damages.onetime += damage;
            }
            
            damages[weaponType] += damage;
            damages.total += damage;
        }
    });

    return damages;
}

// Calculate unit efficiency
function calculateUnitEfficiency(unit: Unit, targetToughness: number, useOvercharge: boolean = false, includeOneTimeWeapons: boolean = false): number {
    let totalEfficiency = 0;
    let weaponCount = 0;
    
    console.log(`\nAnalyzing unit: ${unit.name}`, JSON.stringify({
        points: unit.points,
        count: unit.count,
        stats: unit.stats,
        isOvercharge: useOvercharge
    }, null, 2));
    
    // Calculate efficiency for each weapon
    for (const weapon of unit.weapons) {
        const weaponEfficiency = calculateWeaponEfficiency(weapon, targetToughness, useOvercharge, includeOneTimeWeapons);
        totalEfficiency += weaponEfficiency;
        weaponCount++;
    }
    
    // Normalize by unit points and number of weapons
    const averageEfficiency = weaponCount > 0 ? totalEfficiency / weaponCount : 0;
    const normalizedEfficiency = averageEfficiency * (unit.points / 100); // Normalize to 100 points
    
    console.log(`Unit ${unit.name} efficiency calculation:`, JSON.stringify({
        totalEfficiency,
        weaponCount,
        averageEfficiency,
        normalizedEfficiency,
        points: unit.points,
        targetToughness,
        isOvercharge: useOvercharge
    }, null, 2));
    
    return normalizedEfficiency;
}

// Get efficiency class for styling
function getEfficiencyClass(efficiency: number): string {
    if (efficiency > 0.3) return 'high-efficiency';
    if (efficiency > 0.1) return 'medium-efficiency';
    return 'low-efficiency';
}

// Global variables to track current sort state
let currentSortColumn: string = 'efficiency'; // Default sort column
let currentSortDirection: 'asc' | 'desc' = 'desc'; // Default sort direction

// Display analysis results in the HTML
function displayAnalysisResults(army: Army, targetToughness: number, useOvercharge: boolean = false, activeWeaponModes?: Map<string, Map<string, number>>, includeOneTimeWeapons: boolean = false) {
    console.log(`Displaying analysis with overcharge: ${useOvercharge}, includeOneTime: ${includeOneTimeWeapons}`);
    const resultsDiv = document.getElementById('analysis-results');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '';

    // Create a map to store active weapon modes for each unit if not provided
    const weaponModes = activeWeaponModes || new Map<string, Map<string, number>>();

    // Sort units by current sorting criteria
    const sortedUnits = [...army.units].sort((a, b) => {
        let aValue, bValue;
        
        switch (currentSortColumn) {
            case 'name':
                aValue = a.name;
                bValue = b.name;
                return currentSortDirection === 'asc' 
                    ? String(aValue).localeCompare(String(bValue))
                    : String(bValue).localeCompare(String(aValue));
            case 'points':
                aValue = a.points;
                bValue = b.points;
                break;
            case 'efficiency':
                aValue = calculateUnitEfficiency(a, targetToughness, useOvercharge, includeOneTimeWeapons);
                bValue = calculateUnitEfficiency(b, targetToughness, useOvercharge, includeOneTimeWeapons);
                break;
            case 'dpp':
                aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons).total / a.points;
                bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons).total / b.points;
                break;
            case 'rangeddpp':
                aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons).ranged / a.points;
                bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons).ranged / b.points;
                break;
            case 'meleedpp':
                aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons).melee / a.points;
                bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons).melee / b.points;
                break;
            case 'ranged':
                aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons).ranged;
                bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons).ranged;
                break;
            case 'melee':
                aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons).melee;
                bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons).melee;
                break;
            case 'pistol':
                aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons).pistol;
                bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons).pistol;
                break;
            case 'onetime':
                aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons).onetime;
                bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons).onetime;
                break;
            default:
                aValue = calculateUnitEfficiency(a, targetToughness, useOvercharge, includeOneTimeWeapons);
                bValue = calculateUnitEfficiency(b, targetToughness, useOvercharge, includeOneTimeWeapons);
        }
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
            return currentSortDirection === 'asc' 
                ? String(aValue).localeCompare(String(bValue))
                : String(bValue).localeCompare(String(aValue));
        }
        
        return currentSortDirection === 'asc' 
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number);
    });

    // Create summary table with additional column for one-time weapon damage
    const summaryTable = document.createElement('div');
    summaryTable.className = 'card mb-4';
    summaryTable.innerHTML = `
        <div class="card-body">
            <h5 class="card-title">Unit Summary</h5>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th class="sortable" data-sort="name">Unit</th>
                            <th class="sortable" data-sort="points">Points</th>
                            <th class="sortable" data-sort="efficiency">Efficiency</th>
                            <th class="sortable" data-sort="dpp">Total D/Point</th>
                            <th class="sortable" data-sort="rangeddpp">Ranged D/Point</th>
                            <th class="sortable" data-sort="meleedpp">Melee D/Point</th>
                            <th class="sortable" data-sort="ranged">Ranged</th>
                            <th class="sortable" data-sort="melee">Melee</th>
                            <th class="sortable" data-sort="pistol">Pistol</th>
                            ${includeOneTimeWeapons ? '<th class="sortable" data-sort="onetime">One-Time</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedUnits.map(unit => {
                            // Initialize active weapon modes for this unit
                            const unitModes = new Map<string, number>();
                            weaponModes.set(unit.id, unitModes);

                            // Group weapons by base name
                            const weaponGroups = new Map<string, Weapon[]>();
                            unit.weapons.forEach(weapon => {
                                const baseName = weapon.base_name || weapon.name.replace(' - standard', '').replace(' - overcharge', '');
                                if (!weaponGroups.has(baseName)) {
                                    weaponGroups.set(baseName, []);
                                }
                                weaponGroups.get(baseName)!.push(weapon);
                            });

                            // Set initial active modes
                            weaponGroups.forEach((weapons, baseName) => {
                                if (weapons.length > 1) {
                                    unitModes.set(baseName, 0); // Default to first mode
                                }
                            });

                            const efficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons);
                            const damage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons);
                            const damagePerPoint = damage.total / unit.points;
                            const rangedDamagePerPoint = damage.ranged / unit.points;
                            const meleeDamagePerPoint = damage.melee / unit.points;
                            return `
                                <tr data-unit-id="${unit.id}" 
                                    data-name="${unit.name}"
                                    data-points="${unit.points}"
                                    data-efficiency="${efficiency}"
                                    data-dpp="${damagePerPoint}"
                                    data-rangeddpp="${rangedDamagePerPoint}"
                                    data-meleedpp="${meleeDamagePerPoint}"
                                    data-ranged="${damage.ranged}"
                                    data-melee="${damage.melee}"
                                    data-pistol="${damage.pistol}"
                                    ${includeOneTimeWeapons ? `data-onetime="${damage.onetime}"` : ''}>
                                    <td><a href="#unit-${unit.id}" class="unit-link">${unit.name}</a></td>
                                    <td>${unit.points}</td>
                                    <td class="${getEfficiencyClass(efficiency)}">${efficiency.toFixed(3)}</td>
                                    <td class="${getEfficiencyClass(damagePerPoint)}">${damagePerPoint.toFixed(3)}</td>
                                    <td class="${getEfficiencyClass(rangedDamagePerPoint)}">${rangedDamagePerPoint.toFixed(3)}</td>
                                    <td class="${getEfficiencyClass(meleeDamagePerPoint)}">${meleeDamagePerPoint.toFixed(3)}</td>
                                    <td>${damage.ranged.toFixed(1)}</td>
                                    <td>${damage.melee.toFixed(1)}</td>
                                    <td>${damage.pistol.toFixed(1)}</td>
                                    ${includeOneTimeWeapons ? `<td>${damage.onetime.toFixed(1)}</td>` : ''}
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    resultsDiv.appendChild(summaryTable);

    // Add sorting functionality
    const table = summaryTable.querySelector('table');
    if (table) {
        const headers = table.querySelectorAll('th.sortable');
        
        // Add sort indicators to headers based on current sort
        headers.forEach(header => {
            const sortBy = header.getAttribute('data-sort');
            if (sortBy === currentSortColumn) {
                header.setAttribute('data-direction', currentSortDirection);
                header.textContent = (header.textContent || '').replace(/[↑↓]$/, '') + (currentSortDirection === 'asc' ? ' ↑' : ' ↓');
            }
        });
        
        // Add click handlers
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortBy = header.getAttribute('data-sort');
                if (!sortBy) return;

                const tbody = table.querySelector('tbody');
                if (!tbody) return;

                // If already sorting by this column, toggle direction
                if (sortBy === currentSortColumn) {
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    // New column, default to descending for most columns and ascending for name
                    currentSortColumn = sortBy;
                    currentSortDirection = sortBy === 'name' ? 'asc' : 'desc';
                }

                // Update sort direction indicators
                headers.forEach(h => {
                    h.textContent = (h.textContent || '').replace(/[↑↓]$/, '');
                    h.removeAttribute('data-direction');
                });
                
                header.textContent = (header.textContent || '').replace(/[↑↓]$/, '') + (currentSortDirection === 'asc' ? ' ↑' : ' ↓');
                header.setAttribute('data-direction', currentSortDirection);

                // Sort rows
                const rows = Array.from(tbody.querySelectorAll('tr'));
                rows.sort((a, b) => {
                    const aValue = a.getAttribute(`data-${sortBy}`);
                    const bValue = b.getAttribute(`data-${sortBy}`);
                    
                    if (!aValue || !bValue) return 0;
                    
                    if (sortBy === 'name') {
                        return currentSortDirection === 'asc' 
                            ? String(aValue).localeCompare(String(bValue))
                            : String(bValue).localeCompare(String(aValue));
                    }
                    
                    const aNum = parseFloat(aValue);
                    const bNum = parseFloat(bValue);
                    
                    return currentSortDirection === 'asc' 
                        ? aNum - bNum
                        : bNum - aNum;
                });

                // Reorder rows
                rows.forEach(row => tbody.appendChild(row));

                // Update the page URL with the sort state (optional)
                // window.history.replaceState(null, '', `?sort=${sortBy}&dir=${currentSortDirection}`);
            });
        });
    }

    // Create unit cards
    for (const unit of sortedUnits) {
        const unitEfficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons);
        const unitModes = weaponModes.get(unit.id);
        const unitDamage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons);
        const damagePerPoint = unitDamage.total / unit.points;
        const rangedDamagePerPoint = unitDamage.ranged / unit.points;
        const meleeDamagePerPoint = unitDamage.melee / unit.points;
        const unitCard = document.createElement('div');
        unitCard.className = 'card unit-card';
        unitCard.setAttribute('data-unit-id', unit.id);
        unitCard.id = `unit-${unit.id}`;
        
        // Group weapons by base name to handle standard/overcharge variants
        const weaponGroups = new Map<string, Weapon[]>();
        unit.weapons.forEach(weapon => {
            const baseName = weapon.base_name || weapon.name.replace(' - standard', '').replace(' - overcharge', '');
            if (!weaponGroups.has(baseName)) {
                weaponGroups.set(baseName, []);
            }
            weaponGroups.get(baseName)!.push(weapon);
        });

        // Store weapon groups in the unit card for later use
        unitCard.setAttribute('data-weapon-groups', JSON.stringify(Array.from(weaponGroups.entries())));
        
        unitCard.innerHTML = `
            <div class="card-body">
                <h5 class="card-title">${unit.name}</h5>
                <p class="card-text">
                    Points: ${unit.points}
                </p>
                <p class="card-text">
                    Overall Efficiency: 
                    <span class="efficiency-value ${getEfficiencyClass(unitEfficiency)}">
                        ${unitEfficiency.toFixed(3)}
                    </span>
                </p>
                <p class="card-text">
                    Total Damage: 
                    <span class="damage-value">
                        ${unitDamage.total.toFixed(1)}
                    </span>
                    <br>
                    <small class="text-muted">
                        Damage per Point: 
                        <span class="efficiency-value ${getEfficiencyClass(damagePerPoint)}">
                            ${damagePerPoint.toFixed(3)}
                        </span>
                        <br>
                        Ranged D/Point: 
                        <span class="efficiency-value ${getEfficiencyClass(rangedDamagePerPoint)}">
                            ${rangedDamagePerPoint.toFixed(3)}
                        </span>
                        <br>
                        Melee D/Point: 
                        <span class="efficiency-value ${getEfficiencyClass(meleeDamagePerPoint)}">
                            ${meleeDamagePerPoint.toFixed(3)}
                        </span>
                    </small>
                    <br>
                    <small class="text-muted">
                        Ranged: ${unitDamage.ranged.toFixed(1)} | 
                        Melee: ${unitDamage.melee.toFixed(1)} | 
                        Pistol: ${unitDamage.pistol.toFixed(1)}
                        ${includeOneTimeWeapons && unitDamage.onetime > 0 ? `| One-Time: ${unitDamage.onetime.toFixed(1)}` : ''}
                    </small>
                </p>
                <div class="weapon-list">
                    <h6>Weapons:</h6>
                    ${Array.from(weaponGroups.entries()).map(([baseName, weapons], index) => {
                        // Skip weapons that should be excluded based on settings
                        if (!includeOneTimeWeapons && weapons.some(w => isOneTimeWeapon(w))) {
                            return '';  // Skip one-time weapons when not included
                        }
                        
                        // Find standard and overcharge variants
                        const standardWeapon = weapons.find(w => w.name.includes('standard') || !w.name.includes('overcharge'));
                        const overchargeWeapon = weapons.find(w => w.name.includes('overcharge'));
                        
                        if (standardWeapon && overchargeWeapon) {
                            // Weapon has standard/overcharge modes
                            const standardEfficiency = calculateWeaponEfficiency(standardWeapon, targetToughness, false, includeOneTimeWeapons);
                            const overchargeEfficiency = calculateWeaponEfficiency(overchargeWeapon, targetToughness, true, includeOneTimeWeapons);
                            const standardDamage = calculateExpectedDamage(standardWeapon, targetToughness, false, includeOneTimeWeapons);
                            const overchargeDamage = calculateExpectedDamage(overchargeWeapon, targetToughness, true, includeOneTimeWeapons);
                            const weaponType = getWeaponType(standardWeapon);
                            const isOneTime = isOneTimeWeapon(standardWeapon);
                            
                            return `
                                <div class="weapon-entry" data-weapon-type="overcharge" data-base-name="${baseName}">
                                    <p class="mb-1">
                                        ${baseName} (${standardWeapon.count}) 
                                        <span class="weapon-type ${weaponType}">[${weaponType}]</span>
                                        ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}:
                                        <br>
                                        <span class="${!useOvercharge ? 'active-mode' : 'inactive-mode'}">
                                            Standard: 
                                            <span class="efficiency-value ${getEfficiencyClass(standardEfficiency)}">
                                                ${standardEfficiency.toFixed(3)}
                                            </span>
                                            <span class="damage-value">
                                                (${standardDamage.toFixed(1)} dmg)
                                            </span>
                                        </span>
                                        <br>
                                        <span class="${useOvercharge ? 'active-mode' : 'inactive-mode'}">
                                            Overcharge: 
                                            <span class="efficiency-value ${getEfficiencyClass(overchargeEfficiency)}">
                                                ${overchargeEfficiency.toFixed(3)}
                                            </span>
                                            <span class="damage-value">
                                                (${overchargeDamage.toFixed(1)} dmg)
                                            </span>
                                        </span>
                                    </p>
                                </div>
                            `;
                        } else if (weapons.length > 1) {
                            // Weapon has multiple modes (like Dawn Blade)
                            const weaponId = `weapon-${unit.id}-${index}`;
                            const weaponType = getWeaponType(weapons[0]);
                            const activeMode = unitModes?.get(baseName) || 0;
                            const isOneTime = isOneTimeWeapon(weapons[0]);
                            
                            return `
                                <div class="weapon-entry" data-weapon-type="multi" data-unit-id="${unit.id}" data-weapon-index="${index}" data-base-name="${baseName}">
                                    <p class="mb-1">
                                        ${baseName} (${weapons[0].count})
                                        <span class="weapon-type ${weaponType}">[${weaponType}]</span>
                                        ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}:
                                        <div class="form-check form-switch">
                                            <input class="form-check-input weapon-mode-toggle" type="checkbox" 
                                                   id="${weaponId}" data-unit-id="${unit.id}" data-weapon-index="${index}"
                                                   ${activeMode === 1 ? 'checked' : ''}>
                                            <label class="form-check-label" for="${weaponId}">Toggle Mode</label>
                                        </div>
                                        <div class="weapon-modes">
                                            ${weapons.map((weapon, modeIndex) => {
                                                const efficiency = calculateWeaponEfficiency(weapon, targetToughness, false, includeOneTimeWeapons);
                                                const damage = calculateExpectedDamage(weapon, targetToughness, false, includeOneTimeWeapons);
                                                const modeName = weapon.name.replace(baseName, '').replace(/^[ -]+/, '') || 'Mode ' + (modeIndex + 1);
                                                return `
                                                    <span class="weapon-mode ${modeIndex === activeMode ? 'active-mode' : 'inactive-mode'}" 
                                                          data-mode-index="${modeIndex}">
                                                        ${modeName}: 
                                                        <span class="efficiency-value ${getEfficiencyClass(efficiency)}">
                                                            ${efficiency.toFixed(3)}
                                                        </span>
                                                        <span class="damage-value">
                                                            (${damage.toFixed(1)} dmg)
                                                        </span>
                                                    </span>
                                                `;
                                            }).join('<br>')}
                                        </div>
                                    </p>
                                </div>
                            `;
                        } else {
                            // Regular weapon
                            const weapon = weapons[0];
                            const efficiency = calculateWeaponEfficiency(weapon, targetToughness, false, includeOneTimeWeapons);
                            const damage = calculateExpectedDamage(weapon, targetToughness, false, includeOneTimeWeapons);
                            const weaponType = getWeaponType(weapon);
                            const isOneTime = isOneTimeWeapon(weapon);
                            
                            return `
                                <p class="mb-1">
                                    ${baseName} (${weapon.count})
                                    <span class="weapon-type ${weaponType}">[${weaponType}]</span>
                                    ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}: 
                                    <span class="efficiency-value ${getEfficiencyClass(efficiency)}">
                                        ${efficiency.toFixed(3)}
                                    </span>
                                    <span class="damage-value">
                                        (${damage.toFixed(1)} dmg)
                                    </span>
                                </p>
                            `;
                        }
                    }).join('')}
                </div>
            </div>
        `;
        
        resultsDiv.appendChild(unitCard);
    }

    // Add event listeners for weapon mode toggles
    document.querySelectorAll('.weapon-mode-toggle').forEach(toggle => {
        toggle.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            const unitId = target.dataset.unitId;
            const weaponIndex = parseInt(target.dataset.weaponIndex || '0');
            const weaponEntry = target.closest('.weapon-entry');
            
            if (!weaponEntry || !unitId) return;
            
            const baseName = weaponEntry.getAttribute('data-base-name');
            if (!baseName) return;
            
            const modes = Array.from(weaponEntry.querySelectorAll('.weapon-mode'));
            if (modes.length < 2) return;
            
            // Find the unit
            const unit = army.units.find(u => u.id === unitId);
            if (!unit) return;
            
            // Get unit modes
            const unitModes = weaponModes.get(unitId);
            if (!unitModes) return;
            
            // Update active mode
            const newMode = target.checked ? 1 : 0;
            unitModes.set(baseName, newMode);
            console.log(`Updated weapon mode for ${baseName} to ${newMode}`);
            
            // Update visual state
            modes.forEach((mode, index) => {
                mode.classList.toggle('active-mode', index === newMode);
                mode.classList.toggle('inactive-mode', index !== newMode);
            });
            
            // Recalculate damage with updated modes
            const efficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons);
            const damage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons);
            const damagePerPoint = damage.total / unit.points;
            const rangedDamagePerPoint = damage.ranged / unit.points;
            const meleeDamagePerPoint = damage.melee / unit.points;
            
            console.log(`Recalculated damage for ${unit.name}:`, damage);
            
            // Update the unit's row in the summary table
            const unitRow = document.querySelector(`tr[data-unit-id="${unitId}"]`);
            if (unitRow) {
                unitRow.innerHTML = `
                    <td><a href="#unit-${unit.id}" class="unit-link">${unit.name}</a></td>
                    <td>${unit.points}</td>
                    <td class="${getEfficiencyClass(efficiency)}">${efficiency.toFixed(3)}</td>
                    <td class="${getEfficiencyClass(damagePerPoint)}">${damagePerPoint.toFixed(3)}</td>
                    <td class="${getEfficiencyClass(rangedDamagePerPoint)}">${rangedDamagePerPoint.toFixed(3)}</td>
                    <td class="${getEfficiencyClass(meleeDamagePerPoint)}">${meleeDamagePerPoint.toFixed(3)}</td>
                    <td>${damage.ranged.toFixed(1)}</td>
                    <td>${damage.melee.toFixed(1)}</td>
                    <td>${damage.pistol.toFixed(1)}</td>
                    ${includeOneTimeWeapons ? `<td>${damage.onetime.toFixed(1)}</td>` : ''}
                `;
                
                // Update data attributes for sorting
                unitRow.setAttribute('data-dpp', damagePerPoint.toString());
                unitRow.setAttribute('data-rangeddpp', rangedDamagePerPoint.toString());
                unitRow.setAttribute('data-meleedpp', meleeDamagePerPoint.toString());
                unitRow.setAttribute('data-ranged', damage.ranged.toString());
                unitRow.setAttribute('data-melee', damage.melee.toString());
                unitRow.setAttribute('data-pistol', damage.pistol.toString());
            }
            
            // Update the unit card
            const unitCard = document.querySelector(`.unit-card[data-unit-id="${unitId}"]`);
            if (unitCard) {
                const totalDamageSpan = unitCard.querySelector('.card-text .damage-value');
                const efficiencySpan = unitCard.querySelector('.card-text .efficiency-value');
                const dppSpans = unitCard.querySelectorAll('.text-muted .efficiency-value');
                
                if (totalDamageSpan) totalDamageSpan.textContent = damage.total.toFixed(1);
                if (efficiencySpan) efficiencySpan.textContent = efficiency.toFixed(3);
                
                if (dppSpans.length >= 3) {
                    dppSpans[0].textContent = damagePerPoint.toFixed(3);
                    dppSpans[1].textContent = rangedDamagePerPoint.toFixed(3);
                    dppSpans[2].textContent = meleeDamagePerPoint.toFixed(3);
                }
                
                // Update damage breakdown
                const damageBreakdown = unitCard.querySelector('.text-muted:last-of-type');
                if (damageBreakdown) {
                    damageBreakdown.innerHTML = `
                        Ranged: ${damage.ranged.toFixed(1)} | 
                        Melee: ${damage.melee.toFixed(1)} | 
                        Pistol: ${damage.pistol.toFixed(1)}
                    `;
                }
            }
        });
    });
}

// Main function
async function main() {
    try {
        // Get UI elements
        const toughnessSelect = document.getElementById('toughness') as HTMLSelectElement;
        const overchargeToggle = document.getElementById('overchargeToggle') as HTMLInputElement;
        const oneTimeWeaponsToggle = document.getElementById('oneTimeWeaponsToggle') as HTMLInputElement;
        const armyFileSelect = document.getElementById('armyFile') as HTMLSelectElement;
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        
        if (!toughnessSelect || !overchargeToggle || !oneTimeWeaponsToggle || !armyFileSelect || !dropZone || !fileInput) {
            throw new Error('Could not find required UI elements');
        }

        let currentArmy: Army | null = null;
        let activeWeaponModes: Map<string, Map<string, number>> = new Map();

        // Function to load and parse army data
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

            console.log('Raw army data:', armyData.substring(0, 200) + '...');
            const army: Army = JSON.parse(armyData);
            console.log('Parsed army data:', {
                name: army.armyName,
                faction: army.faction,
                unitCount: army.units.length
            });
            
            // Debug log for Longstrike
            const longstrike = army.units.find(unit => unit.name.includes('Longstrike'));
            if (longstrike) {
                console.log('Found Longstrike:', longstrike);
                console.log('Longstrike weapons:', longstrike.weapons.map(weapon => ({
                    name: weapon.name,
                    characteristics: weapon.characteristics,
                    count: weapon.count
                })));
                
                // Test each weapon against our detection
                longstrike.weapons.forEach(weapon => {
                    console.log(`Is "${weapon.name}" a one-time weapon? ${isOneTimeWeapon(weapon)}`);
                });
            }
            
            return army;
        }

        // Function to update display
        const updateDisplay = () => {
            if (currentArmy) {
                // Reset active weapon modes when updating display
                activeWeaponModes = new Map();
                displayAnalysisResults(
                    currentArmy, 
                    parseInt(toughnessSelect.value), 
                    overchargeToggle.checked, 
                    activeWeaponModes,
                    oneTimeWeaponsToggle.checked
                );
            }
        };

        // Handle dropdown selection
        armyFileSelect.addEventListener('change', async () => {
            try {
                currentArmy = await loadArmyData(armyFileSelect.value);
                updateDisplay();
            } catch (error) {
                console.error('Error loading army file:', error);
                alert('Error loading army file. Please check the console for details.');
            }
        });

        // Handle drag and drop
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
                const file = files[0];
                if (file.type === 'application/json' || file.name.endsWith('.json')) {
                    try {
                        currentArmy = await loadArmyData(file);
                        updateDisplay();
                    } catch (error) {
                        console.error('Error loading dropped file:', error);
                        alert('Error loading file. Please check the console for details.');
                    }
                } else {
                    alert('Please drop a JSON file.');
                }
            }
        });

        // Handle click to select file
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                try {
                    currentArmy = await loadArmyData(files[0]);
                    updateDisplay();
                } catch (error) {
                    console.error('Error loading selected file:', error);
                    alert('Error loading file. Please check the console for details.');
                }
            }
        });

        // Add event listeners for analysis parameters
        toughnessSelect.addEventListener('change', updateDisplay);
        overchargeToggle.addEventListener('change', () => {
            console.log(`Overcharge toggle changed to: ${overchargeToggle.checked}`);
            updateDisplay();
        });
        oneTimeWeaponsToggle.addEventListener('change', () => {
            console.log(`One-time weapons toggle changed to: ${oneTimeWeaponsToggle.checked}`);
            updateDisplay();
        });

        // Load initial army data
        try {
            currentArmy = await loadArmyData(armyFileSelect.value);
            updateDisplay();
        } catch (error) {
            console.error('Error loading initial army data:', error);
            const resultsDiv = document.getElementById('analysis-results');
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div class="alert alert-danger">
                        <h4>Error loading army data</h4>
                        <p>${error}</p>
                        <p>Please check the browser console (F12) for more details.</p>
                    </div>
                `;
            }
        }
        
    } catch (error) {
        console.error('Error initializing application:', error);
        const resultsDiv = document.getElementById('analysis-results');
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h4>Error initializing application</h4>
                    <p>${error}</p>
                    <p>Please check the browser console (F12) for more details.</p>
                </div>
            `;
        }
    }
}

// Start the application
main(); 