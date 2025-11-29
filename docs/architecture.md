# 40K Unit Efficiency Analyzer - Architecture

## Application Structure

```
┌─────────────────────────────────────────────────────────────┐
│                     40K Analyzer Suite                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Analyzer   │  │ Battle Sim   │  │  Converter   │     │
│  │ index.html   │  │battle-sim.html│  │converter.html│     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         ├──────────────────┼──────────────────┤              │
│         │     Shared State Management         │              │
│         │   (localStorage + app-state.ts)     │              │
│         └──────────────────┬──────────────────┘              │
│                            │                                 │
│              ┌─────────────┴─────────────┐                  │
│              │   Core Simulation Engine   │                  │
│              │    src/simulation/         │                  │
│              └───────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

## Page Responsibilities

### 🎯 **Analyzer (index.html)**
**Purpose:** Unit efficiency analysis and comparison
- Load and analyze army rosters
- Calculate damage per point
- Compare unit effectiveness
- Configure leader attachments
- View weapon statistics

**Key Files:**
- `index.html` - Main UI
- `src/main.ts` - Entry point
- `src/ui/` - Analysis rendering
- `src/calculators/` - Damage math

---

### ⚔️ **Battle Simulator (battle-sim.html)**
**Purpose:** Tactical battle simulation
- Select two armies
- Configure battle parameters
- Run turn-by-turn simulation
- Visualize battlefield
- Track damage and casualties

**Key Files:**
- `battle-sim.html` - Simulator UI
- `src/battle-sim.ts` - Entry point
- `src/sim-ui/` - Battlefield rendering
- `src/simulation/` - Simulation engine

---

### 📄 **Converter (converter.html)**
**Purpose:** Roster format conversion
- Upload .roz or .json files
- Convert BattleScribe rosters
- Optimize for analyzer
- Auto-navigate to analyzer

**Key Files:**
- `converter.html` - Converter UI
- `src/converter.ts` - Entry point
- XML/JSON parsing

---

## State Management Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     localStorage                             │
│                  'w40k_app_state'                            │
│                                                              │
│  {                                                           │
│    version: 1,                                               │
│    data: {                                                   │
│      currentArmy: {...},          ← Main army               │
│      opponentArmy: {...},         ← For battle sim          │
│      leaderAttachments: {...},    ← Leader configurations   │
│      preferences: {...},          ← User settings           │
│      battleSimConfig: {...},      ← Sim parameters          │
│      lastPage: 'analyzer'         ← Navigation tracking     │
│    }                                                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
           ▲                    ▲                    ▲
           │                    │                    │
    ┌──────┴──────┐      ┌─────┴──────┐      ┌─────┴──────┐
    │  Analyzer   │      │ Battle Sim │      │ Converter  │
    │  Reads on   │      │ Reads on   │      │ Writes on  │
    │  page load  │      │ page load  │      │ convert    │
    │  Writes on  │      │ Writes on  │      │           │
    │  army change│      │ config chg │      │           │
    └─────────────┘      └────────────┘      └────────────┘
```

## Data Flow Examples

### Example 1: Load Army → Simulate

```
User Action: Load T'au army, click "Battle Simulator"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. index.html
   └─> loadArmyData('tau_800.json')
   └─> saveCurrentArmy(tauArmy, attachments)
        └─> localStorage.setItem('w40k_app_state', ...)

2. User clicks "Battle Simulator" button
   └─> openBattleSimulator(tauArmy, tauArmy, ...)
        └─> saveAppState({ currentArmy, opponentArmy, ... })
        └─> window.location.href = 'battle-sim.html'

3. battle-sim.html loads
   └─> loadAppState()
        └─> localStorage.getItem('w40k_app_state')
   └─> armyA = state.currentArmy  // T'au auto-loaded!
   └─> armyB = state.opponentArmy // T'au auto-loaded!
   └─> displayArmyInfo(armyA, 'armyAInfo')
   └─> Ready to simulate ✓
```

