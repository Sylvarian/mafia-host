# Mafia Host — Game Rules and Product Specification

**Status:** Authoritative rules finalized through R-012; implementation complete through Phase 7A<br>
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
- Shows only private information to the host. Players continue using physical role and result cards.

### Current implementation boundary

The implemented product currently includes:

- Setup.
- Role assignment and physical distribution.
- Executioner target eligibility, assignment, and private briefing.
- First-night action collection.
- Deterministic ordinary night resolution.
- Private result presentation.
- The first public Dawn.
- Browser-local refresh recovery through setup, Executioner briefing, and that first Dawn.

The following rules are finalized but their gameplay is not implemented:

- Executioner-to-Jester conversion.
- Executioner personal-win awarding.
- Jester personal wins and pending revenge.
- Mayor daytime reveal.
- Host-managed day controls.
- Day execution and ending a day without execution.
- Later nights and Dawns.
- Faction victory calculation.
- Game-over presentation.

These features are planned for Phase 7B or later. A finalized
rule must not be read as evidence that its feature is already available.

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
`mafia-host:active-session:v1`. Browser persistence remains outside the domain game model. Restored
data is untrusted and must be schema-version checked, validated, canonicalised, and acknowledged by
the host before private information is displayed.

The save is local to one browser profile and device and is not encrypted. It may contain role
assignments, Executioner targets, actions, investigative results, alive/dead state, and public
reveals. It is crash and
refresh recovery, not a backup or cloud sync. Clearing site data removes it, private browsing may
not retain it, and one host tab is recommended because tabs are not synchronised.

The Phase 7A compatible V1 extension requires `neutralStateVersion: 1`, Executioner targets, and
briefing status together on every new persisted game. It recognizes deployed Phase 6.5 game shapes
only when both obsolete player-level neutral fields are present and null. Briefing records are
rebuilt from canonical target relationships; persisted authority is limited to the game, current
index, and acknowledgement IDs. Missing or partially upgraded neutral fields remain invalid.

Current V1 persistence supports recovery only through the first Dawn. Its Dawn representation
requires the public announcement to account for every currently dead player. Before supporting
later days and nights, persistence must distinguish:

- Deaths newly announced at the current Dawn.
- Players who died on earlier nights or days.
- Pending Jester revenge obligations.
- Permanent Jester and Executioner personal wins.
- Executioner conversions.
- Current versus historical public announcements.

The current first-Dawn representation must not be reused unchanged for later Dawns because it could
reannounce earlier deaths. Phase 7 must update the persisted session contract deliberately. This
may require a new schema version, or an explicit compatible V1 extension only when validation
remains unambiguous. No migration system currently exists.

---

## 4. Player roster

The application maintains a reusable on-screen roster of player names for the current browser session.

Each roster entry contains:

- Stable player ID
- Display name
- `playing` toggle
- Current-game role assignment
- Alive/dead status
- Publicly revealed role, when applicable
- Mayor reveal status
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
- Preserve non-participating names in the roster so regular friends can be toggled back on later during the same app session.

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

### 6.5 Reveal roles on death

`revealRoleOnDeath: boolean`

When enabled, the morning or execution announcement publicly includes the dead player's role.

When disabled, the host still sees the actual role, but the public announcement contains only the player's name and death information.

### 6.6 First-night killing

`allowFirstNightKills: boolean`

When disabled on night one:

- Every living Godfather and Serial Killer is skipped.
- They are not woken, receive no actor-action step, select no target, submit no action, appear in no action review, and are not required by final batch validation.
- They make no visit and produce no attack attempt.
- Living Godfathers remain visible in the private Mafia overview.
- Framer, Consort, Consigliere, and all applicable Town roles continue acting normally.

On night two and later, Godfather and Serial Killer act normally regardless of this setting. When enabled, they also act normally on night one. No fake skipped action or null-target action is created.

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
- Consort actions are collected and reviewed normally; collection does not calculate a blocking effect.
- During future Phase 5 resolution, Consorts are immune to role-block effects. A Consort targeting another Consort still visits, but the target is not blocked and may perform their submitted action.
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
  - No result
- Serial Killer and non-Godfather Mafia appear suspicious.
- An unframed Godfather's result follows `godfatherAppearsSuspiciousToSheriff`.
- A player framed during the current night appears suspicious regardless of actual role or the Godfather setting.

### Detective

- Faction: Town
- Night ability: Track one living player.
- Learns whom that player actually visited that night.
- If the tracked player made no successful visit, the result is “visited nobody.”
- Detective results are delivered only after all relevant actions and redirects have been resolved.
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
- Conversion does not revive the Executioner, does not retroactively grant a Jester personal win,
  and clears the previous Executioner target.
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
8. Display the private assignment list to the host.
9. The host physically distributes the corresponding role cards.
10. The host confirms that all cards have been distributed.
11. Assign one eligible Town target to every Executioner from the final assignments.
12. If Executioners exist, complete the private briefing one Executioner at a time.
13. Enter Night 1 action collection.

