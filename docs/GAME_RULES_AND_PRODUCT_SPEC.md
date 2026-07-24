# Mafia Host — Game Rules and Product Specification

**Status:** Authoritative rules finalized through R-012, Godfather succession, the opposing killing-role final-two draw, the Phase 7F.5 host-only authority correction, and the Phase 7F.6 revealed-Mayor Doctor restriction; implementation complete through Phase 7F.6<br>
**Application type:** Host-operated local-first React web application  
**Primary user:** The game host/moderator  
**Players:** Physically present in the same room  
**Persistence:** One versioned local active-session save; no database or saved-game library<br>
**Deployment:** Static Vite build, suitable for GitHub Pages

---

## 1. Purpose

Mafia Host replaces the host's pen-and-paper bookkeeping while preserving an in-person Mafia game.

The completed product:

- Maintains the player roster.
- Lets the host configure a fixed set of roles for the next game.
- Randomly assigns those selected roles to participating players.
- Guides the host through the correct night sequence.
- Records each role's target.
- Resolves blocking, framing, investigations, protection, attacks, conversions, deaths, and win conditions.
- Supports daytime discussion, trials, voting, executions, and Mayor vote weighting.
- Shows all game information only to the host. Players never view or operate the application screen
  and continue using physical role and result cards.

### Current implementation boundary

The implemented product currently includes:

- Setup.
- Role assignment and physical distribution.
- Executioner target eligibility, assignment, and private briefing.
- Sequential Night 1+ action confirmation and immediate private outcomes.
- Deterministic ordinary night resolution.
- Repeated host Dawns with separate rule-compliant announcements and exact host results.
- Repeated host day discussion with exact current/original roles, alignment, status, and death causes.
- Host strict-majority trial guidance with execution verdict guidance kept separate.
- Deliberate host-confirmed voluntary Mayor reveal and three-vote reminders.
- A default-enabled setting that prevents every Doctor from targeting or protecting a voluntarily
  revealed Mayor on later nights.
- Unified alignment-grouped host player cards and a full-width host execution flow, both using
  canonical active role/alignment without repeated per-card alignment text.
- Three simultaneous Mafia/Town/Neutral target columns with active-role, changed-original-role,
  and alive/dead intelligence while preserving existing target legality.
- A browser-local next-game setup template containing the full ordered roster, participation
  choices, role quantities, and settings but no match progress.
- One stable randomized physical-card recipient order with one-click delivery confirmation.
- Deterministic Godfather succession at the start of Night 2 or later, reported in the existing Mafia overview.
- One final execution or no-execution record per day with separate announcement and host-result sections.
- Explicit death causes, permanent neutral personal wins, pending Jester revenge creation, and
  Executioner-to-Jester conversion after proven non-execution target death.
- Browser-local refresh recovery through setup, Executioner briefing, later nights, mid-revenge
  Dawn resolution, later days, and game over.
- A pending-revenge gate, next-Dawn random revenge death, post-revenge faction victory,
  post-day waiting, and exact host Game Over.
- Day Discussion roles shown by default through a non-persistent host-only convenience toggle.

The application does **not** initially provide:

- Player accounts.
- Player phones or network joining.
- Random role-category slots.
- Secret wake numbers.
- A second display.
- A database or saved-game library.
- Online multiplayer.
- Automated speech or audio cues.

---

## 2. Core design principles

1. **Host controlled:** The host remains responsible for speaking to players, distributing cards, and confirming physical actions.
2. **Fixed visible role composition:** The selected role list is known before play. The app randomises which player receives each role, not which roles exist.
3. **Low memory burden:** Players receive physical role cards and may refer to them throughout the game.
4. **Deterministic rules engine:** Game outcomes are calculated by pure domain logic, not inside React components.
5. **Explicit phases:** The game always occupies one defined phase.
6. **Reversible host mistakes:** The design should allow correction before finalising a phase and should eventually support undo of the most recent committed step.
7. **No silent rule invention:** Any rule still marked unresolved in Section 22 must be decided
   before the corresponding mechanic is considered complete. R-001 through R-012 are finalized.
8. **Host-only authority:** Every application screen is operated by the host. Exact roles, targets,
   causes, transformations, and outcomes may be visible. What the host may announce aloud remains
   governed by game rules and is presented separately where useful.

---

## 3. Recommended technology

- Vite
- React
- TypeScript
- Vitest
- Playwright for a small number of critical browser workflows
- Git and GitHub
- GitHub Actions
- GitHub Pages

Not required initially:

- Backend
- Database
- Dexie or IndexedDB
- Redux
- Authentication
- Cloud synchronisation

The authoritative cross-phase session lives in the application layer and is saved after successful
authoritative transitions to browser `localStorage` under
`mafia-host:active-session:v2`. Browser persistence remains outside the domain game model. Restored
data is untrusted and must be schema-version checked, validated, and canonicalised before it is used.
Recovery may show host-useful player and workflow metadata, but must never rerun randomness, replay
completed results, or put game authority into the URL, document title, console, or history state.

The save is local to one browser profile and device and is not encrypted. It may contain role
assignments, Executioner targets, actions, investigative results, alive/dead state, and public
reveals. It is crash and
refresh recovery, not a backup or cloud sync. Clearing site data removes it, private browsing may
not retain it, and one host tab is recommended because tabs are not synchronised.

Phase 7A.1 uses schema V2 because the sequential immediate-result workflow cannot safely share the
old collect-all/private-replay semantics. V2 persists setup, distribution, Executioner briefing,
the sequential current step and canonical completed records, the current narrow immediate outcome,
the final `night-resolution` boundary, and host Dawn. Phase 7C.1 immediate outcomes exist only
for a current informational or blocked screen; non-informational actions advance immediately and
new saves contain no separate acknowledged-screen state. V2 never
persists temporary target selection, focus, dialogs, operation guards, derived labels, display
prose, colors, or an old private-result queue.

Earlier V2 non-informational `Action recorded` records are validated and canonicalized to the next
actor. Earlier acknowledged-result states advance only when the persisted record proves that the
exact result was acknowledged and the next canonical position is unambiguous. Ambiguous evidence
fails closed rather than redisplaying, guessing, or skipping. Day host-role visibility and derived
host-role view objects are neither emitted nor accepted as authority.

Narrow V1 migration is permitted only for setup, distribution, Executioner briefing, and a valid
first-Dawn save. Old in-progress night-action and private-result-replay saves are rejected with
explicit incompatible-save errors because which private information was already communicated
cannot be reconstructed safely. A rejected V1 save is not silently deleted. A safe migration writes
V2 before removing V1 and preserves V1 if the V2 write fails.

Current V2 persistence supports repeated night/day cycles, selected mid-revenge Dawn resolution,
waiting, and game over. Phase 7F neutral-state sub-version `4` adds exact Godfather promotion
records and the succession enforcement start night. The removed promotion-briefing stage remains
accepted only for deterministic migration into the Mafia overview or exact terminal result.
An exact sub-version `3` save is accepted with empty promotion history and a cutover at its next
future night. Restoration therefore never invents a historical random promotion. Every
sub-version `4` save must contain complete promotion history from its recorded cutover.
Sub-version `3` persists explicit death causes, permanent personal wins, conversions, pending and
resolved revenge authority, and canonical day-outcome history together. Host roster rows,
revealed-Mayor reminders, living execution candidates, and post-day prose remain derived. A prior
neutral-state Dawn save can be upgraded from the exact death identities in its announcement. A
prior Day save with any dead player and no cause evidence is rejected explicitly rather than
inferring a cause from `alive: false`. Current-Dawn construction distinguishes:

- Deaths newly announced at the current Dawn.
- Players who died on earlier nights or days.
- Current versus historical public announcements.

Only deaths whose cause belongs to the current night are announced, so earlier deaths are never
reannounced. Existing neutral-state sub-version 2 saves are upgraded only where their singular
first-cycle authority is unambiguous. No generic migration framework exists.

For Phase 7F.2 compatibility, exact neutral-state sub-version `2`, `3`, or `4` saves that predate the
final-two rule and stopped at an eligible post-day or post-Dawn Godfather/Serial Killer pair are
settled once during restoration. The branch is derived from the stored setting and canonical
active roles without replaying night actions or attacks. Recovery writes the resulting canonical
game-over envelope before it succeeds; a failed write preserves the original save for retry.

