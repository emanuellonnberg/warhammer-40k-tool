# Warhammer 40K Unit Efficiency Analyzer

A web-based tool for analyzing unit efficiency in Warhammer 40K. This application allows you to:

- Compare unit efficiency against different toughness values
- Calculate damage per point for ranged and melee weapons
- Toggle between standard and overcharge weapon modes
- Sort units by various metrics (efficiency, damage, points, etc.)
- Upload your own army JSON files or select from predefined armies

## Features

- **Unit Efficiency Calculation**: Analyzes units based on their weapons, stats, and points cost
- **Interactive UI**: Toggle between weapon modes and overcharge settings
- **Dynamic Sorting**: Sort units by any metric with a simple click
- **Damage Breakdown**: See damage output by weapon type (ranged, melee, pistol)
- **Custom Army Upload**: Drag and drop your own army JSON files
- **Special Weapon Rules**: Supports Rapid Fire, Melta, Sustained Hits, Lethal Hits, Devastating Wounds, Torrent, and more

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
│   │   ├── damage.ts
│   │   ├── efficiency.ts
│   │   └── index.ts
│   ├── rules/            # Special weapon rules implementation
│   │   └── special-weapons.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── ui/               # User interface components
│   │   ├── controls.ts   # Event handlers
│   │   ├── display.ts    # Rendering logic
│   │   ├── tooltip.ts    # Tooltip generation
│   │   └── index.ts
│   ├── utils/            # Utility functions
│   │   ├── numeric.ts    # Number parsing (D6, D3+X)
│   │   ├── styling.ts    # CSS helpers
│   │   └── weapon.ts     # Weapon utilities
│   └── main.ts           # Application entry point
├── tests/                # Test files
│   ├── damage.test.ts
│   ├── numeric.test.ts
│   └── special-weapons.test.ts
├── public/               # Static assets (army JSON files)
├── index.html            # Main HTML file
├── vite.config.ts        # Vite configuration
├── vitest.config.ts      # Vitest configuration
└── tsconfig.json         # TypeScript configuration
```

## Usage

1. **Select target toughness** - Choose the toughness value you want to analyze against (T3-T8)
2. **Toggle settings**:
   - Overcharge mode - Show overcharged weapon stats
   - Include one-time weapons - Include weapons like seeker missiles
   - Optimal range - Calculate with Rapid Fire and Melta bonuses
3. **Load army data**:
   - Select from dropdown (predefined armies)
   - Drag & drop your own JSON file
   - Click the drop zone to browse files
4. **View results**:
   - Summary table with sortable columns
   - Detailed unit cards with weapon breakdowns
   - Hover over efficiency values for calculation details
5. **Customize**:
   - Click column headers to sort
   - Toggle multi-mode weapons on unit cards

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