# Repository Contribution Guidelines – Math Layer
Math correctness is the product; tread carefully. Update this file whenever you
alter math behavior.

## Modules
1. `expression-parser.js`: math.js wrapper, caches parsed expressions (LRU 100).
   Requires variable `x` (optionally `y`); unknown symbols are allowed but
   warned. `detectVariables` filters to x/y only; `getAllSymbols` reveals all
   symbols (variables and parameters). Provides:
   - `parseAssignmentSyntax()`: Pure syntax detection for assignments (returns
     `{isAssignment, lhs, rhs}` without semantic filtering)
   - `parseFunctionDefinitionSyntax()`: Detects `FunctionAssignmentNode` syntax,
     i.e. `f(x) = expr` style definitions (returns
     `{isFunctionDef, name, params, body}` without semantic filtering)
   - `parsePointsSyntax()`: Detects `points([[x,y], ...])` syntax and extracts
     coordinate expression pairs.
   - `parseVectorSyntax()`: Detects `vector([vx,vy],[ox,oy]?)` syntax and
     extracts vector/offset coordinate expressions.
   - `isParameter()`: Detects parameter names (excluding x/y and constants)
2. `shared-parser.js`: Singleton ExpressionParser instance so caching is shared
   across components.
3. `line-classifier.js`: Single source of truth for line kinds (`graph`,
   `assignment`, `invalid`, `empty`). Returns `graphMode` for function-plot:
   `explicit`, `implicit`, `points`, `vector`, or `inequality`
   (rendered by graph/renderer layer). Rules:
   - `y = expr` → `graph`, `graphMode: 'explicit'`
   - `f(x) = expr` (function definition, sole param must be `x`) → `graph`,
     `graphMode: 'explicit'`, `plotExpression: expr` (same as `y = expr`)
   - `x = expr` → `graph`, `graphMode: 'implicit'`, `plotExpression: 'x - (expr)'`
     (supports constants, parameters, and y-dependent expressions; rejects if x in RHS)
   - `expr = expr` (both sides non-simple) → `graph`, `graphMode: 'implicit'`
   - Bare `f(x,y)` (both vars) → `graph`, `graphMode: 'implicit'`
   - `points([[x,y], ...])` → `graph`, `graphMode: 'points'`, `plotData.points`
   - `vector([vx,vy],[ox,oy]?)` → `graph`, `graphMode: 'vector'`,
     `plotData.vector`/`plotData.offset` (defaults offset to `['0', '0']`)
   - `points`/`vector` coordinates may use parameters/constants but must not use
     `x` or `y`
   - Single-comparator `>=`, `<=`, `>`, `<` → `graph`,
     `graphMode: 'inequality'`, `plotExpression: '(lhs) - (rhs)'`, and
     `plotData: { type: 'inequality', operator, lhs, rhs, boundaryExpression,
     strict, satisfiesPositive }`
   - Chained inequalities (e.g. `-1 < x < 1`) → `invalid`
   - Inequalities without `x` or `y` (e.g. `a < b`) → `invalid`
   - `param = constant` → `assignment`
   - `f(t) = expr` or multi-param `f(x,y) = expr` → `invalid` (non-x parameter)
4. `parameter-utils.js`: Derives defined/used parameters and missing assignments
   from classified lines.
5. `parameter-defaults.js`: Default slider metadata `{ value, min, max, step }`.
6. `expression-adapter.js`: AST-based conversion layer with three public
   functions:
   - `toFunctionPlotSyntax(expression)`: Normalizes aliases for function-plot
     (`pi/PI -> PI`, `e/E -> E`, `ln -> log`) without mutating raw input.
   - `toDisplayLatex(expression)`: Converts raw expression text into polished
     LaTeX (`pi/PI -> \\pi`, `ln -> \\ln`) and handles top-level relations.
   - `computeDerivative(expression)`: Symbolically differentiates an explicit
     RHS expression w.r.t. `x` using math.js, pipes result through
     `toFunctionPlotSyntax`, and returns the function-plot-ready string.
     Returns `null` if differentiation fails (e.g., invalid expression).
     Results are LRU-cached (200 entries).
7. `utils/math-formatter.js`: Converts expressions to LaTeX and back; renders
   with KaTeX. `toLatex()` delegates to `expression-adapter.js`.

## Expectations & constraints
- **Syntax vs. Semantics separation**: `parseAssignmentSyntax()` and
  `parseFunctionDefinitionSyntax()` handle pure syntax detection; `classifyLine()`
  applies semantic rules. This separation enables consistent handling of all
  assignment types (`x =`, `y =`, `param =`), function definitions
  (`f(x) = expr`), and non-function graph payloads (`points(...)`,
  `vector(...)`).
- LineClassifier enforces graph semantics: graph lines require `x` unless
  written as `y = ...`, `x = ...`, or implicit (both x and y).
- Assignment lines must be constant expressions (`a = 1`, `b = pi`); variable-
  dependent RHS is invalid.
- Maintain strict separation of expression targets:
  - Raw text: editor/state (preserved exactly as typed)
  - Plot text: `toFunctionPlotSyntax()`
  - Display LaTeX: `toDisplayLatex()`
- Keep parsing/evaluation through these modules—no `eval` or new Function.
- Cache sizes are small; altering them? Document memory impact here.

## Performance & accuracy
- Avoid heavy synchronous work inside render paths. GraphEngine classifies each
  visible expression during redraw, so keep parser/classifier operations cheap.

## Testing
- Unit tests:
  - `tests/unit/math/expression-parser.test.js` covers ExpressionParser.
  - `tests/unit/math/line-classifier.test.js` covers line classification rules.
  - `tests/unit/math/parameter-utils.test.js` covers parameter inference rules.
- Run with `npm run test` or `npm run test:run`.
- When modifying math behavior, update/add tests to maintain coverage.

## Known limitations
- **Single-comparator inequalities only**: Chained comparisons are rejected.
- **Parametric expressions**: Not yet supported (`x(t)`, `y(t)`); architecture ready.

## Documentation rule
- Any math-layer change (API, defaults, precision, supported syntax) must be
  recorded here and in root `AGENTS.md`.
