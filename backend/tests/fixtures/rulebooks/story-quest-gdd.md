# Game Design Document — **StoryQuest** (Draft v0.2)

---

> **Purpose** — Central, continually‑updated reference for designing, testing, producing, and launching *StoryQuest*. Treat this file as the single source of truth; edit inline rather than duplicating docs.

## 0 ▪ Snapshot

|  Players  |  Play Time  |  Age  |  Complexity                |
| --------- | ----------- | ----- | -------------------------- |
|  2 – 6    |  ≈ 30 min   |  8 +  |  Light–Medium (BGG \~2.3)  |

## 1 ▪ Concept Overview

- **Elevator Pitch** — A fast, card‑drafting party game where players weave hilarious or epic tales together, one plot card at a time.
- **Genre / Theme** — Narrative party card game • Collaborative storytelling.
- **Core Experience** — Finish each session with a unique, player‑authored short story and plenty of laughs.
- **Unique Hooks** — Card‑drafting as story engine · Modular plot arcs · Social voting for humor & cohesion.

## 2 ▪ Tabletop Studio Workflow

|  Phase       |  Module            |  Key Assets                      |  Status        |
| ------------ | ------------------ | -------------------------------- | -------------- |
|  Ideation    |  Ideation Hub      |  Theme brief, trope matrix       |  ✅             |
|  Rules       |  Rulebook Editor   |  Versioned ruleset, changelog    |  🔄            |
|  Assets      |  Art Manager       |  Card templates, icon library    |  🟡 (art WIP)  |
|  Play‑test   |  Virtual Table     |  Session logs, analytics         |  🟡 (alpha)    |
|  Production  |  Toolkit           |  Punch‑board layout, BOM         |  🚧            |
|  Launch      |  Release Pipeline  |  Pre‑order page, marketing deck  |  🚧            |

*(Legend: ✅ complete · 🔄 active · 🟡 partial · 🚧 pending)*

## 3 ▪ Theme & World‑Building

### 3.1 Theme Brief

Players are royal bards competing to craft the kingdom’s next legendary tale.

### 3.2 Narrative Seeds

- Story arcs: Three‑Act • Hero’s Journey • Twisty Mystery.
- Character roles: Hero, Sidekick, Villain, Mentor, Wild Card.

### 3.3 Design Constraints

- 30‑minute target · ≤ 150 components · MSRP ≤ \$25 · Small‑box shelf footprint.

## 4 ▪ Components Inventory

|  Component           |  Qty  |  Spec                     |  Notes                                              |
| -------------------- | ----- | ------------------------- | --------------------------------------------------- |
|  Story Prompt Cards  |  120  |  63 × 88 mm, linen        |  4 suits: Setting, Character, Conflict, Resolution  |
|  Twist Cards         |  30   |  63 × 88 mm               |  Played mid‑draft to disrupt                        |
|  Plot Board          |  1    |  240 × 140 mm, quad fold  |  Acts I‑III slots                                   |
|  Plot Point Tokens   |  60   |  15 mm punchboard         |  Scoring                                            |
|  Vote Tokens         |  36   |  18 mm, dbl‑sided         |  Secret yes/no                                      |
|  Reference Cards     |  6    |  44 × 67 mm               |  Icon summary                                       |
|  Round Marker        |  1    |  Wooden quill meeple      |  Turn tracker                                       |
|  Rulebook            |  1    |  16 pp, A6                |  Export via Editor                                  |

*Est. manufacturing cost: ******\$5.10****** (target; update once quote received).*\
*TODO #P‑03*: verify token count after balancing pass.

## 5 ▪ Ruleset (v0.4)

### 5.1 Setup

1. Sort and shuffle suits; stack on Plot Board by act.
2. Each player: 6 Plot Point tokens · 1 Vote token · 1 Reference card.
3. Random first bard → place Round Marker on Act I / Turn 1.

### 5.2 Draft Phase (repeat per act)

1. Deal **N** cards (Act I = 6 | II = 5 | III = 4).
2. Simultaneously pick 1 → pass remaining left (Acts I & III) / right (Act II).
3. Reveal; optional: play 1 Twist onto any tableau.
4. Advance Round Marker; loop until hands empty.

