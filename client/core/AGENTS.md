# Repository Contribution Guidelines – Core (State & Events)
These modules are the plumbing; break them and the app thrashes. Keep changes
minimal and documented.

## Files & roles
1. `state-manager.js`: Central store with dot-path get/set, history (max 50),
   optional debug logs. Manages runtime state: `parameters` (value/min/max/step,
   derived from expressions), `functions` (from config), `graph` (from config).
   StateManager is a state store only; EventBus handles all notifications.
   StateManager imports EventBus to publish state change events.
2. `event-bus.js`: Namespaced pub/sub (`module:action`), once subscriptions,
   history (max 100), debug logging. Supports parent path bubbling for
   `state:changed:*` events (subscribing to `state:changed:parameters` also
   receives notifications for `state:changed:parameters.m.value` and parent
   subscribers receive the current parent value). Supports
   `immediate` option for state subscriptions to receive current value on subscribe.
   Requires StateManager to be injected via `setStateManager()` during app initialization
   before components subscribe with `immediate: true` or rely on bubbled parent payloads.
   This avoids circular dependencies while maintaining explicit coupling.
3. `config-loader.js`: Validates and normalizes config objects or fetched JSON;
   applies defaults, auto-assigns ids/colors. Schema:
   `{functions: [], graph: {xMin, xMax, yMin, yMax, showGrid, showAxes, showLegend}}`.

## Usage patterns
- Prefer `StateManager.set(path, value, { silent: true })` only when you
  manually publish the relevant event (e.g., `EventBus.publish('expression:updated', data)`)
  to avoid render storms.
- Config schema: `{functions: [], graph: {...}}`. Parameters are runtime state,
  not config.
- `parameters` state is dynamically populated by GraphEngine from expression
  variables (e.g., `m`, `b` in `m*x + b`).
- Use `StateManager.getControlValues()` to build evaluation scopes from
  parameters.
- Keep event names consistent and scoped (`state:changed`, `parameters:updated`,
  `expression:updated`).
- **Dependency injection**: EventBus requires StateManager to be injected via
  `EventBus.setStateManager(StateManager)` during app initialization (after
  StateManager is initialized, before components subscribe with `immediate: true`).
  This breaks the circular dependency (StateManager imports EventBus, EventBus
  needs StateManager for immediate callbacks and correct parent bubbling values).

## Safety/limits
- History arrays are capped; if you change limits, ensure memory stays bounded.
- `ConfigLoader.load` fetches relative to `./configs/config.json`; adjust only
  with clear reason and update root AGENTS.

## When adding features
- New schema fields → extend `validate()` and `_applyDefaults()` methods.
- If you add schema fields, document them here and in root AGENTS.

## Documentation rule
- Any behavior change here demands an update to this file and root `AGENTS.md`.
  No exceptions.
