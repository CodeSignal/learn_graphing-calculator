# Repository Contribution Guidelines – Math Layer
Math correctness is the product; tread carefully. Update this file whenever you alter math behavior.

## Modules
1. `expression-parser.js`: math.js wrapper, caches parsed expressions (LRU 100). Requires variable `x`
   (optionally `y`); unknown symbols are allowed but warned. `detectVariables` filters to x/y only;
   `_extractVariables` reveals all symbols.
2. `function-evaluator.js`: Evaluates expressions at points/ranges, detects discontinuities, finds
   zeros, adaptive sampling, 2D grid evaluation, supports multivariate scopes.
3. `numerical-methods.js`: Riemann/trapezoid/Simpson integrals, Newton/bisection roots, numerical
   derivatives, interpolation, gradient.
4. `calculus-engine.js`: Symbolic derivative via math.js, numerical fallback, limit approximation,
   Taylor series, critical points, tangent/secant, integrate via numerical methods.
5. `utils/math-formatter.js`: Converts expressions to LaTeX and back; renders with KaTeX.
6. `utils/expression-detector.js`: Detects single variable names (excluding x/y and constants) and assignment expressions (e.g., `a = 5`), extracting variable names and values. Used by ExpressionList for auto-conversion and slider management.

## Expectations & constraints
- Always include `x` in user expressions; GraphEngine depends on it. Additional parameters (a, b, …)
  are fine and will spawn sliders.
- Keep parsing/evaluation through these modules—no `eval` or new Function.
- If you change supported functions/constants, update the static helpers in `expression-parser.js`.
- Cache sizes are small; altering them? Document memory impact here.

## Performance & accuracy
- Avoid heavy synchronous work inside render paths; prefer coarse sampling then adaptive refinement.
- math.js derivative can throw; calculus-engine falls back to numerical—keep both paths working.

## When extending
- New numeric methods: place in `numerical-methods.js`, export statically, document assumptions.
- New calculus features: add to `calculus-engine.js`, ensure they interoperate with ExpressionParser
  and FunctionEvaluator, and document here plus root AGENTS.

## Testing
- Unit tests: `tests/unit/math/expression-parser.test.js` covers ExpressionParser with Vitest. Run with `npm run test` or `npm run test:run`.
- Test coverage includes: parsing, variable detection, caching, error handling, evaluation, and all public methods.
- When modifying math behavior, update/add tests to maintain coverage.

## Documentation rule
- Any math-layer change (API, defaults, precision, supported syntax) must be recorded here and in root
  `AGENTS.md`.
