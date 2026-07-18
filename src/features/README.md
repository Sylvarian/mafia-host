# Feature layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. Each user-facing workflow owns one
slice here. Slice internals remain private; cross-slice APIs are exposed only through public
`index` modules.

`game-setup` renders the application setup workflow. `role-distribution` is the private assignment
and physical-card screen. Phase 7A.1 adds one reversible **Mark all cards delivered** control while
retaining individual checkboxes and final confirmation. Components do not shuffle roles, construct
game state, assign Executioner targets, or finalize distribution themselves.

`executioner-briefing` renders exactly one Phase 7A private briefing at a time. It exposes the
Executioner identity and target player name but not the target role. Focus and confirmation state
are local; targets and acknowledgement evidence remain domain/application authority.

Phase 7A.1 replaces the original collect-all Night Runner. `night-runner` renders the Mafia
overview, one actor target step, one immediate outcome, one acknowledged boundary, and final
completion. Target selection is temporary React state and is discarded unless confirmed. Target
rows always show the stable player label, assigned role, faction text, and alive/availability state
with accessible faction, selected, focus, and disabled treatments. Duplicate names use roster
positions, never raw technical IDs.

Blocked actors receive a strong text-labelled **BLOCKED** screen with no target controls. Only the
current private outcome exists in the DOM. Its heading receives focus, the privacy warning remains
visible, and acknowledgement removes the private content before explicit continuation. React does
not construct actions, calculate blocks, frames, visits, investigations, attacks, or deaths. The
coordinating app guards rapid repeated operations and saves each canonical transition once.

Phase 7A.1 removes the old private-result replay from `dawn`. That slice now renders only the
hidden-death `ready-for-dawn` boundary and public Dawn announcement. Its deliberate confirmation
dialog supports Escape cancellation and focus restoration. The public view has no day-discussion
data beyond the announcement. Phase 7B adds the deliberate **Begin day discussion** transition.

`day-discussion` renders a public-safe Day 1 display with semantic living/dead sections, only
authoritative public role reveals, verbal trial guidance, and textual three-vote reminders for
each living revealed Mayor. It contains no nomination, vote, execution, end-day, winner, or
next-night controls.

Opening **Confirm Mayor reveal** makes the public background inert and enters a host-only dialog
with a strong privacy warning. The dialog receives only sanitized candidate IDs and duplicate-safe
labels, never a game, role map, faction, or Executioner target. Radio selection, dialog openness,
focus, and operation guards are temporary React state. Escape and Cancel restore focus; rapid
confirmation is guarded.

`session-persistence` renders public-safe V2 recovery summaries and local-save status. Night
summaries expose only the night number, general stage, player count, and save time. Current actor,
role, target, blocked state, role composition, action progress, and results are absent from text,
attributes, and accessible labels until the host explicitly continues. Errors, dialog openness,
focus, save status, and operation guards remain transient. Day recovery similarly exposes only
generic Day 1 discussion, player count, and save time; revealed or hidden Mayor identities appear
only after Continue.
