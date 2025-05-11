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

## Setup

1. Clone this repository
2. Install dependencies with `npm install`
3. Build the TypeScript code with `npm run build`
4. Serve the application using `npx http-server`
5. Open your browser to the local server (usually http://localhost:8080)

## Usage

1. Select target toughness
2. Toggle overcharge mode if needed
3. Select an army file from the dropdown or upload your own
4. View the analysis results in the table and unit cards
5. Sort units by clicking on column headers
6. Toggle weapon modes for multi-mode weapons

## License

MIT License 