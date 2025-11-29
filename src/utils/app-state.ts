/**
 * Cross-page state management for 40K Analyzer
 * Handles army data, preferences, and navigation between pages
 */

import type { Army, AttachmentMap, RerollConfig } from '../types';
import { RerollType } from '../types';

export interface BattleSimConfig {
  startingDistance?: number;
  initiative: 'armyA' | 'armyB';
  allowAdvance: boolean;
  randomCharge: boolean;
  maxRounds?: number;
}

export interface UserPreferences {
  targetToughness: number;
  rerollHits: RerollType;
  rerollWounds: RerollType;
  targetFNP?: number;
  useOvercharge: boolean;
  includeOneTimeWeapons: boolean;
  optimalRange: boolean;
}

export interface AppState {
  currentArmy: Army | null;
  opponentArmy: Army | null;
  leaderAttachments: AttachmentMap;
  opponentAttachments: AttachmentMap;
  preferences: UserPreferences;
  battleSimConfig: BattleSimConfig;
  lastPage?: string;
  timestamp?: number;
}

const STATE_KEY = 'w40k_app_state';
const STATE_VERSION = 1;

/**
 * Get default preferences
 */
function getDefaultPreferences(): UserPreferences {
  return {
    targetToughness: 8,
    rerollHits: RerollType.NONE,
    rerollWounds: RerollType.NONE,
    targetFNP: undefined,
    useOvercharge: false,
    includeOneTimeWeapons: false,
    optimalRange: true
  };
}

/**
 * Get default battle sim config
 */
function getDefaultBattleSimConfig(): BattleSimConfig {
  return {
    initiative: 'armyA',
    allowAdvance: true,
    randomCharge: false,
    maxRounds: 3
  };
}

/**
 * Get default app state
 */
function getDefaultState(): AppState {
  return {
    currentArmy: null,
    opponentArmy: null,
    leaderAttachments: {},
    opponentAttachments: {},
    preferences: getDefaultPreferences(),
    battleSimConfig: getDefaultBattleSimConfig(),
    timestamp: Date.now()
  };
}

/**
 * Save current state to localStorage
 */
export function saveAppState(state: Partial<AppState>): void {
  try {
    const existing = loadAppState();
    const merged: AppState = {
      ...existing,
      ...state,
      timestamp: Date.now()
    };

    const payload = {
      version: STATE_VERSION,
      data: merged
    };

    localStorage.setItem(STATE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to save app state:', error);
  }
}

/**
 * Load state from localStorage
 */
export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return getDefaultState();

    const payload = JSON.parse(raw);

    // Version check
    if (payload.version !== STATE_VERSION) {
      console.warn('App state version mismatch, using defaults');
      return getDefaultState();
    }

    // Merge with defaults to ensure all fields exist
    return {
      ...getDefaultState(),
      ...payload.data
    };
  } catch (error) {
    console.warn('Failed to load app state:', error);
    return getDefaultState();
  }
}

/**
 * Clear all app state (for debugging/reset)
 */
export function clearAppState(): void {
  localStorage.removeItem(STATE_KEY);
}

/**
 * Save current army and attachments
 */
export function saveCurrentArmy(army: Army, attachments: AttachmentMap = {}): void {
  saveAppState({
    currentArmy: army,
    leaderAttachments: attachments
  });
}

/**
 * Save opponent army and attachments
 */
export function saveOpponentArmy(army: Army, attachments: AttachmentMap = {}): void {
  saveAppState({
    opponentArmy: army,
    opponentAttachments: attachments
  });
}

/**
 * Save user preferences
 */
export function savePreferences(preferences: Partial<UserPreferences>): void {
  const state = loadAppState();
  saveAppState({
    preferences: {
      ...state.preferences,
      ...preferences
    }
  });
}

/**
 * Save battle sim configuration
 */
export function saveBattleSimConfig(config: Partial<BattleSimConfig>): void {
  const state = loadAppState();
  saveAppState({
    battleSimConfig: {
      ...state.battleSimConfig,
      ...config
    }
  });
}

/**
 * Navigate to battle simulator with current armies
 */
export function openBattleSimulator(
  armyA: Army,
  armyB: Army,
  attachmentsA: AttachmentMap = {},
  attachmentsB: AttachmentMap = {},
  config?: Partial<BattleSimConfig>
): void {
  saveAppState({
    currentArmy: armyA,
    opponentArmy: armyB,
    leaderAttachments: attachmentsA,
    opponentAttachments: attachmentsB,
    battleSimConfig: {
      ...getDefaultBattleSimConfig(),
      ...config
    },
    lastPage: 'analyzer'
  });
  window.location.href = 'battle-sim.html';
}

/**
 * Return to analyzer from battle simulator
 */
export function returnToAnalyzer(): void {
  const state = loadAppState();
  saveAppState({
    ...state,
    lastPage: 'battle-sim'
  });
  window.location.href = 'index.html';
}

/**
 * Check if coming from a specific page
 */
export function isComingFrom(page: string): boolean {
  const state = loadAppState();
  return state.lastPage === page;
}

/**
 * Get age of saved state in milliseconds
 */
export function getStateAge(): number {
  const state = loadAppState();
  if (!state.timestamp) return Infinity;
  return Date.now() - state.timestamp;
}

/**
 * Check if state is fresh (less than 1 hour old)
 */
export function isStateFresh(): boolean {
  return getStateAge() < 60 * 60 * 1000; // 1 hour
}

/**
 * Export state as JSON for backup/sharing
 */
export function exportState(): string {
  const state = loadAppState();
  return JSON.stringify(state, null, 2);
}

/**
 * Import state from JSON
 */
export function importState(json: string): boolean {
  try {
    const state = JSON.parse(json) as AppState;
    saveAppState(state);
    return true;
  } catch (error) {
    console.error('Failed to import state:', error);
    return false;
  }
}
