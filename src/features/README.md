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
**Finalize Dawn** action plus an inline eyes-closed reminder, with no confirmation dialog. The
public Dawn screen tells the host when players may open their eyes. The public view has no day-discussion
data beyond the announcement. The deliberate **Continue to Day N** transition enters the current
numbered day.

`day-discussion` renders a public-safe numbered-day display with semantic living/dead sections, only
authoritative public role reveals, the living-player strict-majority trial threshold, separate
guilty-greater-than-innocent execution guidance, and textual three-vote reminders for
each living revealed Mayor. Phase 7C adds only **Execute a player** and **End day without
execution** as final controls; it still contains no nomination, vote, winner, revenge-resolution,
or next-night controls.

Phase 7C.1 adds **Show host-only roles** / **Hide host-only roles** only to editable day discussion.
The list and prominent textual warning are absent by default. The component requests the separate
sanitized host-role selector only while visible, and toggle state never autosaves or enters the
application session. Rows are grouped under accessible Mafia, Town, and Neutral headings with
textual red/green/grey treatments. They show duplicate-safe labels, alive/dead state, current
role/alignment, optional original assignment, and separate legitimate public-role status.
Converted Executioners appear as active Jester/original Executioner and promoted Mafia as active
Godfather/original assignment; targets, wins, pending revenge, and raw IDs never enter props or
DOM. Hiding, refresh, recovery, and new-day entry all return to the public-safe view. Controls retain
44px minimum targets, and the owned grid avoids horizontal overflow at 320px and 390px.

Opening **Confirm Mayor reveal** makes the public background inert and enters a host-only dialog
with a strong privacy warning. The dialog receives only sanitized candidate IDs and duplicate-safe
labels, never a game, role map, faction, or Executioner target. Radio selection, dialog openness,
focus, and operation guards are temporary React state. Escape and Cancel restore focus; rapid
confirmation is guarded.

The execution control opens a host-only alert dialog containing living duplicate-safe player
labels, current active roles, textual alignments, and an optional changed original assignment. It
never shows Executioner targets, personal wins, pending revenge, or predicted neutral effects. The
no-execution control has its own irreversible confirmation. Both make the background inert,
support Escape/cancel and focus restoration, keep selection and guards in React only, and guard
rapid confirmation. `day-outcome` renders a focused public summary with only the executed name and
authorized role reveal, or “No player was executed.” Corrected Phase 7D and Phase 7E use the same
public “The game continues” copy whether revenge is privately pending or no faction has won, then
offer the explicit next numbered night without exposing the pending obligation.

`session-persistence` renders public-safe V2 recovery summaries and local-save status. Night
summaries expose only the night number, general stage, player count, and save time. Current actor,
role, target, blocked state, role composition, action progress, and results are absent from text,
attributes, and accessible labels until the host explicitly continues. Errors, dialog openness,
focus, save status, and operation guards remain transient. Day recovery similarly exposes only
generic numbered-day discussion, player count, and save time; revealed or hidden Mayor identities appear
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

Phase 7E gives a non-terminal day summary one deliberate **Begin Night N** control. Later nights
reuse `night-runner`; only living actionable active roles appear, and prior actions/results are
absent. `revenge-resolution` is a focused host-only Dawn screen shown only after recovery Continue.
It names the already-selected random victim, warns the host to keep the screen private, and applies
the unavoidable death once. The public Dawn then combines only current ordinary/revenge deaths
without causes, or the app goes directly to public-safe Game Over. **Continue to Day N** and the
existing day controls repeat for later cycles; host-role visibility resets hidden on each entry
and recovery.

Phase 7F adds `godfather-promotion`, a focused host-only screen before a newly promoted player's
first later-night action. Its heading receives focus, its warning and duplicate-safe identity wrap
at 320px/390px, and its only 44px control continues to night actions. It cannot be dismissed with
Escape. Save failure leaves the same briefing visible.

Fresh setup may show editable remembered names and a setup-only **Clear remembered names** control.
Clearing affects future prefill, keeps the current fields intact, and never deletes an active save.
The feature receives only application callbacks and status text; it never accesses browser storage.
