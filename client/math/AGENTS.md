# Repository Contribution Guidelines – Math Layer
Math correctness is the product; tread carefully. Update this file whenever you alter math behavior.

## Modules
1. `expression-parser.js`: math.js wrapper, caches parsed expressions (LRU 100). Requires variable `x`
   (optionally `y`); unknown symbols are allowed but warned. `detectVariables` filters to x/y only;
   `getAllVariables` reveals all symbols. Also provides `isSingleVariable()` and `isAssignmentExpression()`
   for detecting single variable names (excluding x/y and constants) and assignment expressions (e.g., `a = 5`),
   extracting variable names and values. Used by ExpressionList for auto-conversion and slider management.
2. `function-evaluator.js`: Evaluates expressions at specific points. Supports multivariate scopes.
   Used by GraphEngine for pixel-by-pixel rendering.
3. `utils/math-formatter.js`: Converts expressions to LaTeX and back; renders with KaTeX.

## Expectations & constraints
- Always include `x` in user expressions; GraphEngine depends on it. Additional parameters (a, b, …)
  are fine and will spawn sliders.
- Keep parsing/evaluation through these modules—no `eval` or new Function.
- Cache sizes are small; altering them? Document memory impact here.

## Performance & accuracy
- Avoid heavy synchronous work inside render paths. GraphEngine renders pixel-by-pixel using `evaluateAt()`.

## Testing
- Unit tests: `tests/unit/math/expression-parser.test.js` covers ExpressionParser with Vitest. Run with `npm run test` or `npm run test:run`.
- Test coverage includes: parsing, variable detection, caching, error handling, evaluation, and all public methods.
- When modifying math behavior, update/add tests to maintain coverage.

## Documentation rule
- Any math-layer change (API, defaults, precision, supported syntax) must be recorded here and in root
  `AGENTS.md`.
