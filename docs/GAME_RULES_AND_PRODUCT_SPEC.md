# Mafia Host — Game Rules and Product Specification

**Status:** Initial product authority  
**Application type:** Host-operated local-first React web application  
**Primary user:** The game host/moderator  
**Players:** Physically present in the same room  
**Persistence:** No saved games or database in the initial release  
**Deployment:** Static Vite build, suitable for GitHub Pages

---

## 1. Purpose

Mafia Host replaces the host's pen-and-paper bookkeeping while preserving an in-person Mafia game.

The application:

- Maintains the player roster.
- Lets the host configure a fixed set of roles for the next game.
- Randomly assigns those selected roles to participating players.
- Guides the host through the correct night sequence.
- Records each role's target.
- Resolves blocking, framing, investigations, protection, attacks, conversions, deaths, and win conditions.
- Supports daytime discussion, trials, voting, executions, and Mayor vote weighting.
- Shows only private information to the host. Players continue using physical role and result cards.

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
7. **No silent rule invention:** Unresolved rules in Section 16 must be decided before the corresponding mechanics are considered complete.

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

The active game may live in React/application memory. Optional browser crash recovery may be added later using `sessionStorage` or `localStorage`, but it is not part of the authoritative game model.

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

The exact disabled behaviour must be selected in rule decision **R-001**.

### 6.2 Doctor self-protection

`doctorCanSelfProtect: boolean`

When disabled, a Doctor cannot select themselves.

This restriction applies separately to each Doctor copy.

### 6.3 Doctor repeat-target restriction

`doctorCannotRepeatPreviousTarget: boolean`

When enabled, each Doctor cannot protect the same target they personally protected on the immediately preceding night.

Example:

- Doctor 1 protected Alice last night and cannot protect Alice tonight.
- Doctor 2 protected Ben last night and cannot protect Ben tonight.
- Doctor 1 may protect Ben even if Doctor 2 protected Ben previously.

### 6.4 Reveal roles on death

`revealRoleOnDeath: boolean`

When enabled, the morning or execution announcement publicly includes the dead player's role.

When disabled, the host still sees the actual role, but the public announcement contains only the player's name and death information.

### 6.5 First-night killing

`allowFirstNightKills: boolean`

Recommended default behaviour when disabled:

- Killing roles still select targets.
- Visits are still recorded for Detective results.
- Kill effects are suppressed for that first night.
- Non-killing abilities still resolve normally.

This recommendation requires confirmation in **R-002**.

---

## 7. Supported roles

## 7.1 Mafia

### Godfather

- Faction: Mafia
- Night ability: Select one living player to attack.
- Normally acts once per night.
- Attack can be prevented by applicable Doctor protection.
- Interaction with Serial Killer depends on game settings.
- Sheriff treatment and Investigator group must be explicitly configured.

### Framer

- Faction: Mafia
- Night ability: Select one living player to frame for the current night.
- A framed non-Mafia target appears Mafia/suspicious to the Sheriff.
- The framed target receives the Framer's fixed three-role investigation group when checked by Investigator or Consigliere, unless a different rule is later selected.
- Framing expires after the night's investigation results are resolved.

### Consort

- Faction: Mafia
- Night ability: Select one living player to role-block.
- A role-blocked player cannot successfully use their night ability.
- Whether a blocked player counts as visiting nobody is defined in Section 11.
- Role-block immunity, blocking killing roles, and mutual blocking require confirmation in **R-003**.

### Consigliere (`consig`)

- Faction: Mafia
- Night ability: Investigate one living player.
- Receives the target's fixed three-role investigation group.
- Uses the same permanent role groups as the Town Investigator.
- The group contains the target's actual apparent role plus two fixed alternatives.
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
- Mafia and Serial Killer normally appear suspicious.
- A framed non-Mafia player appears suspicious.
- Godfather detection requires confirmation in **R-004**.

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
- Receives one permanent three-role group.
- The host communicates the result using a reusable physical paper/card.
- The same three roles always appear together across all games.
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
- Whether multiple attacks consume protection or are all prevented requires confirmation in **R-005**.

