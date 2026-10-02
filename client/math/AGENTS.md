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
   - `parsePointsSyntax()`: Detects `points([[x,y], ...])` and single-point
     tuple shorthand `(xExpr, yExpr)`, then extracts coordinate expression pairs.
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
   - `(xExpr, yExpr)` → `graph`, `graphMode: 'points'`, one
     `plotData.points` pair
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
8. `inequality-boundary.js`: `resolveInequalityBoundary(plotData, scope)` for
   inequality `plotData`. Returns:
   - `{ type: 'explicit', fn }` when F = (lhs) - (rhs) is linear in y with a
     y-coefficient free of x and y. `y <op> expr` / `expr <op> y` reuse `expr`
     verbatim (through `toFunctionPlotSyntax`), otherwise
     `fn = simplify(-F(x, 0) / (dF/dy))` printed with explicit `*`. `fn` may
     reference parameters (callers pass `scope` to the datum).
   - `{ type: 'vertical', x }` when F has no y (or y cancels) and is linear in
     x (`x = -F(0) / (dF/dx)`, evaluated with `scope`).
   - `null` otherwise: nonlinear in y (`x^2 + y^2 < 9`, `sin(y) > x`), a
     y-coefficient that depends on x (`x*y > 1`, which could hide vertical
     components of the zero set), nonlinear x-only (`x^2 < 4`), or a scope
     that makes the coefficient 0 or non-finite (e.g. slider `a = 0` in
     `a*y > x`).
   Symbolic analysis (parse, `derivative`, `simplify`) is LRU-cached per
   `boundaryExpression` (200 entries); per-render work is only numeric
   evaluation of the cached compiled coefficients.
9. `inequality-field.js`: `compileInequalityField(boundaryExpression, scope)`
   returns `{ key, evaluateGrid(xs, ys), evaluateAt(x, y) }` or `null` (parse
   failure / empty input). F is split at top-level `+`, `-`, unary `-` into
   terms; each term is constant, x-only, y-only, a product/quotient of
   single-axis factors (`x*y`, `2*x*y/3`), or mixed. `evaluateGrid` evaluates
   x-only terms and x-factors once per column, y-only terms and y-factors once
   per row, and only mixed terms (`sin(x*y)`, `(x^2 + y^2)^2`) per cell, into a
   row-major `Float64Array` (`values[j * xs.length + i]`). Each term also gets
   a numeric fast path (`compileFast`): plain closures composed over the AST
   (no code generation) for numbers, x, y, bound parameters, pi/e,
   `+ - * / ^`, unary +/-, and the one-argument functions whose math.js number
   implementation is the same `Math.*` call (sin, cos, tan, asin, acos, atan,
   sinh, cosh, tanh, exp, log, sqrt, abs). A finite fast result is used as is;
   anything else (NaN where math.js would return a Complex, infinities,
   unsupported nodes such as `cbrt`, `floor`, `mod`, 2-argument `log`) is
   evaluated by math.js (compiled, Map scope). `pow` keeps NaN for NaN inputs
   (`Math.pow(NaN, 0)` is 1). A non-number math.js result (Complex from
   `sqrt(-1)`, a thrown error such as an undefined symbol) becomes NaN.
   math.js never turns a Complex back into a number under `+ - * /`, so a value
   is finite exactly when whole-expression evaluation would be; only float
   association differs (~1e-16 relative). Adding a function to the fast list
   requires its math.js number implementation to be exactly that `Math.*`
   call for every input where the result is finite (`round`, `floor`, `ceil`,
   `cbrt`, `mod` are not). `evaluateAt` uses the same summation
   order, so it reproduces grid values bit for bit. `key` is the expression
   plus the values of the parameters it references (unrelated sliders do not
   invalidate caches). Term analysis is LRU-cached per expression (200
   entries).
10. `marching-squares.js`: `traceContours(values, cols, rows, xs, ys,
    { evaluate })` traces F = 0 on a sampled grid into polylines in xs/ys
    coordinates. Corners count as inside when F > 0; crossings are linearly
    interpolated; cells with a non-finite corner are skipped (curves stop at
    domain gaps); saddles use the cell mean. Segments are joined through shared
    edge points into open curves (ending on the grid border or a gap) or
    closed loops (first point repeated). With `evaluate`, each crossing is
    classified once: F at the interpolated point must not exceed the sample on
    its side (fast path), else 4 bisection steps decide (|F| shrinks at a root,
    grows at a pole); pole crossings are dropped, so `x/y > 1` gets no line on
    y = 0 and `tan`/`1/(...)` boundaries show only their F = 0 curves.

## Expectations & constraints
- **Syntax vs. Semantics separation**: `parseAssignmentSyntax()` and
  `parseFunctionDefinitionSyntax()` handle pure syntax detection; `classifyLine()`
  applies semantic rules. This separation enables consistent handling of all
  assignment types (`x =`, `y =`, `param =`), function definitions
  (`f(x) = expr`), and non-function graph payloads (`(xExpr, yExpr)`, `points(...)`,
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
- Inequality shading/tracing samples ~100k grid cells per zoom/pan frame. A
  whole-expression math.js evaluation costs ~150 ns, so per-cell evaluation is
  ~15 ms per inequality per frame; `inequality-field.js` keeps per-cell work to
  arithmetic for separable boundaries (lines, circles, ellipses, `x*y`), and
  mixed terms run through the numeric fast path (math.js only where it returns
  NaN or uses unsupported functions, where the per-cell price remains).
- Traced boundaries are accurate to linear interpolation on the 3px grid
  (sub-pixel for smooth curves); features thinner than one 3px cell can be
  missed, unlike function-plot's interval renderer.

## Testing
- Unit tests:
  - `tests/unit/math/expression-parser.test.js` covers ExpressionParser.
  - `tests/unit/math/line-classifier.test.js` covers line classification rules.
  - `tests/unit/math/parameter-utils.test.js` covers parameter inference rules.
  - `tests/unit/math/inequality-boundary.test.js` covers boundary solving
    (explicit, vertical, implicit fallback, scope-dependent degeneracy).
  - `tests/unit/math/inequality-field.test.js` compares grid values with
    whole-expression math.js evaluation (separable, products, mixed, domains,
    poles, parameters, Complex-sensitive cases such as `abs(sqrt(x*y))`),
    checks math.js reads x/y once per column/row unless a term is mixed, and
    that the fast path skips math.js except where it yields NaN.
  - `tests/unit/math/marching-squares.test.js` covers closed loops, multiple
    components, open curves, domain gaps, saddles, pole rejection and tangent
    points between grid vertices.
- Run with `npm run test` or `npm run test:run`.
- When modifying math behavior, update/add tests to maintain coverage.

## Known limitations
- **Single-comparator inequalities only**: Chained comparisons are rejected.
- **Traced boundaries are grid-limited**: genuinely implicit boundaries
  (circles, `y^2 < 4`, `x^2 < 4`, `x*y > 1`) are traced on the 3px shading
  grid, so loops or gaps smaller than a cell can vanish, and pole edges of a
  region (`tan(x*y) > 1`) are not drawn.
- **`ln` in inequality shading**: shading evaluates the raw boundary with
  math.js, which has no `ln`, so `y < ln(x)` draws its boundary (plot text maps
  `ln` -> `log`) but shades nothing (pre-existing; unchanged).
- **Parametric expressions**: Not yet supported (`x(t)`, `y(t)`); architecture ready.

## Documentation rule
- Any math-layer change (API, defaults, precision, supported syntax) must be
  recorded here and in root `AGENTS.md`.