Phase 7F.1 keeps schema V2. New role-distribution saves contain only the stage-local bulk status
`pending` or `complete`, never per-player delivery flags. Exact legacy lists with every participant
recorded restore to the completed boundary; zero or partial lists restore to one pending bulk
boundary. Duplicate or unknown legacy records and mixed old/new authority fail closed. Existing
assignments and Executioner targets are never rerolled during restoration.

Phase 7F.3 also keeps schema V2 and neutral-state sub-version `4`. Exact disabled-first-night V2
saves produced under the earlier Doctor-wake rule are revalidated against that narrow historical
rule, then canonicalized without the Doctor step/action and written back only when the payload
changes. An obsolete Executioner `ready` save is accepted only when every canonical briefing ID is
acknowledged; it enters Night 1 directly and is written back as the canonical next stage. Missing,
duplicate, unknown, or partially acknowledged evidence fails closed. Neither migration consumes
randomness, rerolls targets, nor replays private information.

Phase 7F.4 keeps the same schema and neutral-state sub-version. New role-distribution saves persist
the exact stable randomized player-ID delivery sequence. Earlier exact role-distribution saves
without that field receive deterministic roster order and canonical write-back; malformed,
duplicate, unknown, or incomplete sequences fail closed. Exact sequential saves in the former
Consigliere-after-Investigator wake order are replayed into the current order only when every
completed actor/result and the current position are unambiguous. Unsafe or ambiguous progress is
rejected. These compatibility paths consume no randomness and do not replay private information.

Phase 7F.6 retains schema V2 and neutral-state sub-version `4`. New saves contain the explicit
`doctorCannotProtectRevealedMayor` setting. A valid active-session save that predates the field is
canonicalized to `false` for the rest of that match, preserving the rules under which the active
game began. A legacy next-game setup template missing the field is separately canonicalized to
`true`, the new-game default. Both use existing one-time write-back coordination; malformed
explicit values fail closed, and no migration reruns actions, resolution, or randomness. The Day
Show/Hide Roles state remains absent from every persistence payload.

The separate `mafia-host:next-game-setup-template:v1` payload contains exactly ordered setup-only
`roster` entries with string `name` and boolean `playing`, canonical `roleCounts`, and exact
`settings`. It never contains player IDs and never enters the active-session envelope or recovery
metadata. The former names-only key is read only for deterministic migration with every migrated
name Playing and canonical zero-role/default-setting values.

---

## 4. Player roster

The application maintains an editable on-screen roster for setup. After setup is successfully
validated and role assignment begins, the app stores a separate browser-local next-game template
containing the complete roster in order, every Playing/Not playing choice, selected role
quantities, and all reusable settings.
A direct fresh launch with no active save, confirmed abandon, or completed-game
**Start next game** prefills those fields without starting a match.

The template stores no game ID, player ID, role assignment/instance, target, promotion, conversion,
death, outcome, win, revenge, counter, phase, actor, night action, private result, or public reveal
authority. New setup rows receive only setup-local identities; normal assignment creates a new game
identity, derives new match-player identities from that game identity, and creates new role-instance
identities. Active recovery always takes precedence and never merges the template. **Clear saved
setup** affects future prefill only, leaving the visible setup and active save unchanged. This is
local convenience data, not cloud synchronization.

Each roster entry contains:

- Stable player ID
- Display name
- `playing` toggle
- Current-game role assignment
- Alive/dead status
- Publicly revealed role, when applicable
- Executioner target, when applicable
- Converted role, when applicable

### Required behaviour

- Add a player.
- Rename a player.
- Remove a player when no game is active.
- Toggle each player as playing or not playing.
- Show the participating-player count.
- Prevent the game from starting unless the number of selected role slots exactly equals the number of participating players.
- Prevent duplicate blank names.
- Preserve non-participating names in the roster and next-game template so regular friends can be
  toggled back on later in the current setup or a future match setup.

---

## 5. Next-game setup

The setup screen lets the host select the count of every supported role.

Example:

| Role | Count |
|---|---:|
| Godfather | 1 |
| Framer | 1 |
| Doctor | 1 |
| Sheriff | 1 |
| Citizen | 4 |
| Jester | 1 |

### Validation

The app must reject starting a game when:

- Selected role count differs from participating-player count.
- A unique role exceeds its allowed maximum.
- A selected role is not fully implemented.
- A required rule decision for a selected role remains unresolved.
- No Mafia role exists, unless a future special preset explicitly permits it.

### Multiple copies

When more than one copy of a role exists, each receives a stable ordinal for that game:

- Doctor 1
- Doctor 2
- Investigator 1
- Investigator 2

Each copy acts separately and is called separately by the host.

Ordinals are assigned after player-role assignment using a deterministic rule, such as participating-player order. The same living player retains the same ordinal for the rest of the game.

---

## 6. Configurable game settings

The next-game setup includes these settings.

### 6.1 Godfather and Serial Killer mutual attacks

`godfatherAndSerialCanKillEachOther: boolean`

Controls whether the Godfather's attack may kill the Serial Killer and whether the Serial Killer's attack may kill the Godfather.

When disabled:

- Godfather and Serial Killer remain valid targets for one another.
- Their actions are collected normally on nights when they are allowed to act.
- The attacker still visits the selected target during future night resolution.
- The attack has no lethal effect on the targeted Godfather or Serial Killer.

When enabled, their attacks resolve normally during future night resolution.

### 6.2 Godfather Sheriff detection

`godfatherAppearsSuspiciousToSheriff: boolean`

Default: `true`.

When enabled, an unframed Godfather appears suspicious to the Sheriff. When disabled, an unframed Godfather appears not suspicious. A framed Godfather appears suspicious regardless of this setting.

### 6.3 Doctor self-protection

`doctorCanSelfProtect: boolean`

When disabled, a Doctor cannot select themselves.

This restriction applies separately to each Doctor copy.

### 6.4 Doctor repeat-target restriction

`doctorCannotRepeatPreviousTarget: boolean`

When enabled, each Doctor cannot protect the same target they personally protected on the immediately preceding night.

Example:

- Doctor 1 protected Alice last night and cannot protect Alice tonight.
- Doctor 2 protected Ben last night and cannot protect Ben tonight.
- Doctor 1 may protect Ben even if Doctor 2 protected Ben previously.

### 6.5 Revealed Mayor Doctor restriction

`doctorCannotProtectRevealedMayor: boolean`

Default: `true`.

When enabled, a living Mayor remains a legal Doctor target until that Mayor voluntarily announces
during Day Discussion. Starting on the following night, every Doctor copy treats that revealed
Mayor as an illegal target and no Doctor protection can affect the Mayor. A malformed or forged
action is rejected by canonical action validation, and resolution defensively ignores an invalid
protection so it cannot create a Doctor-save event or Dawn claim.

When disabled, a revealed living Mayor remains targetable and protectable. The rule uses only the
existing voluntary `publiclyRevealedRoleId` Mayor authority used for the three-vote reminder. Host
role visibility, `revealRoleOnDeath`, role cards, exact-role displays, alignment, and recovery
metadata do not activate it. Night 1 is independently unchanged because a Mayor cannot announce
before the first Day; the existing disabled-first-night wake rule still controls whether Doctors
act on Night 1. Previous Doctor target history is retained unchanged.

### 6.6 Reveal roles on death

`revealRoleOnDeath: boolean`

When enabled, the morning or execution announcement publicly includes the dead player's role.

When disabled, the host still sees the actual role, but the public announcement contains only the player's name and death information.

### 6.7 First-night killing

`allowFirstNightKills: boolean`

When disabled on night one:

- Every living Doctor, Godfather, and Serial Killer is omitted.
- They are not woken, receive no actor-action step, select no target, submit no action, appear in no action review, and are not required by final batch validation.
- They make no visit and produce no protection or attack attempt.
- Living Godfathers remain visible in the host Mafia overview.
- Consort, Framer, Consigliere, Sheriff, Investigator, and Detective continue acting normally.

On night two and later, Doctor, Godfather, and Serial Killer act normally regardless of this setting. When enabled, they also act normally on night one. No fake skipped action or null-target action is created.

---

## 7. Supported roles

## 7.1 Mafia

### Godfather

- Faction: Mafia
- Night ability: Select one living player to attack.
- Normally acts once per night.
- Attack can be prevented by applicable Doctor protection.
- Interaction with Serial Killer depends on game settings.
- Sheriff treatment follows `godfatherAppearsSuspiciousToSheriff`; framing always makes the Godfather appear suspicious.
- Canonical investigation group: Group A.