Role assignments must use a testable injected random source rather than calling `Math.random()` throughout the domain.

Steps 11 and 12 are implemented in Phase 7A. No target exists before final distribution
confirmation. Assignment and the stage transition are atomic, use the injected random source once
per Executioner, and never rerun during render, refresh, navigation, or restoration. A malformed
later-phase game without every required target remains invalid.

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
5. Host confirms and continues.

The briefing model contains only stable Executioner/target identities and duplicate-role ordinal.
It does not contain the target's role or faction. Games with no Executioner proceed directly to
Night 1 without creating an empty briefing workflow.

## 11.2 Mafia actions

The app highlights all living Mafia players for the host.

The host calls the Mafia to open their eyes. Mafia roles then act separately in a configured sequence:

1. Godfather
2. Framer
3. Consort
4. Consigliere

Duplicate copies are called by ordinal:

- Consort 1
- Consort 2

The host selects each target in the app.

On night one, when `allowFirstNightKills` is disabled, every living Godfather is omitted from the actor-action sequence. The private Mafia overview still lists those living Godfathers, and the remaining living Mafia roles act in their normal order.

After all living Mafia actions have been collected, the host tells Mafia to close their eyes.

The exact physical procedure for multiple Mafia members is a host concern. The app must never reveal Mafia identities publicly.

## 11.3 Other role actions

The app proceeds through each living role instance that has a night action.

Recommended collection order:

1. Serial Killer
2. Doctor copies
3. Sheriff copies
4. Investigator copies
5. Detective copies

However, the rules engine must not assume that physical collection order equals resolution priority.

On night one, when `allowFirstNightKills` is disabled, every living Serial Killer is omitted from this sequence. On later nights, or when the setting is enabled, living Serial Killers act normally.

For each actor:

- Show role name and ordinal.
- Show actor/player name privately to host.
- Display valid targets.
- Disable invalid targets.
- Allow a “No target” action only where permitted.
- Require host confirmation.
- Move to the next actor.

## 11.4 Detective timing

Detective selects a target during collection, but receives a result only after all actions have been resolved.

A Detective sees the target's **final successful visit**.

Default rules:

- A role-blocked player visits nobody.
- A redirected player is seen visiting the final redirected target.
- A player whose action fails for another reason may still count as visiting, depending on the failure type.
- A player killed that night still acts unless their action was blocked or another explicit priority rule prevents it.

These defaults must be covered by tests.

---

## 12. Night resolution

The app collects actions first and resolves them as one deterministic batch.

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

The currently implemented Phase 5 result stops after structured provisional deaths and
investigative results. Phase 6 applies those provisional deaths only after all private
investigative results have been acknowledged. The conversion, revenge, personal-win, faction-win,
and later-Dawn stages above are finalized rules but remain outside the implemented Phase 6
boundary.

---

## 13. Dawn

After a completed Phase 5 resolution, the host explicitly resolves the night and the active game
enters `night-resolution`. Before players open their eyes, the host receives one player-facing
Sheriff, Investigator, Consigliere, or Detective result at a time in physical collection order.
Blocked investigative actors receive no result. Every presented result must be acknowledged.

The host then deliberately selects **Prepare Dawn Announcement** and confirms that every player's
eyes are open. At this boundary:

- Provisional deaths are applied exactly once.
- Every acting Doctor's submitted target is retained as the minimum next-night repeat-target
  context, even if that Doctor was blocked or died.
- Actual roles are made public only when `revealRoleOnDeath` is enabled or a legitimate public
  reveal already existed.
- The active game enters `dawn-announcement`.

The public Dawn screen shows only:

- The night number.
- Every player who died, once, in participating-player order.
- A publicly revealed role where permitted.
- A no-death message when nobody died.

It does not show causes, attackers, attacks, protections, frames, blocks, investigative results,
hidden roles, neutral effects, or victory information.

Public announcement examples:

```text
Alice was killed overnight.
```

With role reveal enabled:

```text
Alice was killed overnight. Alice was the Doctor.
```

When nobody dies:

```text
It was a quiet night. Nobody died.
```

The source text contained “quiet now”; this specification assumes “quiet night.”

If first-night kills are disabled, no Godfather or Serial Killer action exists on night one, so dawn cannot report a death from either role for that night.

Phase 6 stops at the first `dawn-announcement`. Entering day discussion, resolving Jester revenge,
checking victory, and reaching later Dawns are Phase 7-sequence work and are not currently
available.

The persisted V1 Dawn announcement is safe only at this first-Dawn boundary. Later-Dawn support
must introduce an explicit current-announcement boundary so deaths from earlier nights or days are
not announced again.

