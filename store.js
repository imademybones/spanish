// store.js — single point of contact for all reads/writes of progress data.
// Progress lives in localStorage under one key. Content (content.json) is read-only and never touched here.

const STORAGE_KEY = 'spanish.v1';
const SCHEMA_VERSION = 1;

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      startDate: '2026-11-16', // Monday
      startWeek: 1,
      startPhaseId: 'phase-1',
      scheduleShiftDays: 0,
      theme: 'system'
    },
    weeks: {},            // weekNumber -> { slots: { slotId: count }, familyTaskDone: bool, note: string }
    exitChecks: {},        // phaseId -> dateString completed
    milestones: {},        // milestoneId -> dateString completed
    monthlyRecordings: {}, // "YYYY-MM" -> dateString completed
    starredWords: [],      // [word]
    askedQuestions: {},    // question -> { date, note }
    myQuestions: [],       // [question]
    myWords: []            // [{ word, meaning, example }]
  };
}

function migrate(state) {
  // Hook for future schemaVersion bumps. v1 is the baseline, nothing to migrate yet.
  if (!state.schemaVersion) state.schemaVersion = SCHEMA_VERSION;
  return state;
}

let memoryState = null;
let usingMemoryFallback = false;
let warningCallback = null;

function warn(message) {
  usingMemoryFallback = true;
  if (warningCallback) warningCallback(message);
}

function onWarning(cb) {
  warningCallback = cb;
}

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    warn('Could not read saved progress — using a temporary in-memory copy. Changes will not survive a reload.');
    return null;
  }
}

function writeRaw(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    warn('Could not save progress — using a temporary in-memory copy. Changes will not survive a reload.');
    return false;
  }
}

function load() {
  if (memoryState) return memoryState;
  const raw = readRaw();
  const state = raw ? migrate(Object.assign(defaultState(), raw)) : defaultState();
  memoryState = state;
  if (!raw) writeRaw(state);
  return state;
}

function save() {
  if (!memoryState) return;
  writeRaw(memoryState);
}

function get() {
  return load();
}

function update(mutator) {
  const state = load();
  mutator(state);
  save();
  return state;
}

function exportJSON() {
  return JSON.stringify(load(), null, 2);
}

function importJSON(jsonText) {
  const parsed = JSON.parse(jsonText);
  memoryState = migrate(Object.assign(defaultState(), parsed));
  save();
  return memoryState;
}

function resetAll() {
  memoryState = defaultState();
  save();
  return memoryState;
}

function isUsingMemoryFallback() {
  return usingMemoryFallback;
}

window.Store = {
  get,
  update,
  exportJSON,
  importJSON,
  resetAll,
  onWarning,
  isUsingMemoryFallback
};
