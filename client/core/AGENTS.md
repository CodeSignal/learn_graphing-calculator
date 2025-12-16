# Repository Contribution Guidelines – Core (State & Events)
These modules are the plumbing; break them and the app thrashes. Keep changes minimal and documented.

## Files & roles
1. `state-manager.js`: Central store with dot-path get/set, history (max 50), subscribers per path,
   optional debug logs. Manages runtime state: `controls` (dynamically created from expression variables),
   `functions` (from config), `graph` (from config).
2. `event-bus.js`: Namespaced pub/sub (`module:action`), once subscriptions, history (max 100), debug
   logging.
3. `config-loader.js`: Validates and normalizes config objects or fetched JSON; applies defaults,
   auto-assigns ids/colors. Schema: `{functions: [], graph: {xMin, xMax, yMin, yMax, showGrid, showAxes, showLegend}}`.

## Usage patterns
- Prefer `StateManager.set(path, value, { silent: true })` only when you manually publish the relevant
  event (e.g., `EventBus.publish('expression:updated', data)`) to avoid render storms.
- Config schema: `{functions: [], graph: {...}}`. Controls are runtime state, not config.
- `controls` state is dynamically populated by GraphEngine from expression variables (e.g., `m`, `b` in `m*x + b`).
- Keep event names consistent and scoped (`state:changed`, `controls:updated`, `expression:updated`).

## Safety/limits
- History arrays are capped; if you change limits, ensure memory stays bounded.
- `ConfigLoader.load` fetches relative to `./configs/config.json`; adjust only with clear reason and
  update root AGENTS.

## When adding features
- New schema fields → extend `validate()` and `_applyDefaults()` methods.
- If you add schema fields, document them here and in root AGENTS.

## Documentation rule
- Any behavior change here demands an update to this file and root `AGENTS.md`. No exceptions.