### Example 2: Convert Roster → Analyze → Simulate

```
User Action: Upload .roz file
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. converter.html
   └─> parseXMLRoster(file)
   └─> convertToOptimizedFormat(roster)
   └─> localStorage.setItem('convertedArmy', JSON.stringify(army))
   └─> window.location.href = 'index.html?from=converter'

2. index.html loads
   └─> urlParams.get('from') === 'converter' ✓
   └─> currentArmy = JSON.parse(localStorage.getItem('convertedArmy'))
   └─> saveCurrentArmy(currentArmy, ...)  // Now in state!
   └─> localStorage.removeItem('convertedArmy')  // Clean up
   └─> Display success message

3. User clicks "Battle Simulator"
   └─> Converted army is in state, flows to battle sim seamlessly
```

## Core Systems

### 🎲 **Simulation Engine** (`src/simulation/`)

```
simple-engagement.ts
├─> Initialize armies with 2D positions
├─> Classify unit roles (gunline, melee-missile, etc.)
├─> For each turn:
│   ├─> Movement Phase
│   │   └─> Units move toward optimal range
│   ├─> Shooting Phase
│   │   └─> Calculate expected damage
│   ├─> Charge Phase
│   │   └─> Melee units attempt charges
│   └─> Fight Phase
│       └─> Calculate melee damage
├─> Track casualties and update positions
└─> Return SimulationResult
```

### 📊 **Damage Calculations** (`src/calculators/`)

```
damage.ts
├─> calculateWeaponDamage()
│   ├─> Parse weapon stats (A, S, AP, D)
│   ├─> Calculate hit chance (with re-rolls)
│   ├─> Calculate wound chance (with re-rolls)
│   ├─> Apply special rules (Sustained Hits, Lethal Hits, etc.)
│   ├─> Calculate save/invuln/FNP
│   └─> Return expected damage
└─> calculateUnitDamage()
    └─> Sum all weapons for a unit
```

### 🎨 **UI Rendering** (`src/ui/` and `src/sim-ui/`)

```
Analysis UI (src/ui/)
├─> analysis.ts - Results tables
├─> charts.ts - Damage charts
└─> weapon-toggles.ts - Mode selectors

Simulator UI (src/sim-ui/)
├─> battlefield-renderer.ts - SVG generation
└─> results-display.ts - Logs and stats
```

## Technology Stack

- **Frontend:** TypeScript, HTML5, CSS3
- **UI Framework:** Bootstrap 5
- **Build Tool:** Vite
- **Charts:** Chart.js
- **State:** localStorage (no backend needed)
- **Deployment:** Static hosting (GitHub Pages, Netlify, etc.)

## Build Configuration

```typescript
// vite.config.ts
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',          // Analyzer
        converter: './converter.html',  // Converter
        battleSim: './battle-sim.html' // Simulator
      }
    }
  }
})
```

## Navigation Matrix

```
              TO →
FROM ↓     Analyzer    Battle Sim    Converter
─────────────────────────────────────────────────
Analyzer      -        Button        Button
Battle Sim   Button      -             -
Converter    Auto         -            -
```

## Performance Characteristics

| Metric | Analyzer | Battle Sim | Converter |
|--------|----------|------------|-----------|
| Initial Load | ~300KB | ~350KB | ~200KB |
| Time to Interactive | <1s | <1s | <1s |
| State Save | <1ms | <1ms | <1ms |
| State Load | <1ms | <1ms | <1ms |
| Simulation Run | N/A | 10-50ms | N/A |

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+
- ⚠️ IE 11 (not supported)

## Future Architecture Improvements

### Short Term
- [ ] Service Worker for offline support
- [ ] IndexedDB for larger rosters
- [ ] Web Workers for heavy simulations

### Long Term
- [ ] Backend API (optional)
- [ ] User accounts and cloud save
- [ ] Real-time multiplayer
- [ ] Mobile app (React Native/PWA)
