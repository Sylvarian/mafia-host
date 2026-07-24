# Feature layer

[AGENTS.md](../../AGENTS.md) is the architecture authority. Each user-facing workflow owns one
slice here. Slice internals remain private; cross-slice APIs are exposed only through public
`index` modules.

`game-setup` renders the application setup workflow. `role-distribution` is the private assignment
and physical-card screen. Phase 7F.1 shows every private role card with exactly one
**Confirm all role cards delivered** action and no per-player delivery controls. Phase 7F.4 shows
one numbered stable randomized recipient sequence rather than alignment-grouping the cards. The host remains
responsible for privately handing out every card before pressing it; that one guarded action
immediately enters the correct Executioner or Night 1 stage. Components do not shuffle roles,
construct game state, choose recipient order, or assign Executioner targets themselves.

`executioner-briefing` renders exactly one Phase 7A private briefing at a time. It exposes the
Executioner identity and target player name but not the target role. Focus and confirmation state
are local; targets and acknowledgement evidence remain domain/application authority. Phase 7F.3
makes Executioner the large role heading on a light Neutral surface. **Target delivered** advances
between copies, and the final **Target delivered — begin Night 1** enters Night 1 immediately with
no dialog, ready screen, or extra click.

Phase 7C.1 streamlines the Phase 7A.1 Night Runner. `night-runner` renders the Mafia overview and
one current actor boundary. Consort, Framer, Godfather, Serial Killer, and Doctor use **Confirm
target and continue** with no intermediate result. Sheriff, Investigator, Consigliere, and
Detective show exactly one private result with one **Continue** action. Target selection is
temporary React state and is discarded unless confirmed. Phase 7F.3 makes the active role the
largest heading, shows the concise registry-owned host question next, and uses a dominant light
red Mafia, light green Town, or light grey Neutral surface derived from the active-role selector.
Phase 7F.4 target screens use fixed simultaneous Mafia, Town, and Neutral columns. Cards show the
stable duplicate-safe player label, canonical active role, changed original assignment, alive/dead
state, and availability. Raw technical IDs remain absent, and the application-provided legality
result still solely determines whether a target can be chosen. Phase 7F.6 therefore renders a
voluntarily revealed Mayor in the existing alignment position as disabled for a Doctor, with the
concise reason **Revealed Mayor cannot be protected**, while React adds no game-rule inference.
When first-night kills are disabled, Doctor, Godfather, and Serial Killer are absent from the
application workflow, so the feature renders no skipped/disabled card or placeholder for them.

Blocked actors receive a strong text-labelled **BLOCKED** screen with no target controls. Only the
current private outcome exists in the DOM. Its role heading receives focus, and its only
**Continue** operation removes the private content and advances.
There is no `Action recorded` or `Outcome acknowledged` production screen. React does
not construct actions, calculate blocks, frames, visits, investigations, attacks, or deaths. The
coordinating app guards rapid repeated operations and saves each canonical transition once.

Phase 7A.1 removes the old private-result replay from `dawn`. Phase 7C.1 uses one deliberate
**Finalize Dawn** action plus an inline eyes-closed reminder, with no confirmation dialog. Phase
7F.5 renders one host Dawn with **Announce to players**, **Host results**, and a conditional
**Important night events** section. Exact names, current/original roles, attackers, Doctors,
protected targets, blocks, frames, and immunity reasons come from application view models; React
does not reconstruct resolution. **Continue to Day N** enters the current numbered day.

`day-discussion` renders a numbered host display with one full-width three-column player-card area,
exact current/original roles and announcement-role status, living/dead state and cause, the
strict-majority trial threshold, separate execution guidance, and three-vote Mayor reminders.
**Show roles** / **Hide roles** is a convenience control whose React state never autosaves. Phase
7F.6 initializes roles shown on every new Day mount, so the initial control says **Hide roles**;
hiding lasts only for the current rendered Day and refresh/recovery/new-Day entry shows roles again.
Cards remain in stable Mafia/Town/Neutral positions. Converted Executioners appear as active
Jester/original Executioner and promoted Mafia as active Godfather/original assignment. Raw
persistence IDs never enter the DOM, and the grid avoids horizontal overflow at 320px and 390px.

Mayor, execution, and no-execution controls open focused host confirmation dialogs. Their typed
command candidates and temporary selection remain React state; application/domain authority owns
the resulting reveal or outcome. Background inertness, Escape/cancel, focus restoration, and
rapid-operation guards remain presentation concerns. `day-outcome` renders **Announce to players**
according to `revealRoleOnDeath` and exact **Host results** with role, alignment, and cause.

`session-persistence` renders host-only V2 recovery summaries and local-save status. Summaries show
duplicate-safe player names, numbered stage, player count, save time, and the exact next host
action. They never include raw game/player/role-instance IDs or serialize display prose as
authority. Continue restores the exact validated stage without rerunning randomness or replaying
a completed result.

`game-over` renders a focused host `Game over` heading plus Town, Mafia, Serial Killer, or Draw.
Its responsive final state includes duplicate-safe names, exact current/original roles, alignment,
alive/dead status, causes, Executioner targets, promotions, conversions, personal wins, and revenge
results. Raw IDs never enter its DOM. Both final-two branches arrive as terminal authority, so no
target collection or next-night action is offered.

Phase 7E gives a non-terminal day summary one deliberate **Begin Night N** control. Later nights
reuse `night-runner`; only living actionable active roles appear, and prior actions/results are
absent. `revenge-resolution` names the already-selected random victim and applies the unavoidable
death once. Host Dawn then combines the rule-compliant current-night announcement with exact cause
and event evidence, or the app goes directly to host Game Over.

Phase 7F.5 removes the separate `godfather-promotion` feature. The existing Mafia overview shows
**MAFIA OPEN YOUR EYES**, the exact promoted player, current Godfather role, original Mafia role,
and every living Mafia member. Its existing Continue action advances directly to the first
actionable Mafia role.

Fresh setup may prefill the full ordered roster, Playing/Not playing choices, role quantities, and
settings from the saved next-game template. Phase 7F.6 adds the default-enabled **Revealed Mayor
cannot be protected by a Doctor** control to this existing area and prepared summary. **Clear saved
setup** affects future prefill, keeps the
current fields intact, and never
deletes an active save. Game over provides **Start next game** through the existing explicit
active-save clearing boundary; confirmed abandon uses the same fresh editable prefill. The feature
receives only application callbacks and status text and never accesses browser storage.