### Mayor

- Faction: Town
- No ordinary night ability.
- During the day, the player may publicly announce they are Mayor.
- The host must confirm the reveal in the app.
- Once confirmed, Mayor status is public and permanent.
- The living revealed Mayor's vote counts as three votes.
- An unrevealed Mayor's vote counts as one.
- A dead Mayor does not vote.

### Citizen

- Faction: Town
- No night ability.
- Participates in discussion and voting.

---

## 7.3 Neutral

### Jester

- Faction: Neutral
- No ordinary night ability.
- Wins personally by being executed/lynched during a trial.
- The main game continues after the Jester wins.
- After a Jester is executed, one eligible random living player commits suicide overnight.
- The pending suicide must resolve before a Mafia victory is finalised because it may change faction counts.
- Suicide eligibility, preventability, and timing require confirmation in **R-006**.

### Executioner

- Faction: Neutral
- At game setup, receives one random target other than themselves.
- At the beginning of the first night, the host privately tells the Executioner their target.
- Wins personally if that target is executed/lynched.
- The main game continues after the Executioner wins.
- If the target is killed by the Godfather or Serial Killer, the Executioner converts into a Jester.
- Behaviour when the target dies by another cause requires confirmation in **R-007**.
- Target eligibility requires confirmation in **R-008**.

### Serial Killer

This role is inferred from the stated settings and interactions and must be explicitly confirmed.

Provisional behaviour:

- Faction: Neutral killing
- Night ability: Select one living player to attack.
- Attack may be prevented by Doctor protection.
- Appears suspicious to Sheriff.
- Interaction with Godfather follows the mutual-attack setting.
- Personal victory condition requires confirmation in **R-009**.

---

## 8. Permanent investigation groups

Investigator and Consigliere use the same permanent groups.

Requirements:

- Every investigable role belongs to exactly one canonical group.
- Each group contains exactly three distinct role names.
- Groups never change between games.
- The app stores groups as data, not conditional code.
- The app shows the host the exact result card to hold up.
- Missing roles do not cause groups to be regenerated.
- A framed target returns the Framer group's result unless later changed by an explicit rule.

Example data:

```ts
type InvestigationGroup = {
  id: string;
  label: string;
  roleIds: [RoleId, RoleId, RoleId];
};
```

Example:

```ts
{
  id: "group-a",
  label: "Godfather / Doctor / Sheriff",
  roleIds: ["godfather", "doctor", "sheriff"]
}
```

The final group list must be supplied before Investigator or Consigliere is considered complete.

---

## 9. Starting a game

When the host presses **Start Game**:

1. Validate participating-player count against selected role count.
2. Create a fresh game ID in memory.
3. Randomly shuffle the selected role instances.
4. Assign exactly one role instance to each participating player.
5. Assign ordinals to duplicate roles.
6. Assign Executioner targets.
7. Initialise alive status.
8. Initialise night-history fields such as each Doctor's previous target.
9. Display the private assignment list to the host.
10. The host physically distributes the corresponding role cards.
11. The host confirms that all cards have been distributed.
12. The app enables **Enter Night**.

