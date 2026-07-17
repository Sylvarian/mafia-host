# Application layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. This directory coordinates domain
operations through focused use cases and external-adapter contracts.

`game-setup` owns the single Phase 2 pre-game draft, immutable roster and role-count operations,
derived counts, structured validation, and the editing/ready workflow. A validated setup contains
participating players, role counts, and settings only. It does not create `GameState`, assign roles,
or use randomness.

All five settings begin as `false` only as provisional form defaults. The specification does not
yet designate authoritative defaults, and these initial values do not resolve any open rule.
