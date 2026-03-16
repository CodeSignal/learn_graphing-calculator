# CodeSignal CosmoPlot

CodeSignal CosmoPlot is a browser-based graphing calculator. It runs locally with a small Node server and a Vite-based development setup.

## Overview

CosmoPlot currently supports the following graphing workflows:

- Live graphing for explicit expressions such as `sin(x)` and `y = m*x + b`
- Implicit equations and vertical lines such as `x^2 + y^2 = 9` and `x = 3`
- Inequality shading such as `y > x^2` and `x <= 3`
- Point plotting with `points([[0,0],[1,2]])`
- Vector plotting with `vector([3,2],[1,1])`
- Parameter assignments such as `a = 2`
- Auto-generated sliders for parameters used in graph expressions such as
`a*sin(b*x)`
- Separate sidebar tabs for graph expressions and parameters
- Pan, zoom, reset-view controls, and a built-in help modal

## Usage Instructions

### Install dependencies

If you cloned the repository with Git, initialize the design-system submodule
before starting the app:

```bash
git submodule update --init
```

Then install dependencies:

```bash
npm install
```

### Run in development

```bash
npm run start:dev
```

Then open [http://localhost:3000](http://localhost:3000).

Development mode uses Vite for the frontend and the local API server for logs.
The frontend runs on port `3000`, the logging API runs on port `3001`, and the
app loads its editable config from `client/configs/config.json`.

### Build and run in production mode

```bash
npm run build
npm run start:prod
```

Then open [http://localhost:3000](http://localhost:3000).

In production mode, the server serves built assets from `dist/` and exposes the
config to the browser at `/configs/config.json`. That production config is read
from:

- `CONFIG_PATH` if you set it
- otherwise `./config.json` at the repo root or extracted release root

If that file does not exist, the client falls back to the bundled default config from `client/configs/default-config.js`.

## Config Reference

CosmoPlot reads a JSON object with this top-level shape:

```json
{
  "functions": [],
  "graph": {}
}
```

### Minimal example

```json
{
  "functions": [
    {
      "id": "f",
      "expression": "m*x + b",
      "visible": true
    }
  ],
  "graph": {
    "xMin": -10,
    "xMax": 10,
    "yMin": -10,
    "yMax": 10,
    "showGrid": true
  }
}
```

### `functions`

Each entry in `functions` represents one row in the calculator.

Required fields:

- `id`: unique label used by the UI and activity log
- `expression`: the math input to classify and plot

Common optional fields:

- `visible`: hide or show the row on first load
- `editable`: if set to `false`, the row is not meant to be edited in the UI
- `derivative`: tangent-line overlay for explicit functions
- `secants`: secant-line overlays for explicit functions

Example overlay fields:

```json
{
  "id": "f",
  "expression": "x^2",
  "derivative": {
    "x0": 1
  },
  "secants": [
    { "x0": -1, "x1": 1 }
  ]
}
```

### `graph`

The `graph` object controls the initial viewport and display options.

Required bounds:

- `xMin`
- `xMax`
- `yMin`
- `yMax`

Optional fields:

- `showGrid`: `true` or `false`
- `annotations`: reference lines shown on the graph

Annotation entries use this shape:

```json
{
  "x": 2,
  "text": "x = 2"
}
```

You may also use `y` for a horizontal reference line. Each annotation must have at least `x` or `y`.

### Practical expression examples

- Explicit graph: `sin(x)`
- Explicit assignment form: `y = m*x + b`
- Function definition form: `f(x) = x^2`
- Implicit equation: `x^2 + y^2 = 9`
- Strict inequality: `y > x^2`
- Inclusive inequality: `x <= 3`
- Points: `points([[0,0],[1,2]])`
- Vector: `vector([3,2],[1,1])`
- Parameter assignment: `a = 2`
- Parameterized graph with sliders: `a*sin(b*x)`

## Activity Logging and Grading

The local server creates a `logs/` directory on startup if it does not already exist. Activity logs are written to `logs/activity.log` as plain text, one event per line. This matters for grading. The current app writes activity messages in these formats:

- `Initial state: ...`
- `Created expression ...`
- `Modified expression ...`
- `Modified expression ... (parameter: ...)`
- `Deleted expression: ...`

When a modified expression is invalid, the log appends the error detail:

```text
Modified expression expr_1: x++ -> x+ (invalid: Syntax error)
```

Typical examples:

```text
Initial state: f: m*x + b
Created expression expr_1
Modified expression expr_1:  -> sin(x)
Modified expression expr_1 (parameter: a): 1 -> 2
Deleted expression: sin(x)
```

Optional debug logging is also available by opening the app with `?debug=true`. Those messages go to `logs/debug.log`, not `activity.log`.

## CI/CD and Automated Releases

This repo includes a GitHub Actions workflow at`.github/workflows/build-release.yml` that runs on every push to `main`.

The workflow currently does the following:

1. Checks out the repository
2. Initializes the design-system submodule
3. Uses Node `22.13.1`
4. Runs `npm ci`
5. Runs `npm run build`
6. Reinstalls production dependencies only
7. Creates `release.tar.gz`
8. Publishes a GitHub Release tagged `v<run_number>`

### Release contents

The generated `release.tar.gz` contains:

- `dist/`
- `package.json`
- `server.js`
- production `node_modules/`

### Using a release artifact

1. Download `release.tar.gz` from the latest GitHub Release.
2. Extract it in the target directory.
3. Provide a `config.json` file
4. Start the app:

```bash
npm run start:prod
```

