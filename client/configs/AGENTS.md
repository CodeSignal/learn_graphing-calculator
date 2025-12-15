# Configuration Structure Documentation

## File Roles & Relationships

### 1. `client/configs/default-config.js` (Active Configuration)
- **Role:** This is the active, hardcoded configuration used by the application during initialization.
- **Usage:** It is imported by `client/app.js` and passed to `StateManager.initialize()`.
- **Purpose:** Defines the default state (viewport, initial expressions, colors) for the Graphing Calculator app.

### 2. `client/configs/config.json` & `samples/` (Legacy/Data)
- **Role:** These are passive JSON data files salvaged from the previous codebase.
- **Usage:** Currently unused by the main application logic (`app.js`).
- **Purpose:** They represent specific "activities" or examples (e.g., `parabola.json`, `sine.json`).
- **Future Use:** These files follow the schema expected by `StateManager`. They can be loaded dynamically if a "Load Example" or "Activity Browser" feature is implemented in the future using the (salvaged) `config-loader.js`.

## Summary
- **dev/runtime:** `default-config.js`
- **content/data:** `samples/*.json` (potential future features)