At the start of each Night 2 or later, if no living active Godfather exists, exactly one living
participating active Mafia member is selected with the injected random source and permanently
promoted. Candidates are ordered by stable role-instance ordinal and participating roster order.
The promotion is stored before night actions, preserves the original role assignment and role
instance, changes the active role to Godfather, and removes the prior active ability immediately.
The same night's wake order is rebuilt from active roles, so the promoted player acts once as
Godfather and never also acts under the old role. A living original or previously promoted
Godfather prevents another promotion; duplicate living Godfathers are preserved. If a promoted
Godfather later dies, another eligible Mafia member may be promoted at the start of a later night.
No living Mafia means no promotion. Night 1 never promotes.

The existing Mafia overview displays **MAFIA OPEN YOUR EYES**, identifies the promoted player as
the new Godfather, and shows the player's current Godfather and original Mafia roles. Its existing
Continue action advances directly to the first actionable Mafia role. There is no separate
promotion briefing or acknowledgement. Restore and save retry never select or reroll.

Starting the night is also a terminal boundary for the exact Phase 7F.2 final-two case. If the
promotion leaves only the promoted Godfather and a Serial Killer alive, the app resolves the
special draw before exposing any Night action or collecting either finalist's target.

### Framer

- Faction: Mafia
- Night ability: Select one living player to frame for the current night.
- A player framed during the current night appears suspicious to the Sheriff.
- A framed target returns permanent investigation Group A when checked by Investigator or Consigliere.
- Framing does not change the target's actual role or faction.
- Framing expires after the night's investigation results are resolved.

### Consort

- Faction: Mafia
- Night ability: Select one living player to role-block.
- May target any living player other than themselves, including Godfather, Serial Killer, Doctor, or another Consort.
- Multiple Consorts may target the same eligible player.
- Consorts act before every other actionable role and establish block state as soon as their target is confirmed.
- Consorts are immune to role-block effects. A Consort targeting another Consort still visits, but the target is not blocked and performs their action normally.
- If two Consorts target one another, both visits occur and neither is blocked.
- No other currently implemented role has role-block immunity.

### Consigliere (`consig`)

- Faction: Mafia
- Night ability: Investigate one living player.
- Receives the target's permanent investigation group.
- Uses the same permanent role groups as the Town Investigator.
- Each role belongs to exactly one permanent group.
- Groups do not change based on which roles are present in a particular game.

---

## 7.2 Town

### Sheriff

- Faction: Town
- Night ability: Check one living player.
- Receives either:
  - Appears suspicious
  - Appears not suspicious
- Serial Killer and non-Godfather Mafia appear suspicious.
- An unframed Godfather's result follows `godfatherAppearsSuspiciousToSheriff`.
- A player framed during the current night appears suspicious regardless of actual role or the Godfather setting.

### Detective

- Faction: Town
- Night ability: Track one living player.
- Learns whom that player actually visited that night.
- If the tracked player made no successful visit, the result is “visited nobody.”
- Acts after every non-Detective actionable role and receives the result immediately after confirming a target.
- Detective investigation actions never count as visits for another Detective's tracking result.
- The default game configuration may limit Detective to one copy, but the engine should not rely on that limitation.

### Investigator

- Faction: Town
- Night ability: Investigate one living player.
- Receives one permanent three-or-four-role group.
- The host communicates the result using a reusable physical paper/card.
- The same group roles always appear together across all games.
- Players may learn these groups over repeated games.
- It is acceptable for one or two listed alternatives to be absent from the current setup.

Example permanent group:

- Godfather
- Doctor
- Sheriff

If any of those three roles is investigated, the same result card is shown.

### Doctor

- Faction: Town
- Night ability: Protect one living player.
- Protection can prevent Mafia and/or Serial Killer attacks according to the adopted rules.
- Self-protection and repeat-target restrictions are configurable.
- With `doctorCannotProtectRevealedMayor` enabled, a voluntarily revealed living Mayor is not a
  legal target and receives no Doctor protection.
- Multiple Doctors act independently.
- One successful, unblocked protection protects the selected player from every ordinary Godfather and Serial Killer attack during that night.
- Multiple Doctors may protect the same player, but additional protections are not required to stop multiple ordinary attacks.

Example: if the Godfather and Serial Killer both attack Alice and one unblocked Doctor protects Alice, neither ordinary attack kills Alice.

### Mayor

- Faction: Town
- No ordinary night ability.
- May publicly reveal at any time during the day.
- The player verbally asks the host to confirm the reveal.
- The app records the reveal only after deliberate host confirmation.
- Revealing does not consume an action, end discussion, or automatically end the day.
- Once revealed, the Mayor remains publicly revealed, including after death.
- A living revealed Mayor's vote counts as three votes in every player vote, including trial
  nominations, guilty/innocent verdicts, and any other player vote.
- An unrevealed Mayor's vote counts as one. A dead Mayor does not vote.
- The app does not calculate or record the Mayor's weighted votes. The host counts the Mayor as
  three.
- The day UI visibly reminds the host that a revealed Mayor has three votes.
- The same voluntary reveal activates `doctorCannotProtectRevealedMayor` for later nights when that
  setting is enabled; no display-only reveal activates it.

### Citizen

- Faction: Town
- No night ability.
- Participates in discussion and voting.

---

## 7.3 Neutral

### Jester

- Faction: Neutral
- No ordinary night ability.
- Earns a permanent personal win only when executed during the day.
- Does not personally win when killed at night, by revenge, or by another non-execution cause.
- A Jester personal win does not end the main game and may coexist with later Town, Mafia, Serial
  Killer, or Executioner wins.
- Execution creates a pending revenge obligation; no victim is selected at execution time.
- The executed Jester is dead and does not act during the following night.
- Pending revenge prevents every faction victory until it resolves at the next Dawn.
- A living Jester prevents Mafia victory but does not prevent Town victory.
- A Jester is Neutral and is not counted as Town for Mafia parity.
- Duplicate Jesters retain separate stable identities and may earn personal wins independently.
- A Jester killed by another Jester's revenge does not personally win.

### Executioner

- Faction: Neutral
- Receives one randomly selected participating player with a Town role as their target.
- Mafia, Jester, Executioner, Serial Killer, and every other non-Town role are ineligible.
- Target selection uses the injected random source, happens before the first-night briefing, and is
  stored independently for each Executioner.
- Multiple Executioners may share one target.
- At the beginning of the first night, the host privately tells each Executioner their target.
- Earns a permanent personal win if that target is executed during the day.
- A valid target execution does not convert the Executioner. They remain an Executioner, remain in
  the game, and retain their personal win.
- Multiple Executioners sharing one target all earn their personal wins from the same valid
  execution.
- Personal wins do not end the main game and may coexist with later faction and other personal wins.
- If the target dies for any reason other than daytime execution, the Executioner converts into a
  Jester after that death is applied. This includes ordinary night death, a Godfather or Serial
  Killer attack, Jester revenge, and any future non-execution death mechanic.
- Conversion does not revive the Executioner or retroactively grant a Jester personal win. The
  previous target is no longer active, while the relationship remains historical authority.
- Multiple Executioners with the same target convert independently after a non-execution target
  death.
- A living or personally victorious Executioner remains Neutral, does not prevent Mafia victory,
  and is not counted as Town for Mafia parity.

### Serial Killer

- Faction: Neutral killing
- Night ability: Select one living player to attack.
- Attack may be prevented by Doctor protection.
- Appears suspicious to Sheriff.
- Interaction with Godfather follows the mutual-attack setting.
- Wins only when exactly one player remains alive and that player is a Serial Killer.
- Pending Jester revenge prevents Serial Killer victory.
- Multiple living Serial Killers do not win yet.
- No Serial Killer victory occurs when nobody remains alive.
- Previously earned personal wins remain valid alongside a later Serial Killer victory.

---

## 8. Permanent investigation groups

Investigator and Consigliere use the same permanent groups.

Requirements:

- Every investigable role belongs to exactly one canonical group.
- Groups never change between games.
- Missing roles do not alter or regenerate the cards.
- Groups A, B, and C contain three roles; Group D contains four roles.
- Future investigation-card types must support either three or four roles.
- The app stores groups in one authoritative data registry, not conditional or setup-dependent code.
- The app shows the host the exact result card to hold up.
- A player framed during the current night temporarily returns Group A while retaining their actual role and faction.

### Group A

- Godfather
- Doctor
- Sheriff

### Group B

- Framer
- Detective
- Mayor

### Group C

- Consort
- Investigator
- Executioner

### Group D

- Consigliere
- Serial Killer
- Jester
- Citizen