Role assignments must use a testable injected random source rather than calling `Math.random()` throughout the domain.

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
  | "trial"
  | "trial-voting"
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
→ Optional trial/vote
→ Execution or return to discussion
→ Next night
→ Repeat
→ Game over
```

---

## 11. Night sequence

## 11.1 First-night Executioner briefing

Before ordinary first-night actions:

1. Tell everyone to close their eyes.
2. If one or more Executioners exist, call each Executioner separately.
3. The app shows the host that Executioner's target.
4. The host privately communicates the target.
5. Host confirms and continues.

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

Recommended resolution pipeline:

1. Validate all submitted actions.
2. Apply role blocks.
3. Apply redirects, if redirecting roles are added later.
4. Apply frame and apparent-role effects.
5. Establish final visit map.
6. Apply protections.
7. Apply Godfather attack.
8. Apply Serial Killer attack.
9. Apply pending Jester suicide.
10. Determine deaths.
11. Resolve Sheriff results.
12. Resolve Investigator and Consigliere groups.
13. Resolve Detective tracking results from the visit map.
14. Apply Executioner-to-Jester conversion where triggered.
15. Expire one-night effects.
16. Evaluate personal neutral wins.
17. Evaluate faction win conditions only when no pending death can change them.
18. Generate private host results and public dawn announcement.

The pipeline should produce structured events and results, not directly mutate React UI state.

---

## 13. Dawn

After night resolution, the host presses **Enter Day**.

The host screen shows:

- Every death.
- Cause of death privately.
- Actual role privately.
- Public announcement text.
- Investigator/Consigliere/Detective/Sheriff private results that must be communicated before eyes open, where applicable.
- Any Executioner conversion.
- Any personal Jester or Executioner win.

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

If first-night kills are disabled, the dawn announcement must not report suppressed attack deaths.

---

## 14. Day discussion

During day discussion, the host dashboard shows every player with:

- Name
- Alive/dead state
- Publicly revealed role, if any
- Confirmed Mayor badge
- Trial button for living players
- Host-only actual role
- Any host-only status relevant to the current game

Available controls:

- Put living player on trial
- Confirm Mayor reveal
- Advance directly to next night
- Inspect private game history
- Correct an obvious host input before it is locked

---

## 15. Trial, voting, and execution

When **Trial** is selected:

1. Open a trial modal for the accused player.
2. Allow discussion outside the app.
3. Enter each living eligible player's vote:
   - Guilty
   - Innocent
   - Abstain
4. Normal vote weight is 1.
5. Confirmed living Mayor vote weight is 3.
6. The accused does not vote by default.
7. The app totals weighted votes.
8. Guilty must exceed Innocent to execute.
9. A tie results in acquittal.
10. Host confirms the calculated result.

On execution:

- Mark the accused dead.
- Reveal role publicly only when configured.
- Resolve Jester or Executioner personal wins.
- Schedule Jester suicide when applicable.
- Check whether an immediate faction result is allowed.
- Move to the next night unless game over is final.

On acquittal:

- Return to day discussion.
- The host may start another trial or move to night.

The “multiple trials per day” behaviour is provisional and must be confirmed in **R-010**.

---

## 16. Win conditions

Personal neutral wins do not automatically end the main game.

### 16.1 Town

Provisional Town victory:

- No living Mafia remain.
- No living Serial Killer or other hostile killing neutral remains.
- No pending Jester suicide or other pending death can reverse the result.

Confirm in **R-011**.

### 16.2 Mafia

The supplied rule states that Mafia win when Town can no longer win and living Mafia outnumber living Town. Jester is excluded because a pending Jester suicide may change the numbers.

A precise implementation rule is still required.

Questions include:

- Is victory at strict majority (`mafia > town`) or parity (`mafia >= town`)?
- Are unrevealed/revealed neutral players excluded from both counts?
- Can Mafia win while Serial Killer is alive?
- Is the result delayed until all pending suicides resolve?

Tracked as **R-012**.

### 16.3 Jester

- Personal win occurs immediately when executed.
- Main game continues.
- A random suicide is scheduled for the next night/dawn.

### 16.4 Executioner

- Personal win occurs immediately when their target is executed.
- Main game continues.
- If the target dies to Godfather or Serial Killer first, Executioner converts to Jester.

### 16.5 Serial Killer

Not yet defined. See **R-009**.

---

## 17. Host corrections and undo

Minimum initial correction support:

- Before night resolution, the host can go back and change any submitted target.
- Before confirming execution, the host can change votes.
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
│  ├─ resolution/
│  ├─ investigation/
│  └─ win-conditions/
├─ application/
│  ├─ commands/
│  ├─ use-cases/
│  └─ selectors/
├─ features/
│  ├─ roster/
│  ├─ game-setup/
│  ├─ role-distribution/
│  ├─ night-runner/
│  ├─ dawn/
│  ├─ day-dashboard/
│  ├─ trial/
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
  executionerTargetId: PlayerId | null;
  personalWin: "jester" | "executioner" | null;
};

type GameSettings = {
  godfatherAndSerialCanKillEachOther: boolean;
  doctorCanSelfProtect: boolean;
  doctorCannotRepeatPreviousTarget: boolean;
  revealRoleOnDeath: boolean;
  allowFirstNightKills: boolean;
};
```