---

## 14. Day discussion

Rule finalized; implementation planned for the Phase 7 delivery sequence.

During day discussion, the host dashboard shows every player with:

- Name
- Alive/dead state
- Publicly revealed role, if any
- Confirmed Mayor badge
- A visible reminder that each living revealed Mayor has three votes
- Host-only actual role
- Any host-only status relevant to the current game

Available controls:

- Deliberately confirm a Mayor's verbal public reveal.
- Execute a living player after the host has manually determined a guilty verdict.
- End the day without an execution.

---

## 15. Trial, voting, and execution

Rule finalized; implementation planned for the Phase 7 delivery sequence.

Any number of trials may occur during a day. Players manage nominations, discussion, and voting
verbally, while the host counts votes manually. A nomination requires a majority, but the host is
responsible for determining that majority.

Trial verdict options are guilty and innocent. A player is executed only when guilty votes exceed
innocent votes; a tie means innocent. The host may conduct another verbal trial after an innocent
verdict or end the day without an execution.

A revealed Mayor counts as three votes in nomination voting, guilty/innocent verdict voting, and
every other player vote. The app displays the reminder but does not calculate or record the
weighted vote.

The app does not record:

- Nomination attempts.
- Nomination voters.
- Trial count.
- Individual guilty votes.
- Individual innocent votes.
- Vote totals.
- Majority calculations.

The host records only the final outcome in the app by selecting **Execute a player** or **End day
without execution**. The app must not provide an app-managed trial or vote-counting workflow.

### 15.1 Daytime execution timing

Executing a player immediately ends the day. The authoritative order is:

1. Apply the execution death.
2. Apply public role reveal according to `revealRoleOnDeath`.
3. Award a permanent personal win to every Executioner whose target was validly executed.
4. If the executed player was a Jester:
   - Award that Jester's permanent personal win.
   - Create a pending revenge obligation without selecting a victim.
5. If the executed player was an Executioner target and the death was not a valid execution for
   some relevant Executioner, apply conversions as appropriate.
6. Check faction victory unless pending revenge blocks it.
7. If no faction victory exists, proceed toward the next night.

A valid daytime execution of an Executioner's target awards that Executioner's personal win rather
than converting them. Multiple Executioners who share the target each win from the same valid
execution.

An execution announcement uses `revealRoleOnDeath` to decide whether the dead player's role is
publicly revealed. Personal-win and victory effects are evaluated immediately after the execution
death and its consequences. If executing a Jester creates pending revenge, every faction victory is
blocked and play proceeds toward the next night.

---

## 16. Win conditions

Rule finalized; implementation planned for the Phase 7 delivery sequence.

Personal wins are permanent records attached to the winning player/role instance. They do not end
the main game and may coexist with other personal wins and a later Town, Mafia, or Serial Killer
victory.

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

### 16.6 No survivors

When nobody remains alive after all required ordinary and revenge deaths:

- No Town, Mafia, or Serial Killer faction wins.
- Previously earned Jester and Executioner personal wins remain recorded.
- The game ends with no faction winner.

---

## 17. Host corrections and undo

Minimum initial correction support:

- Before night resolution, the host can go back and change any submitted target.
- Before confirming execution, the host can cancel or change the selected player.
- Before entering the next phase, the host receives a summary confirmation.

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
  mayorRevealed: boolean;
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
- Consort targeting another Consort is collected normally; future resolution leaves the targeted Consort unblocked.
- Blocked target visits nobody.
- Framed Town appears suspicious to Sheriff.
- Framed target returns Group A for Investigator and Consigliere.
- Consigliere and Investigator return the same group.
- Detective sees final visit.
- First-night Godfather and Serial Killer actors are omitted when configured.
- Godfather and Serial mutual attack setting behaves correctly.
- Mayor reveal remains public and reminds the host to count every vote as three.
- The app records no trial nominations, voters, verdict votes, totals, or majority calculations.
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

R-001 through R-012 are finalized and authoritative. Phase 7A implements only the target
eligibility, assignment, and private-briefing portion of R-008. The remaining R-006 through R-012
gameplay is not implemented.

### R-001 — Mutual killing disabled

**Status: Decided.** Godfather and Serial Killer may target one another regardless of `godfatherAndSerialCanKillEachOther`. When the setting is disabled, the attacker still visits during future resolution but the attack has no lethal effect on the targeted Godfather or Serial Killer. When enabled, the attack resolves normally.

### R-002 — First-night killing disabled

**Status: Decided.** When `allowFirstNightKills` is disabled on night one, all living Godfather and Serial Killer actors are skipped entirely. They have no actor-action step, action, review row, visit, or attack attempt and are not required in the final batch. Living Godfathers remain in the private Mafia overview. Other applicable roles continue acting. Killing roles act normally when the setting is enabled and on night two or later.