Canonical mapping:

| Actual role | Canonical group |
|---|---|
| Godfather | Group A |
| Doctor | Group A |
| Sheriff | Group A |
| Framer | Group B |
| Detective | Group B |
| Mayor | Group B |
| Consort | Group C |
| Investigator | Group C |
| Executioner | Group C |
| Consigliere | Group D |
| Serial Killer | Group D |
| Jester | Group D |
| Citizen | Group D |

The eventual immutable data type must permit both card sizes, for example:

```ts
type InvestigationGroup = Readonly<{
  id: string;
  label: string;
  roleIds: readonly [RoleId, RoleId, RoleId] | readonly [RoleId, RoleId, RoleId, RoleId];
}>;
```

Cards are never dynamically generated from the selected game setup.

---

## 9. Starting a game

When the host prepares, distributes, and confirms a game:

1. Validate participating-player count against selected role count.
2. Create a fresh game ID in memory.
3. Randomly shuffle the selected role instances.
4. Assign exactly one role instance to each participating player.
5. Assign ordinals to duplicate roles.
6. Initialise alive status.
7. Initialise night-history fields such as each Doctor's previous target.
8. Independently randomize a stable physical-card recipient order with the injected random
   source, then display one numbered private assignment sequence without alignment grouping.
9. The host physically distributes the corresponding role cards in that sequence.
10. The host selects **Confirm all role cards delivered** once after every private card is
    physically delivered. There are no per-player delivery controls or intermediate
    acknowledgement screen.
11. Assign one eligible Town target to every Executioner from the final assignments.
12. If Executioners exist, complete the private briefing one Executioner at a time; delivery of
    the final target immediately enters Night 1 with no ready screen or second confirmation.
13. If no Executioner exists, enter Night 1 action collection immediately.

Role assignment and recipient-order randomization must use the testable injected random source
rather than calling `Math.random()` throughout the domain. The physical order is separate from
role assignment: it is created once per assignment/reassignment, persisted exactly, and never
rerolled during render, confirmation, refresh, or restoration.

Steps 11 and 12 are implemented in Phase 7A. No target exists before final distribution
confirmation. Phase 7F.1 makes the one bulk delivery action atomically perform that confirmation
and enter Executioner briefing or Night 1. Assignment and the stage transition use the injected
random source once per Executioner and never rerun during render, refresh, navigation, save retry,
or restoration. A malformed later-phase game without every required target remains invalid.
Compatible saved distribution stages that predate the recipient-order field use canonical roster
order as a deterministic fallback and are written back in the current shape.

---

## 10. Game phases

```ts
type GamePhase =
  | "roster"
  | "setup"
  | "role-distribution"
  | "executioner-briefing"
  | "night-action-collection"
  | "night-resolution"
  | "dawn-announcement"
  | "day-discussion"
  | "execution-resolution"
  | "game-over";
```

Only defined transitions are allowed.

High-level flow:

```text
Roster
→ Setup
→ Role distribution
→ First night
→ Dawn
→ Day discussion
→ Any number of verbally managed trials and votes
→ Host records an execution, or ends the day without one
→ Next night
→ Repeat
→ Game over
```

---

## 11. Night sequence

## 11.1 First-night Executioner briefing

Implemented in Phase 7A for target communication and acknowledgement.

After Executioner targets have been assigned and before ordinary first-night actions:

1. Tell everyone to close their eyes.
2. If one or more Executioners exist, call each Executioner separately.
3. The app shows the host that Executioner's target.
4. The host privately communicates the target.
5. Host marks the target delivered. The final delivery immediately begins Night 1.

The briefing model contains only stable Executioner/target identities and duplicate-role ordinal.
It does not contain the target's role or faction. Games with no Executioner proceed directly to
Night 1 without creating an empty briefing workflow. There is no `ready` UI state and no final
“Begin Night 1?” confirmation. Rapid operations, Strict Mode, save retry, and recovery may create
the Night 1 workflow only once and may not reroll or replay a delivered target.

## 11.2 Canonical sequential wake order

The authoritative physical order is:

1. Mafia overview
2. Consort copies
3. Framer copies
4. Godfather copies
5. Consigliere copies
6. Serial Killer copies
7. Doctor copies
8. Sheriff copies
9. Investigator copies
10. Detective copies
11. Final night completion

The Mafia overview is private and is not an action. Within a role, copies are ordered by stable
role-instance ordinal with participating roster order as the tie-breaker. Display name, caller
array order, and randomness never affect wake order. Physical order remains distinct from final
ordinary resolution priority.

When first-night killing is disabled, every living Doctor, Godfather, and Serial Killer step is
omitted entirely on Night 1. Those players do not wake, choose a target, create an action, visit,
produce a protection or attack, or receive an immediate confirmation. Living Godfathers remain
visible in the private Mafia overview. The actor indexes close around omitted copies without gaps.
Night 2+ and enabled Night 1 sequences retain all three roles.

## 11.3 Sequential actor flow and blocking

For each actor, the application privately makes the active role the primary heading, follows it
with the concise authoritative host prompt, and then shows legal targets and one main action. The
dominant turn surface uses the active alignment: light red Mafia, light green Town, or light grey
Neutral, with textual alignment context so colour is not the only cue. Promoted Godfathers and
converted roles use the canonical active role/alignment.

Every target screen presents fixed Mafia, Town, and Neutral columns simultaneously. Candidate
cards show a stable human-readable player label, canonical active role, immutable original role
when the active role changed, alive/dead state, and availability. Duplicate names use roster
positions such as `Alex (Player 1)` and raw technical IDs are never displayed. Promoted
Godfathers and converted Jesters are grouped by their active alignment. These additions are
host-only intelligence: the existing domain target validator still solely determines legality,
and column grouping does not add or remove candidates.

For a Doctor, canonical legality also applies the active match's
`doctorCannotProtectRevealedMayor` setting. When enabled, a living Mayor whose existing voluntary
announcement authority is Mayor remains visible in the same alignment/roster position but is
disabled with a concise explanation. Every Doctor copy uses the same stable-player-ID rule. Show
Roles state, death-reveal policy, and presentation metadata have no effect on eligibility.

Target selection is temporary React state. It does not commit, resolve, autosave, consume
randomness, or affect later actors. For Consort, Framer, Godfather, Serial Killer, and Doctor,
**Confirm target and continue** atomically records and seals the action and makes the next actor
current. For Sheriff, Investigator, Consigliere, and Detective, **Confirm target** records the
action and its private result; the single **Continue** operation seals that result
and advances atomically. Earlier actors cannot be edited after later private information may
depend on them.

Confirmed Consort actions establish block state before later actors wake. A blocked non-Consort
still receives its normal wake step but sees:

```text
BLOCKED

Your action cannot be performed tonight.
```

A blocked actor creates no action, visit, frame, attack, protection, investigation, tracking
result, or Doctor previous-target record. Consorts never receive this blocked outcome because they
are immune. Multiple Consorts targeting one non-Consort create one blocked state; mutual
Consort-on-Consort targeting produces two visits and both Consorts act.

The blocked screen has exactly one **Continue** control. It has no target selection,
fabricated action, or second acknowledgement screen.

## 11.4 Immediate outcomes and Detective timing

Only these immediate outcome categories exist:

- Blocked
- Sheriff result
- Investigator group result
- Consigliere group result
- Detective result

Consort, Framer, Godfather, Serial Killer, and Doctor receive no private result screen. Attacks,
protection success, immunity, collisions, and ordinary deaths are not revealed. Sheriff and
permanent investigation groups use frames already confirmed earlier in the same sequence. The host
sees exactly one current private result and one **Continue** control. Continuing
removes the result from the rendered DOM and advances; there is no `Outcome acknowledged` screen.
The role remains the primary heading, the result is large, and the current heading receives focus.

All Detectives act after every other actionable role. A Detective immediately sees the target's
confirmed non-Detective visit, or “visited nobody.” Trackable visits include Consort, Framer,
Godfather, Serial Killer, Doctor, Sheriff, Investigator, and Consigliere. They exclude every
Detective action, blocked actors, skipped first-night killers, and actors without a confirmed
action. Therefore two Detectives tracking one another both receive “visited nobody,” and no second
wake pass is required.

---

## 12. Night resolution

The app incrementally confirms and seals actions, while final ordinary attack/protection/death
resolution remains one deterministic batch after the actor sequence.

### 12.1 Ordinary night resolution

Recommended ordinary-action pipeline:

