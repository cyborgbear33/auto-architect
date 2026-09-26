# Default continuous-improvement dimensions

A starting taxonomy for `kaizen-audit`. Edit freely per project — add domain-specific dimensions (e.g. a data-heavy app might add "data quality"; a project with its own semantic model might add "ontology coverage") or drop ones that don't apply (e.g. drop UX/Accessibility for a library with no UI).

For each dimension, an audit pass should be able to answer a concrete question, not just "does this seem fine."

## Correctness / Functionality
Does the code do what it claims? Ask: what's the specific input/state that produces a wrong output, a crash, or silently wrong behavior?

## Security
Ask: where does untrusted input reach a sensitive sink (query, shell, filesystem, auth check) without validation? Any secrets in code/logs? Any dependency with a known CVE actually reachable from this app's usage?

## Performance
Ask: what's measurably slow, and under what load? Require a baseline before proposing a fix — don't optimize from intuition.

## Reliability / Stability
Ask: what fails intermittently, retries wrong, or loses data/state on a crash mid-operation? Use failure rates, flaky tests, and incident history as evidence, not guesses.

## Maintainability / Code Quality
Ask: what's duplicated, overly complex, or structured in a way that made this exact area hard to change? Prefer the `code-review`/`simplify` skills for this dimension.

## Test Coverage
Ask: what real, non-trivial behavior has no test that would fail if it broke? Prioritize recently-changed or high-risk code over exhaustive coverage counting.

## Documentation Accuracy
Ask: what does a doc claim that the code no longer does (or never did)? Drift, not absence, is the higher-value find.

## Dependency Health
Ask: what's outdated or vulnerable, and is the vulnerable code path actually reachable? Use the project's own native audit tooling.

## Developer Experience
Ask: what slows down building, testing, or onboarding to this repo — flaky CI, slow test suites, unclear setup steps?

## UX / Accessibility
(Skip if the project has no UI.) Ask: where does a real user get stuck, confused, or excluded (keyboard/screen-reader access, unclear error states)?

## Cost Efficiency
Ask: what's spending more (compute, API/token cost, storage) than the value it returns?
