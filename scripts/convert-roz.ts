import { readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import { parseXMLRoster, optimizeWarhammerRoster } from '../src/converter';

function printUsageAndExit(): never {
  // Minimal usage help
  // eslint-disable-next-line no-console
  console.error('Usage: npx ts-node --transpile-only scripts/convert-roz.ts <input.roz> [output.json]');
  process.exit(1);
}

function main() {
  const [, , inputPathArg, outputPathArg] = process.argv;
  if (!inputPathArg) {
    printUsageAndExit();
  }

  const inputPath = resolve(inputPathArg);
  const xml = readFileSync(inputPath, 'utf-8');

  // Parse XML roster to normalized roster data
  const rosterData = parseXMLRoster(xml);

  // Convert to optimized army format (same as the UI expects)
  const optimized = optimizeWarhammerRoster(rosterData);

  const defaultOut =
    basename(inputPath).replace(/\.[^.]+$/, '') + '_optimized.json';
  const outputPath = resolve(outputPathArg || defaultOut);
  writeFileSync(outputPath, JSON.stringify(optimized, null, 2), 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`Wrote optimized roster: ${outputPath}`);
}

main();


