# AGENTS.md

## Project purpose

This repository contains a host-operated web application for running in-person Mafia games.

The application must prioritise:

- Correct game-rule resolution
- Clear host workflows
- Maintainable architecture
- Explicit behaviour
- Strong automated tests
- Low cognitive load during live games

`docs/GAME_RULES_AND_PRODUCT_SPEC.md` is the authority for game behaviour.

`docs/IMPLEMENTATION_PLAN.md` is the authority for delivery order and phase boundaries.

Do not silently invent game rules. When behaviour is unresolved, stop implementation of that behaviour and identify the relevant rule decision.

---

## Architecture

The required dependency direction is:

```text
features/UI
    ↓
application
    ↓
domain
```

Infrastructure adapters may depend on domain/application contracts, but domain code must remain framework-independent.

### Domain layer

`src/domain/**` contains:

- Game state
- Role definitions
- Commands and events
- Phase transitions
- Night-action validation
- Resolution logic
- Investigation groups
- Win conditions
- Domain invariants

Domain code must not import:

- React
- React hooks
- Browser APIs
- Feature modules
- UI components
- CSS
- Routes
- Storage implementations
- Application services

Domain functions should be deterministic wherever possible.

Random behaviour must use an injected random-source interface.

### Application layer

`src/application/**` coordinates domain operations.

It may contain:

- Use cases
- Command handlers
- Application selectors
- Session coordination
- Interfaces for external adapters

It must not contain React components or visual formatting.

### Feature layer

`src/features/**` contains user-facing workflows such as:

- Player roster
- Game setup
- Role distribution
- Night runner
- Dawn
- Day dashboard
- Trial
- Game over

Feature slices may call public application APIs.

Feature slices must not import internal files from another feature slice.

Shared behaviour belongs in the domain or application layer when it represents game behaviour.

### Shared UI

`src/shared/ui/**` is only for genuinely reusable presentational components.

Do not move a component into shared UI until at least two independent features need the same behaviour.

Do not create generic `utils`, `helpers`, or `common` dumping grounds.

---

## TypeScript standards

TypeScript strict mode must remain enabled.

Do not weaken compiler settings to avoid fixing an error.

Avoid:

- `any`
- `as unknown as`
- Broad type assertions
- Non-null assertions
- Unvalidated casts
- Unstructured dictionaries where a typed model is appropriate
- Boolean combinations that represent an implicit state machine

Prefer:

- Discriminated unions
- Exhaustive switches
- Branded or clearly named identifier types
- Readonly inputs
- Explicit return types on exported functions
- Small domain-specific types
- Pure functions
- Immutable state transitions

Every switch over a role, phase, command, event, or result union must be exhaustive.

---

## Game-state rules

There must be one authoritative game state.

React component state may contain temporary interface values such as:

- An open dialog
- A currently selected form option
- An unconfirmed target
- Expanded or collapsed sections

React component state must not independently own authoritative information such as:

- Whether a player is alive
- Current game phase
- Assigned role
- Submitted night actions
- Trial outcome
- Personal wins
- Faction victory

Authoritative changes must go through domain/application commands.

Do not mutate game-state objects in place.

---

## Role implementation rules

A role is not complete until it has:

- Documented behaviour
- Typed metadata
- Valid-target rules
- Action collection support
- Domain resolution logic
- Blocked/dead behaviour
- Duplicate-copy behaviour where allowed
- Private-result handling
- Public-result handling where relevant
- Interaction tests
- Win-condition integration where relevant

Do not put role-resolution logic inside React event handlers.

Do not make one role directly know about every other role.

Shared interactions such as attacks, protection, framing, visits, blocking, and investigations must use central resolution modules.

Permanent Investigator and Consigliere groups must be defined as data in one authoritative registry.

---

## Night resolution

Night actions must be collected before the night is resolved.

Physical wake order and domain resolution priority are separate concepts.

The resolution engine should use explicit stages, such as:

1. Validate actions
2. Apply blocks
3. Apply redirects
4. Apply frames and apparent-role effects
5. Establish final visits
6. Apply protections
7. Resolve attacks
8. Resolve pending forced deaths
9. Determine deaths
10. Resolve investigations
11. Resolve Detective results
12. Apply role conversions
13. Evaluate personal wins
14. Evaluate faction outcomes
15. Generate public and private results

Do not rely on incidental array ordering unless the ordering is explicitly modelled and tested.

---

## Function and module quality

Prefer small modules with clear ownership.

Avoid files that mix:

- UI rendering
- Game-rule calculations
- Persistence
- Random generation
- Formatting
- Navigation

A function should have one primary responsibility.

Avoid vague names such as:

- `handleData`
- `processStuff`
- `doAction`
- `updateEverything`
- `misc`
- `helper`

Use domain language from the specification.

Comments should explain constraints, rationale, or unusual rules. Do not add comments that merely restate obvious code.

Do not leave dead code, commented-out implementations, temporary duplicate paths, or unused exports.

---

## Abstraction standards

Do not introduce abstractions solely because they may be useful later.

Do not create:

- Plugin systems
- Generic role scripting
- Generic repositories without persistence
- Service locators
- Dependency-injection frameworks
- Abstract base classes with one implementation
- Redux unless current requirements clearly justify it
- A backend or networking layer
- A database
- A generic design system

Prefer the simplest structure that preserves clear boundaries and testability.

Repeated code may remain local until the shared concept is understood.

---

## Error handling

Domain validation errors must be represented explicitly.

Do not silently catch and ignore errors.

Do not use generic user-facing messages when a specific actionable error is available.

Unexpected states should fail loudly during development.

The UI should prevent invalid host actions where possible, while the domain must still reject them.

---

## Testing requirements

Use Vitest for domain and application tests.

Use React Testing Library for meaningful UI behaviour.

Use Playwright only for important end-to-end host workflows.

Tests must verify behaviour, not internal implementation details.

Do not rely heavily on snapshots.

Every bug fix must include a regression test where practical.

Tests must cover:

- Normal behaviour
- Invalid input
- Boundary conditions
- Duplicate roles
- Dead or blocked actors
- Simultaneous effects
- Pending neutral effects
- Win-condition timing

Do not:

- Skip failing tests
- Delete tests merely to make CI pass
- Change correct expectations to match incorrect implementation
- Use `.only`
- Leave temporary debug output
- Mock the domain engine in tests intended to verify game behaviour

---

## Required checks

Before reporting a task complete, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Run relevant Playwright tests when the affected workflow has end-to-end coverage.

Report the exact result of every command.

A task is not complete while required checks fail.

Do not weaken lint, TypeScript, or test configuration to make checks pass.

Narrow suppressions require an explanatory comment and must be genuinely necessary.

---

## Scope control

Implement only the requested phase or task.

Do not automatically begin the next implementation phase.

Do not add unrelated features or perform broad refactors without explaining why they are necessary.

Do not change documented game behaviour without updating:

1. `docs/GAME_RULES_AND_PRODUCT_SPEC.md`
2. Relevant tests
3. Implementation

When a requested change conflicts with existing architecture, explain the conflict before making a broad structural change.

---

## Codex completion report

Every completed task must report:

### Changed files

List every created, modified, moved, or deleted file.

### Behaviour implemented

Describe the user-visible and domain behaviour added.

### Architecture

Explain any new module boundaries, dependencies, or shared abstractions.

### Tests

List tests added or changed and what each verifies.

### Commands run

List all checks and their outcomes.

### Assumptions

List all assumptions made.

### Unresolved items

List unfinished behaviour, rule decisions, known limitations, and follow-up work.

Do not describe work as complete when important TODOs remain hidden in the implementation.
