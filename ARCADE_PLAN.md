# Arcade Game Plan: "The Glitch Arcade"

## Economic Model: "Base Jackpot & High Score Rebate"
- **Entry Fee:** 5 Stake per game.
- **Base Jackpot:** The House guarantees a minimum Jackpot of **100 Stake** every week.
- **The Split (Dynamic):**
    - **Funding Phase:** Until the Base Jackpot (100 Stake) is covered by entry fees, **100% of the Entry Fee** goes to the House.
    - **Growth Phase:** Once funded, every play adds **3.5 Stake** to the Jackpot and **1.5 Stake** is Burned (deflationary).
- **Rebate System:**
    - If a player beats their **Personal High Score** for the game, they receive an instant **1.0 Stake Rebate**.
- **Prizes:**
    - The Jackpot accumulates throughout the week.
    - At the end of the week (Sunday Midnight), the **Entire Jackpot** is awarded to the **#1 Top Runner** on the Leaderboard.
    - **Winner Takes All.**
- **Badges & Roles:**
    - The winner receives the **"Top Runner" Badge** (transferred from the previous winner).
    - The winner receives the **"Top Runner" Discord Role** (synced automatically).

## Game Concept: "Infinite Loop" (Endless Runner)
You are a rogue data packet sprinting through the fiber optic network. The goal is to travel as far as possible without crashing.

### Gameplay
- **The Character:** A glowing data packet (or a pixelated runner).
- **The Environment:** A scrolling cyber-tunnel (Tron-style).
- **Obstacles:**
    - **Firewalls:** High walls you must jump over.
    - **404 Errors:** Pits you must jump over.
    - **Malware:** Spikes or enemies you must duck under or dodge.
- **Mechanics:**
    - **Jump:** Spacebar / Tap.
    - **Duck:** Down Arrow / Swipe Down.
    - **Speed:** Increases gradually over time.
- **Scoring:** +1 point for every meter traveled. +10 points for collecting "Data Fragments".

### Power-ups
- **"Overclock" (Slow Motion):** Slows down time for 5 seconds.
- **"Encryption" (Shield):** Protects against one hit.
- **"Bandwidth" (Magnet):** Attracts nearby Data Fragments.

## Technical Architecture

### 1. Database Schema
**Collection:** `arcade_sessions`
```json
{
  "_id": "...",
  "userID": "user-123",
  "game": "infinite_loop",
  "status": "active|completed",
  "score": 0,
  "stakePaid": 5,
  "jackpotContribution": 3.5,
  "startedAt": "2025-12-31T...",
  "endedAt": "..."
}
```

**Collection:** `arcade_jackpot` (Singleton or Weekly Document)
```json
{
  "_id": "week_2025_52",
  "currentAmount": 500,
  "isFunded": true,
  "status": "open|distributed",
  "startDate": "...",
  "endDate": "..."
}
```

### 2. API Endpoints
- `POST /api/v1/arcade/start`:
    - Deducts 5 Stake.
    - Checks Funding Status.
    - Allocates to House or Jackpot/Burn accordingly.
    - Returns `sessionID` and `currentJackpot`.
- `POST /api/v1/arcade/submit`:
    - Validates score.
    - Checks for Personal High Score -> Issues Rebate.
    - Updates Leaderboard.
- `GET /api/v1/arcade/jackpot`:
    - Returns current pot size and time remaining.

### 3. Frontend
- **Route:** `/dashboard/arcade`
- **Components:**
    - `JackpotDisplay`: Big animated counter showing the current prize pool.
    - `GameCanvas`: React + HTML5 Canvas for "Infinite Loop".
    - `Leaderboard`: Shows Top Runners.

## Future Games
- **Stack Overflow:** Tetris clone.
- **Space Invaders:** Shoot down bugs.