### R-003 — Consort blocking

**Status: Decided.** A Consort may target any living player other than themselves, including another Consort. Actions are collected normally. During future resolution, Consorts are immune to the role-block effect but are still visited. A targeted Consort may perform their submitted action. Two Consorts targeting one another both visit and neither is blocked. Multiple Consorts targeting the same non-Consort cause one blocked state. No other currently implemented role has role-block immunity. No retaliation, automatic death, mutual cancellation, or target rejection is added.

### R-004 — Godfather Sheriff result

**Status: Decided.** `godfatherAppearsSuspiciousToSheriff` configures the unframed Godfather's result and defaults to `true`. A framed Godfather appears suspicious regardless of the setting.

### R-005 — Doctor against multiple attacks

**Status: Decided.** One successful, unblocked Doctor protection protects the selected player from every ordinary Godfather and Serial Killer attack during that night. Additional Doctors are not required to stop multiple ordinary attacks.

### R-006 — Jester personal win and revenge

**Status: Finalized. Rule finalized; implementation planned for the Phase 7 delivery sequence.**

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

**Status: Finalized. Rule finalized; implementation planned for the Phase 7 delivery sequence.**

- If an Executioner's target dies for any reason other than daytime execution, that Executioner
  converts into a Jester.
- This includes ordinary night death, a Serial Killer or Godfather attack, Jester revenge, and any
  future non-execution death mechanic.
- Conversion occurs after the relevant death is applied.
- The converted player remains alive or dead according to their own state; conversion does not
  revive anyone.
- Their previous Executioner target is no longer active after conversion.
- They follow normal Jester rules from that point onward.
- Conversion does not retroactively grant a Jester personal win.
- Multiple Executioners with the same target convert independently if that target dies through a
  non-execution cause.

### R-008 — Executioner target eligibility and assignment

**Status: Finalized. Eligibility, assignment, and private briefing implemented in Phase 7A;
personal-win and later outcome rules remain planned.**

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

**Status: Finalized. Rule finalized; implementation planned for the Phase 7 delivery sequence.**

- Serial Killer victory occurs only when exactly one player remains alive and that player is a
  Serial Killer.
- Pending Jester revenge prevents Serial Killer victory.
- If multiple Serial Killers remain alive, no Serial Killer victory occurs yet.
- If nobody remains alive, no Serial Killer victory occurs.
- Personal wins already earned remain valid.

### R-010 — Day discussion, trials, voting, and execution

**Status: Finalized. Rule finalized; implementation planned for the Phase 7 delivery sequence.**

- Any number of trials may occur during a day.
- Trial nominations and votes are managed verbally by the players and manually by the host.
- A nomination requires a majority, but the host is responsible for counting it.
- Trial verdict options are guilty and innocent.
- A player is executed when guilty votes exceed innocent votes.
- A tie means innocent.
- The app records only the final outcome and does not record nomination attempts, nomination
  voters, trial count, individual votes, vote totals, or majority calculations.
- The app provides **Execute a player** and **End day without execution**.
- The host may end the day without an execution.
- Executing a player immediately ends the day.
- An execution uses `revealRoleOnDeath` for public role reveal.
- Victory and personal-win effects are evaluated immediately after the execution death and its
  consequences.
- If executing a Jester creates pending revenge, faction victory remains blocked and play proceeds
  toward the next night.

The app must not implement a managed trial or vote-counting workflow.

### Mayor — daytime reveal and vote weight

**Status: Finalized. Rule finalized; implementation planned for the Phase 7 delivery sequence.**

- The Mayor may publicly reveal at any time during the day.
- The player verbally asks the host to confirm the reveal.
- The app records the reveal only after deliberate host confirmation.
- Revealing does not consume an action, end discussion, or automatically end the day.
- Once revealed, the Mayor remains publicly revealed, including after death.
- A revealed Mayor's vote counts as three in all player voting, including trial nominations,
  guilty/innocent verdicts, and any other player vote.
- The app does not calculate or record the Mayor's weighted votes.
- The host is responsible for counting the Mayor as three.
- The day UI visibly reminds the host that a revealed Mayor has three votes.

### R-011 — Town victory

**Status: Finalized. Rule finalized; implementation planned for the Phase 7 delivery sequence.**

Town wins only when at least one Town player remains alive, no Mafia player remains alive, no
Serial Killer remains alive, and no Jester revenge remains pending.

Living Jesters and living Executioners do not prevent Town victory. Neutral players do not become
Town for counting purposes. If nobody remains alive, Town does not win. Previously earned personal
wins coexist with Town victory.

### R-012 — Mafia victory count

**Status: Finalized. Rule finalized; implementation planned for the Phase 7 delivery sequence.**

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