Additional types are required for:

- Night actions
- Visit map
- Temporary effects
- Protection
- Attacks
- Investigation results
- Death causes
- Trial votes
- Pending Jester suicide
- Role conversion
- Game events
- Faction and personal win results

---

## 20. Testing requirements

Every role interaction must be covered by domain tests.

Minimum scenarios:

- Roles are randomly assigned exactly once.
- Duplicate roles receive stable ordinals.
- Doctor cannot self-protect when disabled.
- Doctor cannot repeat their own previous target when enabled.
- Doctor 1 and Doctor 2 track previous targets independently.
- Consort blocks a role.
- Blocked target visits nobody.
- Framed Town appears suspicious to Sheriff.
- Framed target returns Framer investigation group.
- Consigliere and Investigator return the same group.
- Detective sees final visit.
- First-night attack is suppressed when configured.
- Godfather and Serial mutual attack setting behaves correctly.
- Mayor reveal permanently changes vote weight to 3.
- Jester wins when executed but not when killed overnight.
- Jester suicide occurs before Mafia victory is finalised.
- Executioner receives a valid target.
- Executioner wins when target is executed.
- Executioner converts when target is killed by Godfather.
- Executioner converts when target is killed by Serial Killer.
- Role reveal setting changes only public output.
- Dead role instances no longer act.
- Mafia and Town victory checks use the approved counting rule.

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

## 22. Unresolved rule decisions

These must be answered and then incorporated into this file.

### R-001 — Mutual killing disabled

When Godfather/Serial mutual killing is disabled:

- Are they invalid targets for each other?
- Or may they target each other, with the attack failing?

### R-002 — First-night killing disabled

Confirm whether killing roles still select targets and create visits while deaths are suppressed.

### R-003 — Consort blocking

Confirm:

- Can Consort block Godfather?
- Can Consort block Serial Killer?
- Can Consort block another Consort?
- What happens when two blockers target each other?
- Do any roles have role-block immunity?

### R-004 — Godfather Sheriff result

Does Godfather appear suspicious or not suspicious to Sheriff?

### R-005 — Doctor against multiple attacks

If Godfather and Serial Killer attack the same protected player, does one Doctor protection stop both attacks or only one?

### R-006 — Jester suicide

Confirm:

- Eligible target pool
- Whether the Jester is excluded
- Whether suicide can target any faction
- Whether Doctor can prevent it
- Whether it occurs alongside ordinary night deaths or before them

### R-007 — Executioner target other death

What happens if the target dies from Jester suicide, another future killing role, or a manual host correction?

### R-008 — Executioner target eligibility

Can the target be:

- Mafia?
- Neutral?
- Mayor?
- Another Executioner?
- Any other player except self?

### R-009 — Serial Killer victory

Define the Serial Killer's exact win condition.

### R-010 — Trials per day

Can the Town hold multiple trials after acquittals, or only one trial per day?

### R-011 — Town victory

Confirm whether Town must eliminate both Mafia and Serial Killer.

### R-012 — Mafia victory count

Define:

- Strict majority or parity
- Which neutral roles count, if any
- Interaction with living Serial Killer
- Timing relative to pending Jester suicide

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
