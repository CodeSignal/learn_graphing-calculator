# Configuration Structure Documentation

## Config Loading Flow

The application uses a dynamic configuration loading system with fallback support:

1. **Primary**: Attempts to load `config.json` via `ConfigLoader.load('./configs/config.json')`
2. **Fallback**: If JSON load fails, uses `default-config.js` via `ConfigLoader.fromObject(defaultConfig)`; will be deprecated in the future
3. **Processing**: Both paths use `ConfigLoader` for validation, default application, and event publishing

The loading happens in `client/app.js` → `initState()` → `ConfigLoader` → `StateManager.initialize()`.

## ConfigLoader Role

`ConfigLoader` (`client/core/config-loader.js`) provides:

- **Validation**: Validates config structure (functions array with required `id`/`expression`, graph object with numeric bounds)
- **Defaults**: Applies default values (colors, visibility flags, graph settings).
- **Events**: Publishes `config:loaded` event after successful processing
- **Dual Interface**:
  - `load(path)` - Loads JSON from file system
  - `fromObject(configObj)` - Processes config object directly (useful for platform injection)

## File Roles & Priorities

### 1. `client/configs/config.json` (Primary Runtime Config)
- **Role**: Primary configuration file loaded at application startup
- **Usage**: Actively loaded by `app.js` via `ConfigLoader.load('./configs/config.json')`
- **Purpose**: Defines runtime state (viewport bounds, initial expressions, display settings)
- **Schema**: `{functions: [{id, expression, visible?}], graph: {xMin, xMax, yMin, yMax, showGrid?, showAxes?, showLegend?}}`

### 2. `client/configs/default-config.js` (Fallback Config)
- **Role**: Fallback configuration when `config.json` is unavailable or fails to load
- **Usage**: Imported by `app.js` and passed to `ConfigLoader.fromObject()` on load failure
- **Purpose**: Provides default state when JSON config cannot be loaded (e.g., in development, missing file)
- **Note**: Still serves as the baseline default configuration, but will be removed in the future to ensure we always use the `config.json` file.

### 3. `client/configs/samples/`
- **Role**: Example configuration files
- **Usage**: Unused by application logic (directly); these are examples that can be reused or customized as needed.
- **Schema**: Follows same structure as `config.json` (compatible with `ConfigLoader`)

## Integration Points

- **App Initialization**: `app.js` → `initState()` → `ConfigLoader.load()` → `StateManager.initialize()`
- **Platform Injection**: External platforms can inject config via `ConfigLoader.fromObject(configObj)` before app initialization
- **State Management**: Processed config is stored in `StateManager.state.config` and used to initialize `graph` and `functions` state

## Summary

- **Primary runtime config**: `config.json` (dynamically loaded)
- **Fallback config**: `default-config.js` (used when JSON unavailable)
- **Config processor**: `ConfigLoader` (validation, defaults, events)
- **Example configurations**: `samples/*.json` (example/reference files; intentionally kept for documentation and reuse)