1. Validate all submitted actions.
2. Apply role blocks.
3. Apply redirects, if redirecting roles are added later.
4. Apply frames and apparent-role effects.
5. Establish the final visit map.
6. Apply protections.
7. Resolve ordinary Godfather and Serial Killer attacks.
8. Determine all ordinary night deaths without applying them one at a time.
9. Resolve Sheriff results.
10. Resolve Investigator and Consigliere groups.
11. Resolve Detective tracking results from the visit map.
12. Expire one-night effects.

Protection resolution defensively excludes a voluntarily revealed Mayor when
`doctorCannotProtectRevealedMayor` is enabled, even if invalid action authority bypasses ordinary
collection. Attacks and deaths then resolve normally, and no successful Doctor-save event can be
generated from that excluded protection.

The pipeline should produce structured events and results, not directly mutate React UI state.

### 12.2 Authoritative Dawn death and victory timing

At Dawn:

1. Resolve ordinary night actions.
2. Determine all ordinary night deaths.
3. Apply all ordinary night deaths simultaneously.
4. Resolve every Executioner-to-Jester conversion caused by those ordinary deaths.
5. Build the survivor list from players still alive.
6. If Jester revenge is pending, randomly select one survivor using the injected random source.
7. Apply the selected victim's unavoidable revenge death.
8. Resolve every Executioner-to-Jester conversion caused by the revenge death.
9. Clear the resolved pending revenge.
10. Check faction victory once, using the final post-Dawn state.

Do not run faction victory checks after individual ordinary deaths. The single final check prevents
victory from depending on arbitrary death-processing order.

The revenge victim:

- Is chosen only after ordinary night deaths are known.
- Must be alive after ordinary night deaths and cannot already be dying from an ordinary night
  cause.
- May have any role or faction.
- Completes their night action normally before Dawn.
- Is selected using the injected random source.
- Cannot be protected by a Doctor.
- Cannot avoid the death through role-blocking.
- Cannot avoid it through Godfather/Serial Killer mutual-kill immunity.
- Cannot avoid it through ordinary attack immunity.
- Uses `revealRoleOnDeath` for public role reveal.

Jester revenge is an unavoidable death obligation, not an ordinary attack.

If ordinary night deaths leave no survivors, no revenge victim is selected, the pending revenge is
cleared, and no faction wins. If exactly one player survives ordinary night deaths, that player is
selected and dies from revenge, leaving no faction winner. Existing personal wins remain recorded
in both cases.

Phase 7E implements this complete ordering. Immediate investigative outcomes are cross-checked
against the same shared mechanics used by final resolution and are not replayed. Ordinary and
revenge deaths receive distinct explicit causes and trigger every qualifying Executioner
conversion exactly once. A selected revenge victim is persisted before application so refresh and
retry cannot reroll the victim.

---

## 13. Dawn

After the last sequential actor is sealed, the application constructs and validates the canonical
completed action batch, resolves ordinary attacks, protections, and provisional deaths, and enters
`night-resolution`. Investigative results have already been communicated during each actor's wake
step and are not presented again. Deaths remain unapplied until the host deliberately selects
**Finalize Dawn** while every player's eyes remain closed. There is no second confirmation dialog.

At this boundary:

- Provisional deaths are applied exactly once.
- Every unblocked Doctor's confirmed target is retained as minimum repeat-target context, even if
  the Doctor or target died or protection was not needed. A blocked Doctor submitted no target.
- `revealRoleOnDeath` controls only whether a role is included in the player announcement. The
  exact current role remains visible to the host.
- Each final death receives an explicit cause.
- Every qualifying Executioner receives one permanent conversion to active Jester behavior while
  retaining the original Executioner assignment and target history.
- Due Jester revenge is resolved before faction victory, then the app enters `dawn-announcement`
  or `game-over`.

Dawn is one host screen with these sections:

- **Announce to players:** each current-night death once in participating-player order, plus a role
  only when the reveal rule authorizes it; or the no-death announcement.
- **Host results:** exact dead players, current roles, changed original roles, causes, attackers,
  and current-night conversions.
- **Important night events:** concise exact confirmed blocks, frames, protected otherwise-lethal
  attacks, and Godfather/Serial Killer immunity outcomes. The section is omitted when empty.

Important-event authority is captured from canonical resolution before the night is applied. A
Doctor-save event exists only when one or more unblocked Doctors' confirmed protection changed an
otherwise-lethal ordinary attack to `protected`. It identifies every relevant Doctor, attacker,
and target. Protection with no lethal attack, a blocked Doctor, and an attack already nonlethal
under the Godfather/Serial Killer setting are not Doctor saves. Events use duplicate-safe labels
and current active roles, include original roles after transformation where useful, and are
validated on recovery for game/night identity, ordering, duplicates, role ownership, outcomes,
and matching death evidence. React never reconstructs them from final alive/dead state.

When the Godfather and Serial Killer attack one another under the nonlethal setting, the host view
may combine the two reciprocal records into one exact event. A one-way attack remains directional.
Immediate investigative results are not repeated at Dawn.

Announcement examples:

```text
Alice died during the night.
```

With role reveal enabled:

```text
Alice died during the night. Their role was Doctor.
```

When nobody dies:

```text
No one died during the night.
```

If first-night kills are disabled, no Doctor, Godfather, or Serial Killer action exists on Night
1, so no protection or killing effect from those roles can exist that night.

The explicit **Continue to Day N** operation validates the authoritative Dawn/game/night match,
increments only the day counter, drops Dawn workflow authority, and enters `day-discussion`. The
announcement combines current ordinary and revenge deaths in roster order without revealing
either cause. Persisted Dawn authority and important-event evidence are current-night-only.

---

## 14. Day discussion

Implemented for repeated daytime discussion and one final outcome per day through Phase 7F.6.

During day discussion, one host display shows every player with:

- Name
- Alive/dead state and exact death cause
- Current active role and alignment
- Original role when transformed
- Role authorized for announcement, if any
- Confirmed Mayor badge
- A visible reminder that each living revealed Mayor has three votes
- Votes required to put a player on trial, derived from living participating players
- Execution guidance that guilty votes must exceed innocent votes and a tie is innocent

Available controls:

- Deliberately confirm a Mayor's verbal public reveal.
- Show or hide roles in place on the unified player cards.
- Execute a living participating player.
- End the day without execution.

Opening the Mayor control lists only living, unrevealed Mayor players. Multiple Mayor copies reveal
independently. The existing
`publiclyRevealedRoleId` field is the only Mayor-reveal authority.

The role control is shown by default and is React-only: it never changes or autosaves the
game/session and returns shown on refresh, recovery, and new-day entry. The initial control says
**Hide roles**. It is a convenience
control, not a privacy boundary. One canonical host selector supplies one fixed three-column
Mafia/Town/Neutral card area with duplicate-safe player labels, visibly distinct living/dead
states, current active role/alignment, immutable original assignment where different, and
announcement-role status. Toggling changes role content in each existing card without moving
or replacing the card. Converted Executioners display active Jester/original
Executioner; promoted Mafia display active Godfather/original assignment. Each full player-card surface
uses the current active alignment's light background: Mafia red, Town green, or Neutral grey.
Column headings provide the textual alignment cue; individual cards do not repeat `Alignment:`
lines. Alive/dead status, active role, and changed original assignment remain textual. These
colors are feature-only and non-persistent.

Both final controls use deliberate host confirmations. The full-width execution candidate layout
groups living candidates under Mafia, Town, and Neutral
without changing canonical roster order inside each group. It contains duplicate-safe player
labels, current active role, and an original assignment only when changed. Column headings carry
alignment, so cards do not repeat alignment lines. Dialog state and temporary selection are not
persisted. The same canonical role-view source supplies target, Day, and execution grouping;
those views do not become persisted authority.

---

## 15. Trial, voting, and execution

Rules finalized. Verbal trial guidance and final outcome recording are implemented through Phase
7F.

Any number of trials may occur during a day. Players manage nominations, discussion, and voting
verbally, while the host counts votes manually. Putting a player on trial requires a strict
majority of living participating players:

```text
floor(living participating players / 2) + 1
```

The host day display derives this threshold after deaths. Zero living players safely displays
one under the same formula; one living player displays one. The threshold does not include Mayor
weight.

Trial verdict options are guilty and innocent. A player is executed only when guilty votes exceed
innocent votes; a tie means innocent. The host may conduct another verbal trial after an innocent
verdict or end the day without an execution.

