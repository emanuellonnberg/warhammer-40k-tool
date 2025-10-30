# Warhammer 40K Unit Efficiency Analyzer

A comprehensive web-based tool for analyzing unit efficiency in Warhammer 40K 10th Edition. This application helps you make informed tactical decisions by calculating expected damage output and efficiency across different combat scenarios.

## What This Tool Does

- **Damage Per Point (DPP) Analysis**: Calculate and compare unit efficiency against various target profiles
- **Combat Scenario Modeling**: Test units against different toughness values with customizable buffs and conditions
- **Re-roll Mechanics**: Model hit and wound re-rolls (1s, failed, all) from abilities and stratagems
- **Defensive Capabilities**: Account for invulnerable saves and Feel No Pain
- **Weapon Mode Comparison**: Toggle between weapon profiles (standard, overcharge, alternative firing modes)
- **Roster Import**: Import army lists from BattleScribe (JSON) or New Recruit (.roz XML files)
- **Interactive Analysis**: Sort, filter, and explore your army's offensive capabilities

## Key Features

### Core Calculations
- **Accurate Warhammer 40K 10th Edition mechanics** - Hit, wound, save, and damage rolls
- **Re-roll Support** - Model re-roll 1s, re-roll failed, and re-roll all for hits and wounds
- **Feel No Pain (FNP)** - Account for damage mitigation from FNP abilities
- **Invulnerable Saves** - Displayed inline with armor saves (e.g., "3+/4++")
- **Tactical Survivability** - Calculate expected survivability accounting for range, movement, and abilities

### Special Weapon Rules
Supports all major weapon abilities including:
- Rapid Fire, Melta, Blast, Torrent
- Twin-Linked, Lance
- Sustained Hits, Lethal Hits, Devastating Wounds
- Anti-[KEYWORD], Hazardous
- And more...

### User Experience
- **Interactive UI**: Toggle weapon modes and combat settings in real-time
- **Dynamic Sorting**: Sort units by efficiency, damage, points, or any metric
- **Detailed Breakdowns**: See damage output by weapon type (ranged, melee, pistol, one-time)
- **Weapon Tooltips**: Hover over weapons to see detailed calculation breakdowns
- **Army Management**: Upload custom army files or use predefined army lists
- **Roster Converter**: Convert BattleScribe rosters to optimized format (separate converter.html page)

## Tech Stack

- **TypeScript** - Type-safe code with strict mode
- **Vite** - Fast development server with Hot Module Replacement (HMR)
- **Vitest** - Unit testing with coverage support
- **Bootstrap 5** - Responsive UI components

## Development Setup

1. Clone this repository
```bash
git clone https://github.com/emanuellonnberg/warhammer-40k-tool.git
cd warhammer-40k-tool
```

2. Install dependencies
```bash
npm install
```

3. Start the development server (with hot reload)
```bash
npm run dev
```

4. Open your browser to [http://localhost:3000](http://localhost:3000)

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm test` - Run tests in watch mode
- `npm run test:ui` - Run tests with UI interface
- `npm run test:coverage` - Generate test coverage report
- `npm run type-check` - Run TypeScript type checking

## Project Structure

```
warhammer-40k-tool/
├── src/
│   ├── calculators/       # Damage and efficiency calculations
│   │   ├── damage.ts      # Core damage calculation engine
│   │   ├── efficiency.ts  # DPP and efficiency metrics
│   │   ├── rerolls.ts     # Re-roll probability calculations
│   │   └── index.ts       # Exports
│   ├── rules/            # Special weapon rules implementation
│   │   └── special-weapons.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts      # Interfaces for Unit, Weapon, Army, RerollConfig, etc.
│   ├── ui/               # User interface components
│   │   ├── controls.ts   # Event handlers and user interactions
│   │   ├── display.ts    # Rendering logic for tables and cards
│   │   ├── tooltip.ts    # Tooltip generation with calculation details
│   │   └── index.ts      # Exports
│   ├── utils/            # Utility functions
│   │   ├── numeric.ts    # Number parsing (D6, D3+X, etc.)
│   │   ├── styling.ts    # CSS helpers and efficiency classes
│   │   └── weapon.ts     # Weapon utilities
│   ├── converter.ts      # BattleScribe roster converter (JSON/XML)
│   └── main.ts           # Main application entry point
├── tests/                # Comprehensive test suite
│   ├── calculators/
│   │   ├── damage.test.ts
│   │   ├── rerolls.test.ts
│   │   └── ...
│   ├── invuln-save.test.ts
│   ├── numeric.test.ts
│   └── special-weapons.test.ts
├── docs/                 # Documentation
│   ├── implementation/
│   │   └── 01-reroll-mechanics.md
│   └── UI_IMPROVEMENTS.md
├── public/               # Static assets (army JSON files)
├── index.html            # Main analysis tool
├── converter.html        # Roster converter page
├── vite.config.ts        # Vite configuration
├── vitest.config.ts      # Vitest configuration
├── tsconfig.json         # TypeScript configuration
├── README.md             # This file
├── ROADMAP.md            # Feature roadmap and development plan
└── INVULN_SAVE_IMPLEMENTATION.md  # Implementation documentation
```

## Usage

### Main Analysis Tool (index.html)

1. **Configure Combat Scenario**:
   - **Target Toughness**: Choose T3-T10 for analysis
   - **Re-roll Modifiers**: Select re-roll options for hit and wound rolls (none, 1s, failed, all)
   - **Target Feel No Pain**: Set target's FNP save (none, 6+, 5+, 4+, 3+, 2+)
   - **Weapon Options**:
     - Overcharge mode - Show overcharged weapon profiles
     - Include one-time weapons - Include one-shot weapons like seeker missiles
     - Optimal range - Calculate with Rapid Fire and Melta bonuses active

2. **Load Army Data**:
   - Select from dropdown (predefined armies)
   - Drag & drop your own JSON file
   - Click the drop zone to browse files
   - **Note**: For BattleScribe rosters, use the Roster Converter first (see below)

3. **View Results**:
   - **Summary Table**: Sortable columns showing efficiency, DPP, and damage by type
   - **Unit Cards**: Detailed breakdowns with:
     - Unit statistics (including invulnerable saves as "3+/4++")
     - Abilities and special rules
     - Weapon profiles with damage calculations
     - Tactical survivability metrics
   - **Tooltips**: Hover over weapons to see detailed calculation steps

4. **Interact**:
   - Click column headers to sort by any metric
   - Toggle multi-mode weapons on unit cards
   - Click unit names in summary to jump to detailed card

### Roster Converter (converter.html)

Convert BattleScribe rosters to the optimized format:

1. Open `converter.html` in your browser
2. Drag and drop your BattleScribe file:
   - JSON exports (.json)
   - New Recruit exports (.roz XML files)
3. Download the converted file
4. Upload the converted file to the main analysis tool

## Testing

The project includes comprehensive tests for critical calculations:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

## Building for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build
npm run preview
```

The built files will be in the `dist/` directory.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License 