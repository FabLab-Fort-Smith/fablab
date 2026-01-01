# Arcade Game Plan: "The Glitch Arcade"

## Economic Model: "Burn & Earn"
- **Entry Fee:** 5 Stake per game.
- **The Split:**
    - **50% Burn (2.5 Stake):** Removed from circulation immediately (deflationary).
    - **50% Jackpot (2.5 Stake):** Added to the "Weekly Prize Pool".
- **Prizes:**
    - The Jackpot accumulates throughout the week.
    - At the end of the week (Sunday Midnight), the Jackpot is distributed to the Top 3 players on the Leaderboard (e.g., 60% / 30% / 10%).

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
  "jackpotContribution": 2.5,
  "startedAt": "2025-12-31T...",
  "endedAt": "..."
}
```

**Collection:** `arcade_jackpot` (Singleton or Weekly Document)
```json
{
  "_id": "week_2025_52",
  "currentAmount": 500,
  "status": "open|distributed",
  "startDate": "...",
  "endDate": "..."
}
```

### 2. API Endpoints
- `POST /api/v1/arcade/start`:
    - Deducts 5 Stake.
    - **Burns 2.5 Stake.**
    - **Adds 2.5 Stake to `arcade_jackpot`.**
    - Returns `sessionID` and `currentJackpot`.
- `POST /api/v1/arcade/submit`:
    - Validates score.
    - Updates Leaderboard.
- `GET /api/v1/arcade/jackpot`:
    - Returns current pot size and time remaining.

### 3. Frontend
- **Route:** `/dashboard/arcade`
- **Components:**
    - `JackpotDisplay`: Big animated counter showing the current prize pool.
    - `GameCanvas`: React + HTML5 Canvas for "Infinite Loop".
    - `Leaderboard`: Shows Top 3 (who are in the money) and user's rank.

## Implementation Steps
1.  **Backend:** Implement `ArcadeService` with the split-pot logic.
2.  **Database:** Create the Jackpot tracking mechanism.
3.  **Frontend:** Build the `InfiniteLoopGame` engine (Canvas API).
4.  **UI:** Design the Arcade Lobby with the "High Stakes" aesthetic.

## Future Games
- **Stack Overflow:** Tetris clone.
- **Space Invaders:** Shoot down bugs.