A revealed Mayor counts as three votes in nomination voting, guilty/innocent verdict voting, and
every other player vote. The host manually counts that vote as three. Mayor reveal does not change
the displayed strict-majority threshold, and the app does not calculate or record the weighted
vote.

The app does not record:

- Nomination attempts.
- Nomination voters.
- Trial count.
- Individual guilty votes.
- Individual innocent votes.
- Vote totals.
- Stored majority calculations.

The host records only the final outcome by selecting **Execute a player** or **End day without
execution**. There is no app-managed trial or vote-counting workflow.

### 15.1 Daytime execution timing

Executing a player immediately ends the day. The authoritative order is:

1. Apply the execution death.
2. Apply public role reveal according to `revealRoleOnDeath`.
3. Award a permanent personal win to every Executioner whose target was validly executed.
4. If the executed player was a Jester:
   - Award that Jester's permanent personal win.
   - Create a pending revenge obligation without selecting a victim.
5. Preserve conversions already caused by proven non-execution deaths; the execution itself
   creates no conversion.
6. Check the opposing killing-role final-two rule, then ordinary faction victory, unless pending
   revenge blocks evaluation.
7. If no faction victory exists, proceed toward the next night.

A valid daytime execution of an Executioner's target awards that Executioner's personal win rather
than converting them. Multiple Executioners who share the target each win from the same valid
execution.

An execution announcement uses `revealRoleOnDeath` to decide whether the dead player's role is
publicly revealed. Personal-win and victory effects are evaluated immediately after the execution
death and its consequences. If executing a Jester creates pending revenge, every faction victory is
blocked and play proceeds toward the next night.

Phase 7C atomically implements steps 1 through 5 and records one immutable `DayOutcome` in
`execution-resolution`. Corrected Phase 7D implements step 6 only when no pending revenge exists.
If revenge is pending, it stops without evaluating any faction predicate. Phase 7E implements step
7 and stores each numbered day outcome without overwriting earlier authority. The post-day summary
separates the announcement authorized by `revealRoleOnDeath` from exact current/original role and
alignment details for the host. Neutral and victory authority remains in the canonical game state.

---

## 16. Win conditions

Personal-win recording is implemented in Phase 7C. Corrected Phase 7D implements faction victory
and game-over presentation only when no Jester revenge is pending. Phase 7F.2 evaluates the
opposing killing-role final-two rule before ordinary faction predicates at the same valid
post-day and post-Dawn boundaries.

The host-only Game Over view shows the prominent winning faction or draw and the complete final
state: every player's exact current/original role, alignment, alive/dead status, death cause,
Executioner target, promotion, conversion, personal wins, and revenge results. The view is derived
from validated terminal authority and is never persisted as display prose.

Personal wins are permanent records attached to the winning player/role instance. They do not end
the main game and may coexist with other personal wins and a later Town, Mafia, Serial Killer
victory, or draw.

### 16.1 Town

Town wins only when all of these are true:

- At least one Town player remains alive.
- No Mafia player remains alive.
- No Serial Killer remains alive.
- No Jester revenge remains pending.

Living Jesters and living Executioners do not prevent Town victory. Neutral players do not become
Town for counting purposes. If nobody remains alive, Town does not win. Previously earned personal
wins coexist with Town victory.

### 16.2 Mafia

Mafia wins only when all of these are true:

- At least one Mafia player remains alive.
- No Serial Killer remains alive.
- Living Mafia equal or outnumber living Town.
- No living Jester remains.
- No Jester revenge remains pending.

Count living Mafia only against living Town. Exclude living Executioners, living Jesters, and all
dead players from parity. A personally victorious Executioner remains Neutral and excluded. A
living Jester is excluded from parity but independently blocks Mafia victory. If nobody remains
alive, Mafia does not win. Previously earned personal wins coexist with Mafia victory.

```text
2 Mafia + 2 Town + 1 Executioner
→ Mafia wins, assuming no Serial Killer, living Jester, or pending revenge.
```

```text
2 Mafia + 2 Town + 1 Jester
→ Mafia does not win because a living Jester remains.
```

### 16.3 Jester

- A Jester earns a personal win only through daytime execution.
- The win is recorded immediately and permanently.
- Execution creates pending revenge for the next Dawn.
- Night death, revenge death, and every other non-execution death do not grant a Jester win.

### 16.4 Executioner

- Each Executioner earns a permanent personal win when their target is executed during the day.
- Multiple Executioners may win from one shared target's execution.
- A target's non-execution death converts each affected Executioner to Jester after the death is
  applied.
- Conversion never retroactively grants a Jester win.

### 16.5 Serial Killer

Serial Killer victory occurs only when exactly one player remains alive and that player is a Serial
Killer. Pending Jester revenge blocks that victory. Multiple surviving Serial Killers do not win
yet, and no Serial Killer wins when nobody survives.

### 16.6 Opposing killing-role final two

After all required ordinary deaths, revenge deaths, and conversions are complete, and only when no
Jester revenge remains pending, exactly two living participating players trigger a special
terminal check before Mafia parity, Serial Killer victory, and the generic no-survivor rule.

The special rule applies only when both current active roles have an ordinary killing action and
their win interests oppose one another. In the current role registry, the only supported pairing
is an active Godfather and an active Serial Killer. A promoted Godfather counts by active role
while retaining the original assignment. Two Mafia members, two Godfathers, multiple Serial
Killers, a killer with Town, Jester, or Executioner, dead owners, and states with any other number
of living players do not use this rule.

The existing Godfather/Serial Killer ordinary-attack authority selects the branch:

- When `godfatherAndSerialCanKillEachOther` is disabled, neither attack is lethal. The game ends
  immediately in a draw with reason `opposing-killers-stalemate`; both players remain alive, no
  showdown death is recorded, and no additional night or target collection begins.
- When `godfatherAndSerialCanKillEachOther` is enabled, both attacks are lethal. One atomic
  terminal confrontation marks both players dead and records exactly two cross-linked
  `final-killing-role-showdown` deaths at the same post-day or post-Dawn boundary. The game then
  ends in a draw with reason `opposing-killers-mutual-elimination`.

When Godfather succession first creates the eligible pair at the start of a later Night, the
same start-night operation performs the terminal check before the wake sequence becomes playable.
Mutual-elimination evidence uses that
started Night's post-Dawn boundary, but no ordinary Night action or target is created.

The mutual-elimination deaths are non-execution deaths. They never create an Executioner personal
win, but they apply any required Executioner conversion and the configured public death-reveal
policy. Existing Mayor reveals and all earlier Jester or Executioner personal wins remain
authoritative and are included in the complete host Game Over view.

This rule has explicit precedence: neither Mafia parity nor Serial Killer victory may override the
draw. It does not change ordinary Town, Mafia, Serial Killer, Jester-revenge, Executioner,
succession, or no-survivor behavior outside this exact state.

### 16.7 No survivors

When nobody remains alive after all required ordinary and revenge deaths:

- No Town, Mafia, or Serial Killer faction wins.
- Previously earned Jester and Executioner personal wins remain recorded.
- The game ends with no faction winner.

Corrected Phase 7D represents this documented no-faction-winner terminal state as a `draw` with
reason `no-survivors`. Phase 7F.2 adds only the two explicit opposing-killer draw reasons described
above. A state with only non-killing Neutral
players alive is not documented as a draw and therefore remains non-terminal. Town, Mafia, and
Serial Killer predicates are derived together; their finalized requirements make them mutually
exclusive. If a future rules change makes more than one true, evaluation fails closed as a
structured contradiction instead of selecting the first checked faction.

---

## 17. Host corrections and undo

Minimum current correction support:

- Before confirmation, the current actor's temporary target may change freely.
- After non-informational confirmation, the action is sealed and the next actor becomes current.
- After informational confirmation, the one current private result is authoritative until the host
  selects **Continue**, which seals and advances atomically.
- A blocked actor is sealed and advanced by the same one-button operation.
- A later actor cannot proceed while an informational or blocked private screen remains current.
- Before confirming execution, the host can cancel or change the selected player.
- Deliberate phase-boundary controls use explicit action labels and inline guidance where needed.

Recommended later support:

- Undo the most recent committed phase transition.
- Rebuild current state from an event log.
- Record manual host corrections as explicit events.

Do not permit arbitrary direct editing of derived game state from React components.

---

## 18. UI areas

Recommended feature slices:

