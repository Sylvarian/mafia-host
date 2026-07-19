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

Phase 7C.1 streamlines the Phase 7A.1 Night Runner. `night-runner` renders the Mafia overview and
one current actor boundary. Consort, Framer, Godfather, Serial Killer, and Doctor use **Confirm
target and continue** with no intermediate result. Sheriff, Investigator, Consigliere, and
Detective show exactly one private result with one **Continue to next actor** action. Target
selection is temporary React state and is discarded unless confirmed. Target
rows always show the stable player label, assigned role, faction text, and alive/availability state
with accessible faction, selected, focus, and disabled treatments. Duplicate names use roster
positions, never raw technical IDs.

Blocked actors receive a strong text-labelled **BLOCKED** screen with no target controls. Only the
current private outcome exists in the DOM. Its heading receives focus, the privacy warning remains
visible, and its only **Continue to next actor** operation removes the private content and advances.
There is no `Action recorded` or `Outcome acknowledged` production screen. React does
not construct actions, calculate blocks, frames, visits, investigations, attacks, or deaths. The
coordinating app guards rapid repeated operations and saves each canonical transition once.

Phase 7A.1 removes the old private-result replay from `dawn`. That slice now renders only the
hidden-death `ready-for-dawn` boundary and public Dawn announcement. Phase 7C.1 uses one deliberate
**Show Dawn announcement** action plus an inline eyes-open reminder, with no confirmation dialog.
The public view has no day-discussion
data beyond the announcement. Phase 7B adds the deliberate **Begin day discussion** transition.

`day-discussion` renders a public-safe Day 1 display with semantic living/dead sections, only
authoritative public role reveals, verbal trial guidance, and textual three-vote reminders for
each living revealed Mayor. Phase 7C adds only **Execute a player** and **End day without
execution** as final controls; it still contains no nomination, vote, winner, revenge-resolution,
or next-night controls.

Phase 7C.1 adds **Show host-only roles** / **Hide host-only roles** only to editable day discussion.
The list and prominent textual warning are absent by default. The component requests the separate
sanitized host-role selector only while visible, and toggle state never autosaves or enters the
application session. Rows show duplicate-safe labels, alive/dead state, current role, optional
original assignment, and separate legitimate public-role status. Converted Executioners appear as
active Jester/original Executioner; targets, wins, pending revenge, and raw IDs never enter props or
DOM. Hiding, refresh, recovery, and new-day entry all return to the public-safe view. Controls retain
44px minimum targets, and the owned grid avoids horizontal overflow at 320px and 390px.

Opening **Confirm Mayor reveal** makes the public background inert and enters a host-only dialog
with a strong privacy warning. The dialog receives only sanitized candidate IDs and duplicate-safe
labels, never a game, role map, faction, or Executioner target. Radio selection, dialog openness,
focus, and operation guards are temporary React state. Escape and Cancel restore focus; rapid
confirmation is guarded.

The execution control opens a host-only alert dialog containing only living duplicate-safe player
labels. It never shows roles, factions, Executioner targets, or predicted neutral effects. The
no-execution control has its own irreversible confirmation. Both make the background inert,
support Escape/cancel and focus restoration, keep selection and guards in React only, and guard
rapid confirmation. `day-outcome` renders a focused public summary with only the executed name and
authorized role reveal, or “No player was executed,” followed by an explicit not-yet-implemented
boundary. Corrected Phase 7D extends that summary with either private-safe next-Dawn deferral or a
no-faction-yet message. It has no next-night or revenge action.

`session-persistence` renders public-safe V2 recovery summaries and local-save status. Night
summaries expose only the night number, general stage, player count, and save time. Current actor,
role, target, blocked state, role composition, action progress, and results are absent from text,
attributes, and accessible labels until the host explicitly continues. Errors, dialog openness,
focus, save status, and operation guards remain transient. Day recovery similarly exposes only
generic Day 1 discussion, player count, and save time; revealed or hidden Mayor identities appear
only after Continue. Post-day recovery likewise shows only generic “Day complete” metadata until
Continue and never exposes personal wins, conversions, pending revenge, or targets.

`game-over` renders a focused public `Game over` heading plus Town, Mafia, Serial Killer, or Draw.
Its responsive roster contains only duplicate-safe names, alive/dead state, and roles already
legitimately public. Hidden roles are not automatically revealed; targets, conversions, pending
revenge, personal wins, and raw IDs never enter its props or DOM. The feature has no next-night,
revenge, or role-reveal control and remains usable without horizontal overflow at 320px and 390px.

Waiting recovery remains generic `Day complete` even when private pending revenge exists. Game-over
recovery may show only `Game over`, its public faction/draw, Day number, player count, and saved
time before Continue.