### 5.3 Story Phase

- Narrate cards in order (Setting → Character → Conflict → Resolution).
- Peers vote secretly; reveal → +1 Plot Point per “Yes”.
- Bonuses: +1 coherent Twist · +2 unanimous “Yes”.

### 5.4 Endgame

Total Plot Points → winner crowned **Master Bard**.\
Tie → most Twist cards woven → sudden‑death one‑sentence “story‑off”.

### 5.5 Variants

- **Potion of Time** — Skip Act II; 18‑card game ≈ 15 min.
- **Solo** — Draft vs. AI bot (random draws + 18‑point win condition).

## 6 ▪ Balance & Analytics

|  Metric                    |  Target  |  Current       |  Notes           |
| -------------------------- | -------- | -------------- | ---------------- |
|  Twist Disruption Rate     |  ≈ 20 %  |  17 % (alpha)  |  Monitor         |
|  Avg Laughs / Min          |  ≥ 1.5   |  1.8 (alpha)   |  ✅               |
|  Rule Confusion Instances  |  ≤ 2     |  3             |  Revise wording  |

## 7 ▪ Art Direction

Moodboard: *Whimsical Storybook* — deep indigo · parchment cream · accent gold.\
Iconography: quill & ink‑blot glyphs; serif display headings.

## 8 ▪ Play‑testing Reference

*(one‑pager auto‑exported for testers)*\
See Section 16 for checklist & survey prompts.

## 9 ▪ Production & Manufacturing

- Card sheets: 10 × 10 on 70 × 100 cm.
- Wooden quill meeple → Panda GM SKU #BQ‑217.

## 10 ▪ Marketing & Community

Primary persona: **Family Game‑Night Planner** (US moms, 35‑45).\
Pre‑launch KPI: 2 k mailing‑list sign‑ups → 30‑sec TikTok montage teaser.

## 11 ▪ Milestones & Roadmap

|  Milestone  |  Goal                      |  Owner       |  Due         |
| ----------- | -------------------------- | ------------ | ------------ |
|  P‑01       |  Prototype v0 (printable)  |  Brandon     |  2025‑07‑15  |
|  T‑02       |  Alpha remote tests        |  QA Guild    |  2025‑08‑01  |
|  A‑03       |  Final card art            |  Art Team    |  2025‑09‑05  |
|  P‑04       |  Print‑ready files         |  Production  |  2025‑10‑10  |
|  M‑05       |  Kickstarter launch        |  Marketing   |  2025‑11‑01  |

## 12 ▪ Risks & Mitigations

- **Analysis Paralysis** — Limit hand size · 30 s timer.
- **Story Quality Variance** — Provide Story Skeleton guide.
- **Cost Overruns** — Hard cap 150 cards; bid multiple factories.

## 13 ▪ Smart Import Wizard Fields

*(autosyncs with Tabletop Studio; do ******not****** delete rows)*

|  Field                 |  Value                  |  Status  |
| ---------------------- | ----------------------- | -------- |
|  Game Title            |  StoryQuest             |  ✅       |
|  Rulebook PDF          |  *pending upload*       |  🚧      |
|  Complexity (BGG 1‑5)  |  2.3 (proposed)         |  🟡      |
|  Prototype Files       |  P‑01 once compiled     |  🚧      |
|  Playtest Survey       |  Google Forms link tbd  |  🚧      |

## 14 ▪ FAQ

*(expand as questions repeat)*

> **Q:** Can I draft no card?\
> **A:** No — you must draft exactly one to maintain parity.

> **Q:** Do I have to act in character?\
> **A:** Theatrical voices welcome but optional.

## 15 ▪ Open Tasks / Info Needed

-

## 16 ▪ Revision History

|  Ver.  |  Date        |  Editor   |  Notes                                             |
| ------ | ------------ | --------- | -------------------------------------------------- |
|  v0.1  |  2025‑06‑18  |  Brandon  |  Initial full draft                                |
|  v0.2  |  2025‑06‑18  |  ChatGPT  |  Reformatted as living doc; added snapshot, tasks  |

---

© 2025 Stockwise Productions — All rights reserved.

