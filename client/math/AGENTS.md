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
   - `isParameter()`: Detects parameter names (excluding x/y and constants)
2. `shared-parser.js`: Singleton ExpressionParser instance so caching is shared
   across components.
3. `line-classifier.js`: Single source of truth for line kinds (`graph`,
   `assignment`, `invalid`, `empty`). Uses `parseAssignmentSyntax()` for syntax
   detection, then applies semantic rules:
   - `y = constant` → `graph` (horizontal line)
   - `x = constant` → `graph` (vertical line, `plotExpression` set to
     `VERTICAL_LINE_MARKER`, `verticalLineX` contains x-value)
   - `param = constant` → `assignment` (parameter definition)
4. `parameter-utils.js`: Derives defined/used parameters and missing assignments
   from classified lines.
5. `parameter-defaults.js`: Default slider metadata `{ value, min, max, step }`.
6. `function-evaluator.js`: Evaluates expressions at specific points. Supports
   multivariate scopes. Used by GraphEngine for pixel-by-pixel rendering.
7. `utils/math-formatter.js`: Converts expressions to LaTeX and back; renders
   with KaTeX.

## Expectations & constraints
- **Syntax vs. Semantics separation**: `parseAssignmentSyntax()` handles pure
  syntax detection; `classifyLine()` applies semantic rules. This separation
  enables consistent handling of all assignment types (`x =`, `y =`, `param =`).
- LineClassifier enforces graph semantics: graph lines require `x` unless
  written as `y = ...` or `x = ...` (vertical line).
- Assignment lines must be constant expressions (`a = 1`, `b = pi`); variable-
  dependent RHS is invalid.
- Vertical lines (`x = constant`) are classified as `graph` with special
  `plotExpression` marker and `verticalLineX` value for rendering.
- Keep parsing/evaluation through these modules—no `eval` or new Function.
- Cache sizes are small; altering them? Document memory impact here.

## Performance & accuracy
- Avoid heavy synchronous work inside render paths. GraphEngine renders
  pixel-by-pixel using `evaluateAt()`.

## Testing
- Unit tests:
  - `tests/unit/math/expression-parser.test.js` covers ExpressionParser.
  - `tests/unit/math/line-classifier.test.js` covers line classification rules.
  - `tests/unit/math/parameter-utils.test.js` covers parameter inference rules.
- Run with `npm run test` or `npm run test:run`.
- When modifying math behavior, update/add tests to maintain coverage.

## Documentation rule
- Any math-layer change (API, defaults, precision, supported syntax) must be
  recorded here and in root `AGENTS.md`.