```text
src/
├─ domain/
│  ├─ game/
│  ├─ roles/
│  ├─ executioner/
│  ├─ resolution/
│  ├─ investigation/
│  └─ win-conditions/
├─ application/
│  ├─ commands/
│  ├─ executioner-briefing/
│  ├─ use-cases/
│  └─ selectors/
├─ features/
│  ├─ roster/
│  ├─ game-setup/
│  ├─ role-distribution/
│  ├─ executioner-briefing/
│  ├─ night-runner/
│  ├─ dawn/
│  ├─ day-dashboard/
│  └─ game-over/
└─ shared/
   └─ ui/
```

Feature slices may import application APIs. They must not calculate role interactions themselves.

---

## 19. Required domain entities

```ts
type PlayerId = string;
type RoleId = string;
type GameId = string;

type Player = {
  id: PlayerId;
  name: string;
  playing: boolean;
};

type RoleInstance = {
  instanceId: string;
  roleId: RoleId;
  ordinal: number | null;
};

type GamePlayer = {
  playerId: PlayerId;
  role: RoleInstance;
  alive: boolean;
  publiclyRevealedRoleId: RoleId | null;
};

type ExecutionerTarget = {
  gameId: GameId;
  executionerPlayerId: PlayerId;
  executionerRoleInstanceId: string;
  targetPlayerId: PlayerId;
};

type PersonalWinRecord = {
  playerId: PlayerId;
  roleInstanceId: string;
  kind: "jester" | "executioner";
};

type GameSettings = {
  godfatherAndSerialCanKillEachOther: boolean;
  godfatherAppearsSuspiciousToSheriff: boolean;
  doctorCanSelfProtect: boolean;
  doctorCannotRepeatPreviousTarget: boolean;
  doctorCannotProtectRevealedMayor: boolean;
  revealRoleOnDeath: boolean;
  allowFirstNightKills: boolean;
};
```

Additional types are required for:

- Canonical Executioner target relationships
- Executioner briefing status
- Night actions
- Visit map
- Temporary effects
- Protection
- Attacks
- Investigation results
- Death causes
- Pending Jester revenge obligations
- Role conversion
- Game events
- Faction and personal win results

Personal wins must be durable per player and stable role instance, not represented as one global
neutral-win flag. Multiple Jesters and Executioners keep independent records. Pending revenge must
also identify the Jester role/player instance that created it. Stable duplicate-role ordinals and
role-instance identity continue to apply after conversions; this requirement does not introduce a
generic effect engine.

---

## 20. Testing requirements

Every role interaction must be covered by domain tests.

Minimum scenarios:

- Roles are randomly assigned exactly once.
- Duplicate roles receive stable ordinals.
- Doctor cannot self-protect when disabled.
- Doctor cannot repeat their own previous target when enabled.
- Doctor 1 and Doctor 2 track previous targets independently.
- An unrevealed Mayor remains protectable; a voluntarily revealed Mayor is unavailable to every
  Doctor only while `doctorCannotProtectRevealedMayor` is enabled.
- Invalid revealed-Mayor protection creates no protection, save event, or Dawn claim.
- One bulk delivery action advances exactly once, with no individual delivery authority or second
  confirmation.
- Consort targeting another Consort visits normally and leaves the targeted Consort unblocked.
- Blocked target visits nobody.
- Every blocked actionable role creates no action and sees an explicit BLOCKED outcome.
- Framed Town appears suspicious to Sheriff.
- Framed target returns Group A for Investigator and Consigliere.
- Consigliere and Investigator return the same group.
- Detective immediately sees each supported non-Detective confirmed visit.
- Detective actions never appear in the trackable visit ledger.
- Detectives tracking one another both see “visited nobody.”
- First-night Doctor, Godfather, and Serial Killer actors are omitted when configured; their
  enabled-Night-1 and Night-2+ turns remain canonical.
- Omitted actors create no step, action, placeholder, visit, protection, attack, recovery position,
  or actor-index gap; an otherwise empty sequence reaches direct Dawn.
- Final Executioner target delivery enters Night 1 exactly once without a second confirmation;
  recovery migrates an obsolete fully acknowledged ready stage without reroll or replay.
- Godfather and Serial mutual attack setting behaves correctly.
- Mayor reveal remains public and reminds the host to count every vote as three.
- Trial guidance derives the strict majority from living participants; Mayor weight does not change it.
- The app records no nominations, voters, abstentions, verdict votes, totals, thresholds, or trial history.
- A missing living Godfather on Night 2+ promotes one canonical eligible Mafia member using injected
  randomness; restore/retry never rerolls and the old active ability is absent.
- Jester wins when executed but not when killed overnight or by revenge.
- Jester revenge selects only from post-ordinary-death survivors using injected randomness.
- Jester revenge is unavoidable and blocks every faction victory until resolved.
- Zero- and one-survivor revenge boundaries produce no faction winner.
- Executioner receives an eligible participating Town target.
- Multiple Executioners may independently share one target.
- Multiple Executioners win when their shared target is executed.
- Executioner converts when their target dies from an ordinary night cause or Jester revenge.
- Conversion does not revive the Executioner or retroactively grant a Jester win.
- Role reveal setting changes only public output.
- Dead role instances no longer act.
- Simultaneous ordinary deaths produce one final post-Dawn victory check.
- Town, Mafia, and Serial Killer checks use the finalized R-009, R-011, and R-012 rules.
- Durable personal wins survive later faction victory and no-survivor game over.

---

## 21. Explicit non-goals for the first release

- Saved-game database
- Cloud accounts
- Player mobile clients
- Random basic/advanced role slots
- Secret numbers or wake words
- Automatic role-card printing
- Voice recognition
- Automatic monitor control
- Multiple remote hosts
- Public spectator view
- Full generic custom-role scripting

---

## 22. Rule decisions

R-001 through R-012 are finalized and authoritative. Phase 7A implements the target eligibility,
assignment, and private-briefing portion of R-008. Phase 7B implements first-day discussion and
voluntary Mayor reveal. Phase 7C implements the final day outcome, execution consequences,
permanent Jester and Executioner personal wins, pending-revenge creation, and proven
non-execution-death conversions. Corrected Phase 7D implements faction victory only when pending
revenge is absent, plus safe waiting and game over. Phase 7E implements next-Dawn revenge
resolution and repeated later-night/day gameplay. Phase 7F.2 implements the opposing killing-role
final-two draw with precedence over ordinary faction predicates. Phase 7F.4 changes physical host
ordering and target presentation. Phase 7F.5 establishes the single host-only display model,
separate announcement models, exact Dawn evidence, and promotion-in-Mafia-overview flow without
changing target legality or resolution mechanics. Phase 7F.6 adds only the configurable
revealed-Mayor Doctor restriction and makes Day roles shown by default.

### R-001 — Mutual killing disabled

**Status: Decided.** Godfather and Serial Killer may target one another regardless of `godfatherAndSerialCanKillEachOther`. When the setting is disabled, the attacker still visits during future resolution but the attack has no lethal effect on the targeted Godfather or Serial Killer. When enabled, the attack resolves normally.

### R-002 — First-night killing disabled

**Status: Decided.** When `allowFirstNightKills` is disabled on night one, all living Doctor, Godfather, and Serial Killer actors are omitted entirely. They have no actor-action step, action, immediate outcome, visit, protection, attack attempt, recovery position, or placeholder and are not required in the final batch. Living Godfathers remain in the host Mafia overview. Consort, Framer, Consigliere, Sheriff, Investigator, and Detective continue acting in canonical order. Doctor, Godfather, and Serial Killer act normally when the setting is enabled and on night two or later.

### R-003 — Consort blocking

**Status: Decided.** A Consort may target any living player other than themselves, including another Consort. Consorts act first and each confirmed action immediately contributes its visit and block state for later actors. Consorts are immune to the role-block effect but are still visited. A targeted Consort performs their action normally. Two Consorts targeting one another both visit and neither is blocked. Multiple Consorts targeting the same non-Consort cause one blocked state. A blocked actor still wakes but creates no action, visit, or result. No other currently implemented role has role-block immunity. No retaliation, automatic death, mutual cancellation, or target rejection is added.

### R-004 — Godfather Sheriff result

**Status: Decided.** `godfatherAppearsSuspiciousToSheriff` configures the unframed Godfather's result and defaults to `true`. A framed Godfather appears suspicious regardless of the setting.

### R-005 — Doctor against multiple attacks

**Status: Decided.** One successful, unblocked Doctor protection protects the selected player from every ordinary Godfather and Serial Killer attack during that night. Additional Doctors are not required to stop multiple ordinary attacks.

### R-006 — Jester personal win and revenge

**Status: Finalized and implemented through next-Dawn resolution in Phase 7E.**

