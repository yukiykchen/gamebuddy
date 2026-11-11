## Purpose

让个人数据能按局读到进阶、用时、终局牌组、结束时连胜和读档次数，并给出当前连胜与最近对局的平均读档次数。

## ADDED Requirements

### Requirement: Each finished run exposes its analysis fields
Each finished run in personal data SHALL expose its ascension, playtime, final deck, win streak at the end of that run, and reload count. Playtime MUST be the summed wall-clock time of the captured sessions for that run, from each start or resume to the last fact of that session. Time while the game was closed between sessions MUST NOT be included. A missing session boundary MUST leave playtime unknown. Win streak MUST be the number of consecutive wins ending at that run; a loss or an abandoned run MUST record 0. An unknown reload count MUST stay unknown.

#### Scenario: A win continues the streak
- **WHEN** the two previous finished runs were wins and this run is a win
- **THEN** this run's win streak is 3

#### Scenario: Abandon or loss breaks the streak
- **WHEN** a run ends as a loss or as abandoned
- **THEN** that run's win streak is 0

#### Scenario: Closed game time is excluded
- **WHEN** a run is observed for 10 minutes, the game stays closed for a day, and the resumed session lasts 5 minutes before the run ends
- **THEN** the run's playtime is 15 minutes

#### Scenario: Final deck stays readable
- **WHEN** a finished run recorded a final deck
- **THEN** personal data still shows that deck when the run is opened

### Requirement: Personal data shows the current streak and average reloads
Personal data SHALL show the current win streak by walking backward from the newest saved run through consecutive wins. It SHALL show the average reload count of the latest 50 runs that have a known reload count. Runs with an unknown reload count MUST be excluded. When none of those runs has a known count, the average MUST be unknown and MUST NOT be shown as zero. Each recent run SHALL show its ascension, playtime, and reload count, with unknown values labeled as unknown.

#### Scenario: Newest loss makes the current streak zero
- **WHEN** the newest saved run is a loss after three wins
- **THEN** the shown current win streak is 0

#### Scenario: Average ignores runs without a reload count
- **WHEN** the latest 50 runs contain two runs with 1 and 3 reloads and other runs with no reload count
- **THEN** the shown average reload count is 2

#### Scenario: No captured reload counts
- **WHEN** every run in the latest 50 lacks a reload count
- **THEN** the average reload count is unknown
