# ♟ Chess.com Best Move Overlay

A Tampermonkey userscript that shows the Stockfish engine's best move live on Chess.com — with an SVG arrow on the board and a draggable analysis panel.

> Made by [@11.skibidi](https://www.instagram.com/11.skibidi/) · DM for questions or collabs

---

## Features

- **Live best move** — analyzes the current position automatically on your turn
- **SVG arrow** — draws a clean arrow directly on the board showing the best move
- **Dual API fallback** — tries [chess-api.com](https://chess-api.com) first, falls back to [stockfish.online](https://stockfish.online) if it fails
- **Evaluation display** — shows centipawn score or mate-in-N with color coding (green / yellow / red)
- **Draggable panel** — position remembers across sessions via localStorage
- **Board flip support** — works whether you're playing White or Black
- **SPA navigation** — auto-reinitializes when you navigate between games without a page reload
- **Instant arrow clear** — arrow disappears the moment a move is played
- **Minimize / close** — stay out of the way when you don't need it

---

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click **[Install Script](https://github.com/YOUR_USERNAME/chess-com-best-move-overlay/raw/main/chess-overlay.user.js)** *(update this link after upload)*
3. Confirm the install in Tampermonkey
4. Open any game on [Chess.com](https://www.chess.com) — the panel appears automatically

---

## How It Works

```
Your turn detected
      ↓
Fetch FEN from board DOM
      ↓
POST to chess-api.com (depth 14)
      ↓ (if fail)
GET stockfish.online (depth 14)
      ↓
Draw SVG arrow on board
Update analysis panel
```

The script polls the board every 120ms. When the FEN changes (a move is played), the arrow clears instantly and re-analysis starts on your next turn.

---

## Screenshots

*(Add your own screenshots here)*

---

## Configuration

At the top of the script, inside the `CONFIG` object:

| Key | Default | Description |
|-----|---------|-------------|
| `depth` | `14` | Stockfish search depth |
| `pollIntervalMs` | `120` | How often to check board state (ms) |
| `ARROW_COLOR` | `#00ff88` | Color of the arrow |
| `API_PRIMARY` | `chess-api.com/v1` | Primary engine API |
| `API_FALLBACK` | `stockfish.online` | Fallback engine API |

---

## Compatibility

- Chess.com Live, Daily, Computer, and Analysis board
- Chrome, Firefox, Edge (with Tampermonkey)
- Tested on board versions using `wc-chess-board` and `chess-board` elements

---

## Disclaimer

This script is for **personal educational use** (learning openings, post-game analysis, understanding engine logic). Using engine assistance in rated games violates Chess.com's Terms of Service. Use responsibly.

---

## Contact

Have a question, found a bug, or want to collaborate?

**Instagram: [@11.skibidi](https://www.instagram.com/11.skibidi/)**

---

## License

MIT — free to use, modify, and share.