- A Jester earns a permanent personal win only when executed during the day.
- A Jester killed at night, through revenge, or through another non-execution cause does not earn a
  personal win.
- A Jester personal win does not end the main game.
- Personal wins may coexist with later Town, Mafia, Serial Killer, or Executioner wins.
- Executing a Jester creates a pending revenge obligation.
- No revenge victim is selected at execution time.
- The executed Jester is dead and does not act during the following night.
- Pending revenge prevents all faction victories from being declared until it resolves at the next
  Dawn.
- A living Jester prevents Mafia victory.
- A living Jester does not prevent Town victory.
- A Jester is Neutral and is not counted as Town for Mafia parity.
- Duplicate Jesters remain independently identifiable and may each earn a personal win
  independently.

At the next Dawn:

1. Resolve ordinary night actions.
2. Determine all ordinary night deaths.
3. Apply ordinary night deaths simultaneously.
4. Resolve any Executioner-to-Jester conversions caused by those ordinary deaths.
5. Build the survivor list from players still alive.
6. Randomly select one surviving player as the Jester revenge victim.
7. Apply the unavoidable revenge death.
8. Resolve any Executioner-to-Jester conversions caused by the revenge death.
9. Clear the pending revenge.
10. Check faction victory using the final post-Dawn state.

The revenge victim is selected using the injected random source only after ordinary night deaths
are known. The victim must be alive after those deaths, cannot already be dying from an ordinary
night cause, may have any role or faction, and completes their night action normally before Dawn.
Doctor protection, role-blocking, Godfather/Serial Killer mutual-kill immunity, and ordinary attack
immunity cannot prevent the death. Public role reveal follows `revealRoleOnDeath`. Revenge is not
an ordinary attack.

If ordinary deaths leave no survivors, no victim is selected, pending revenge is cleared, nobody
wins a faction victory, and existing personal wins remain recorded. If exactly one player survives,
that player is selected and dies from revenge; nobody remains alive, no faction wins, and existing
personal wins remain recorded.

### R-007 — Executioner target non-execution death

**Status: Finalized and implemented for ordinary and revenge deaths through Phase 7E.**

- If an Executioner's target dies for any reason other than daytime execution, that Executioner
  converts into a Jester.
- This includes ordinary night death, a Serial Killer or Godfather attack, Jester revenge, and any
  future non-execution death mechanic.
- Conversion occurs after the relevant death is applied.
- The converted player remains alive or dead according to their own state; conversion does not
  revive anyone.
- Their previous Executioner target is no longer active after conversion, while the relationship
  remains stored as historical authority.
- They follow normal Jester rules from that point onward.
- Conversion does not retroactively grant a Jester personal win.
- Multiple Executioners with the same target convert independently if that target dies through a
  non-execution cause.

### R-008 — Executioner target eligibility and assignment

**Status: Finalized. Eligibility, assignment, and private briefing are implemented in Phase 7A;
personal wins are implemented in Phase 7C; faction integration is implemented in corrected Phase
7D when no revenge is pending.**

- An Executioner target must be a participating player with a Town role.
- Mafia, Jester, Executioner, Serial Killer, and other non-Town roles are ineligible.
- The target is selected randomly using the injected random source.
- Multiple Executioners may receive the same target.
- Each Executioner's target is stored independently.
- Target assignment occurs before the Executioner briefing.
- If the target is executed during the day, the Executioner earns a permanent personal win, remains
  an Executioner, and remains in the game.
- Multiple Executioners sharing the target may all win from the same execution.
- The win does not end the main game and may coexist with later faction and personal wins.
- A living Executioner does not prevent Mafia victory.
- An Executioner remains Neutral and is not counted as Town for Mafia parity.

Phase 7A stores each relationship independently by game, Executioner player, Executioner role
instance, and target player. It assigns only after final distribution, briefs each Executioner
privately, persists exact targets and acknowledgement state, and then permits Night 1. It awards no
personal win and performs no conversion, revenge, or victory evaluation.

### R-009 — Serial Killer victory

**Status: Finalized and implemented in corrected Phase 7D when no revenge is pending.**

- Serial Killer victory occurs only when exactly one player remains alive and that player is a
  Serial Killer.
- Pending Jester revenge prevents Serial Killer victory.
- If multiple Serial Killers remain alive, no Serial Killer victory occurs yet.
- If nobody remains alive, no Serial Killer victory occurs.
- Personal wins already earned remain valid.

### R-010 — Day discussion, trials, voting, and execution

**Status: Finalized and implemented for repeated numbered days through Phase 7F.1.**

- Any number of trials may occur during a day.
- Trial nominations and votes are managed verbally by the players and manually by the host.
- Putting a player on trial requires
  `floor(living participating players / 2) + 1` votes. The day UI displays this derived number,
  while the host remains responsible for counting.
- Trial verdict options are guilty and innocent.
- A player is executed when guilty votes exceed innocent votes.
- A tie means innocent.
- Execution does not use the fixed trial threshold.
- The app records only the final outcome and does not record nomination attempts,
  voters, abstentions, trial count/history, individual votes, or vote totals.
- Phase 7C provides **Execute a player** and **End day without execution**.
- The host may end the day without an execution.
- Executing a player immediately ends the day.
- An execution uses `revealRoleOnDeath` for public role reveal.
- Phase 7C records personal-win effects immediately after the execution death and its
  consequences; corrected Phase 7D evaluates faction victory only when no revenge is pending.
- If executing a Jester creates pending revenge, faction victory remains blocked and play proceeds
  toward the next night.

The app must not implement a managed trial or vote-counting workflow. It stores no nomination,
voter, abstention, guilty/innocent, threshold, or trial-history state.

### Mayor — daytime reveal and vote weight

**Status: Finalized. Voluntary reveal, public persistence, duplicate copies, and the three-vote
reminder are implemented in Phase 7B. Vote tracking is deliberately absent.**

- The Mayor may publicly reveal at any time during the day.
- The player verbally asks the host to confirm the reveal.
- The app records the reveal only after deliberate host confirmation.
- Revealing does not consume an action, end discussion, or automatically end the day.
- Once revealed, the Mayor remains publicly revealed, including after death.
- A revealed Mayor's vote counts as three in all player voting, including trial nominations,
  guilty/innocent verdicts, and any other player vote.
- The app does not calculate or record the Mayor's weighted votes.
- The host is responsible for counting the Mayor as three.
- Mayor weight does not alter the living-player strict-majority trial threshold.
- The day UI visibly reminds the host that a revealed Mayor has three votes.
- When `doctorCannotProtectRevealedMayor` is enabled, this same voluntary reveal makes the Mayor an
  illegal Doctor target on every later night and prevents Doctor protection. When disabled, the
  revealed Mayor remains protectable.
- Host role visibility, `revealRoleOnDeath`, role-card delivery, alignment, and recovery metadata
  do not activate the Doctor restriction.

### R-011 — Town victory

**Status: Finalized and implemented in corrected Phase 7D when no revenge is pending.**

Town wins only when at least one Town player remains alive, no Mafia player remains alive, no
Serial Killer remains alive, and no Jester revenge remains pending.

Living Jesters and living Executioners do not prevent Town victory. Neutral players do not become
Town for counting purposes. If nobody remains alive, Town does not win. Previously earned personal
wins coexist with Town victory.

### R-012 — Mafia victory count

**Status: Finalized and implemented in corrected Phase 7D when no revenge is pending.**

Mafia wins only when at least one Mafia player remains alive, no Serial Killer remains alive,
living Mafia equal or outnumber living Town, no living Jester remains, and no Jester revenge
remains pending.

Compare living Mafia only against living Town. Living Executioners are excluded from parity.
Living Jesters are excluded from parity but independently block Mafia victory. Dead players are
excluded. A personally victorious Executioner remains Neutral and excluded from parity. If nobody
remains alive, Mafia does not win. Previously earned personal wins coexist with Mafia victory.

```text
2 Mafia + 2 Town + 1 Executioner
→ Mafia wins, assuming no Serial Killer, living Jester, or pending revenge.
```

```text
2 Mafia + 2 Town + 1 Jester
→ Mafia does not win because a living Jester remains.
```

---

## 23. Document authority

This file is the current authority for product behaviour and game rules.

When implementation and this document conflict:

1. Do not silently change the implementation to a guessed rule.
2. Add or update an unresolved rule decision.
3. Obtain a rule decision.
4. Update this document.
5. Add or update tests.
6. Implement the approved behaviour.
