// ==UserScript==
// @name         Chess.com Best Move Overlay v12
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  Best move overlay — dual API fallback, instant arrow clear, thin arrow, no blink
// @author       Fixed v12
// @match        *://www.chess.com/*
// @match        *://chess.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      chess-api.com
// @connect      stockfish.online
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        depth:          14,
        pollIntervalMs: 120,
        maxRetries:     3,
        retryDelayMs:   400,
        ARROW_COLOR:    '#00ff88',
        ARROW_ID:       'co-best-arrow-svg',
        // Two APIs — primary tried first, fallback used if primary fails/returns no move
        API_PRIMARY:    'https://chess-api.com/v1',
        API_FALLBACK:   'https://stockfish.online/api/s/v2.php',
    };

    // ── Game page detection ────────────────────────────────────────────────────
    const GAME_PATTERNS = [
        /\/game\/live\//,
        /\/game\/daily\//,
        /\/game\/\d+/,
        /\/play\/computer/,
        /\/play\/online/,
        /\/analysis/,
    ];
    const isGamePage = () => GAME_PATTERNS.some(p => p.test(location.pathname));

    // ── SPA navigation watcher ─────────────────────────────────────────────────
    const onNavigate = (cb) => {
        let last = location.href, pending = false;
        const fire = () => {
            if (pending) return; pending = true;
            setTimeout(() => { pending = false; cb(); }, 50);
        };
        setInterval(() => { if (location.href !== last) { last = location.href; fire(); } }, 400);
        ['pushState','replaceState'].forEach(fn => {
            const orig = history[fn];
            history[fn] = function(...a) { orig.apply(this,a); fire(); };
        });
        window.addEventListener('popstate', fire);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;600;700&display=swap');
        :root {
            --co-bg:      rgba(7,9,16,0.97);
            --co-border:  #0e2444;
            --co-accent:  #00e87a;
            --co-accent2: #e94560;
            --co-muted:   #3a4a60;
            --co-text:    #c8d8f0;
            --co-dim:     #4a5a70;
            --co-good:    #00e87a;
            --co-equal:   #f0c040;
            --co-bad:     #ff4455;
            --co-radius:  14px;
            --co-mono:    'JetBrains Mono', monospace;
            --co-sans:    'Outfit', sans-serif;
        }
        #co-wrap {
            position:fixed; bottom:22px; right:22px;
            z-index:2147483647; width:300px;
            background:var(--co-bg);
            border:1px solid var(--co-border);
            border-radius:var(--co-radius);
            box-shadow:0 0 0 1px rgba(0,232,122,0.06),0 12px 50px rgba(0,0,0,0.9);
            font-family:var(--co-sans); font-size:12px; color:var(--co-text);
            user-select:none; cursor:move; overflow:hidden;
            transition:box-shadow 0.3s,opacity 0.2s;
        }
        #co-wrap:hover{box-shadow:0 0 0 1px rgba(0,232,122,0.14),0 16px 60px rgba(0,0,0,1);}
        #co-wrap.dragging{opacity:0.88;}
        #co-wrap::before{
            content:'';display:block;height:2px;
            background:linear-gradient(90deg,transparent,var(--co-accent),transparent);
            opacity:0.6;
        }
        #co-header{
            display:flex;align-items:center;justify-content:space-between;
            padding:10px 14px 8px;
            border-bottom:1px solid rgba(255,255,255,0.04);
        }
        #co-title-wrap{display:flex;align-items:center;gap:7px;}
        #co-title-icon{
            width:22px;height:22px;
            background:linear-gradient(135deg,var(--co-accent2),#ff7a55);
            border-radius:6px;display:flex;align-items:center;justify-content:center;
            font-size:12px;box-shadow:0 2px 8px rgba(233,69,96,0.4);
        }
        #co-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2.5px;color:var(--co-text);}
        .co-btns{display:flex;gap:4px;}
        .co-btn{
            background:none;border:1px solid var(--co-border);color:var(--co-dim);
            width:22px;height:22px;border-radius:5px;cursor:pointer;
            font-size:11px;display:flex;align-items:center;justify-content:center;
            transition:all 0.18s;line-height:1;
        }
        .co-btn:hover{background:var(--co-border);color:var(--co-text);}
        .co-btn.danger:hover{background:var(--co-accent2);border-color:var(--co-accent2);color:#fff;}
        #co-body{padding:12px 14px 14px;}
        .co-minimized #co-body,.co-minimized::before{display:none;}
        .co-minimized{border-radius:10px;}
        #co-idle{
            text-align:center;padding:10px 4px 4px;
            color:var(--co-dim);font-size:11px;line-height:1.7;
        }
        #co-idle .co-idle-icon{font-size:26px;display:block;margin-bottom:6px;opacity:0.4;}
        #co-idle b{color:var(--co-accent);font-weight:600;}
        #co-hero{
            background:linear-gradient(135deg,rgba(0,232,122,0.06),rgba(0,232,122,0.02));
            border:1px solid rgba(0,232,122,0.15);border-radius:10px;
            padding:10px 14px;margin-bottom:10px;
            display:flex;align-items:center;justify-content:space-between;
        }
        #co-hero-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--co-dim);font-weight:600;}
        #co-hero-move{
            font-family:var(--co-mono);font-size:28px;font-weight:700;
            color:var(--co-accent);letter-spacing:2px;
            text-shadow:0 0 20px rgba(0,232,122,0.5);line-height:1;
        }
        #co-hero-move.co-waiting{font-size:14px;color:var(--co-dim);text-shadow:none;letter-spacing:1px;}
        #co-turn-badge{
            display:inline-flex;align-items:center;gap:5px;
            font-size:10px;font-weight:600;text-transform:uppercase;
            letter-spacing:1px;padding:3px 8px;border-radius:20px;border:1px solid;
        }
        #co-turn-badge.white{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.15);color:#e0e8f8;}
        #co-turn-badge.black{background:rgba(0,0,0,0.3);border-color:rgba(255,255,255,0.08);color:#8090a8;}
        #co-turn-badge.your-turn{
            background:rgba(0,232,122,0.1);border-color:rgba(0,232,122,0.3);
            color:var(--co-accent);animation:co-pulse 2s infinite;
        }
        @keyframes co-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,232,122,0)}50%{box-shadow:0 0 0 3px rgba(0,232,122,0.15)}}
        #co-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;}
        .co-stat{
            background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);
            border-radius:8px;padding:7px 10px;
        }
        .co-stat-label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--co-dim);margin-bottom:3px;font-weight:600;}
        .co-stat-val{font-family:var(--co-mono);font-size:13px;font-weight:700;color:var(--co-text);}
        .co-stat-val.good {color:var(--co-good);}
        .co-stat-val.equal{color:var(--co-equal);}
        .co-stat-val.bad  {color:var(--co-bad);}
        #co-moves-section{margin-bottom:4px;}
        #co-moves-header{
            display:flex;justify-content:space-between;
            font-size:9px;text-transform:uppercase;letter-spacing:1px;
            color:var(--co-muted);padding:0 4px 5px;
            border-bottom:1px solid rgba(255,255,255,0.05);
            margin-bottom:3px;font-weight:600;
        }
        .co-move-row{
            display:grid;grid-template-columns:16px 1fr 52px;
            gap:6px;padding:4px 5px;border-radius:5px;
            align-items:center;transition:background 0.15s;
        }
        .co-move-row:hover{background:rgba(255,255,255,0.03);}
        .co-move-row.co-top-move{background:rgba(0,232,122,0.05);border:1px solid rgba(0,232,122,0.1);}
        .co-mn{font-size:9px;color:var(--co-muted);font-family:var(--co-mono);}
        .co-mm{font-family:var(--co-mono);font-size:12px;font-weight:600;color:var(--co-text);}
        .co-move-row.co-top-move .co-mm{color:var(--co-accent);}
        .co-ms{font-family:var(--co-mono);font-size:10px;color:var(--co-dim);text-align:right;}
        #co-statusbar{
            display:flex;align-items:center;gap:6px;
            padding-top:10px;border-top:1px solid rgba(255,255,255,0.04);
            font-size:10px;color:var(--co-dim);
        }
        #co-status-dot{
            width:6px;height:6px;border-radius:50%;
            background:var(--co-dim);flex-shrink:0;transition:background 0.3s;
        }
        #co-status-dot.ok     {background:var(--co-good);box-shadow:0 0 6px var(--co-good);}
        #co-status-dot.loading{background:var(--co-equal);animation:co-blink 0.8s infinite;}
        #co-status-dot.err    {background:var(--co-bad);}
        @keyframes co-blink{0%,100%{opacity:.3}50%{opacity:1}}
        #co-status-text{flex:1;}
        #co-api-badge{
            font-size:8px;padding:1px 5px;border-radius:10px;
            background:rgba(255,255,255,0.06);color:var(--co-dim);
            border:1px solid rgba(255,255,255,0.06);white-space:nowrap;
        }
        #co-not-your-turn{font-size:10px;text-align:center;color:var(--co-muted);padding:6px 0 2px;font-style:italic;}
        #co-debug{font-size:9px;color:var(--co-muted);text-align:center;padding:3px 0 0;font-family:var(--co-mono);opacity:0.5;}
        @keyframes co-flash{
            0%  {box-shadow:0 0 0 2px rgba(0,232,122,.7), 0 12px 50px rgba(0,0,0,.9);}
            100%{box-shadow:0 0 0 1px rgba(0,232,122,.06),0 12px 50px rgba(0,0,0,.9);}
        }
        .co-flash{animation:co-flash 0.4s ease;}
        #co-arrow-toggle{
            display:flex;align-items:center;gap:5px;font-size:9px;
            color:var(--co-dim);cursor:pointer;padding:2px 0;transition:color 0.2s;
        }
        #co-arrow-toggle:hover{color:var(--co-accent);}
        #co-arrow-toggle input{cursor:pointer;accent-color:var(--co-accent);}
    `);

    // ═══════════════════════════════════════════════════════════════════════════
    //  PURE SVG ARROW  (our own element — never uses chess.com markings API)
    // ═══════════════════════════════════════════════════════════════════════════
    let arrowSvg     = null;
    let arrowVisible = false;   // is our arrow currently on screen?
    let arrowForFen  = '';      // FEN for which arrow is drawn

    const squareToColRow = (sq, flipped) => {
        const file = sq.charCodeAt(0) - 97;
        const rank = parseInt(sq[1], 10) - 1;
        if (flipped) return { col: 7 - file, row: rank };
        return { col: file, row: 7 - rank };
    };

    const getBoardEl  = () =>
        document.querySelector('wc-chess-board') || document.querySelector('chess-board') || null;
    const getBoardRect = () => { const b = getBoardEl(); return b ? b.getBoundingClientRect() : null; };

    const isBoardFlipped = () => {
        const b = getBoardEl();
        if (!b) return false;
        try {
            if (b.game?.getOptions) {
                const o = b.game.getOptions();
                if (o?.flipped === true)  return true;
                if (o?.flipped === false) return false;
            }
        } catch(_){}
        const fa = b.getAttribute('flipped');
        if (fa === 'true' || fa === '') return true;
        if (b.classList.contains('flipped')) return true;
        return false;
    };

    const ensureArrowSvg = () => {
        const rect = getBoardRect();
        if (!rect) return null;
        if (!arrowSvg) {
            arrowSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
            arrowSvg.id = CONFIG.ARROW_ID;
            arrowSvg.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483640;overflow:visible;';
            arrowSvg.innerHTML = `<defs>
              <marker id="co-ah" markerWidth="4" markerHeight="4" refX="2.8" refY="2" orient="auto">
                <path d="M0,0 L0,4 L4,2 z" fill="${CONFIG.ARROW_COLOR}" opacity="0.95"/>
              </marker></defs>`;
            document.body.appendChild(arrowSvg);
        }
        arrowSvg.style.left   = rect.left   + 'px';
        arrowSvg.style.top    = rect.top    + 'px';
        arrowSvg.style.width  = rect.width  + 'px';
        arrowSvg.style.height = rect.height + 'px';
        arrowSvg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
        return arrowSvg;
    };

    const clearArrow = () => {
        arrowVisible = false;
        arrowForFen  = '';
        if (arrowSvg) {
            const l = arrowSvg.querySelector('#co-arrow-line');
            if (l) l.remove();
        }
    };

    const drawArrow = (fromSq, toSq, forFen) => {
        const svg = ensureArrowSvg();
        if (!svg) return false;
        clearArrow();

        const rect    = getBoardRect();
        if (!rect) return false;
        const flipped = isBoardFlipped();
        const sqSize  = rect.width / 8;

        const fc = squareToColRow(fromSq, flipped);
        const tc = squareToColRow(toSq,   flipped);
        const x1 = (fc.col + 0.5) * sqSize;
        const y1 = (fc.row + 0.5) * sqSize;
        const x2 = (tc.col + 0.5) * sqSize;
        const y2 = (tc.row + 0.5) * sqSize;
        const dx = x2-x1, dy = y2-y1;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        const strokeW = Math.max(sqSize * 0.09, 5);
        const shorten = strokeW * 2.5;
        const ex = x2 - (dx/len)*shorten;
        const ey = y2 - (dy/len)*shorten;

        const line = document.createElementNS('http://www.w3.org/2000/svg','line');
        line.id = 'co-arrow-line';
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', ex); line.setAttribute('y2', ey);
        line.setAttribute('stroke', CONFIG.ARROW_COLOR);
        line.setAttribute('stroke-width', strokeW);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', 'url(#co-ah)');
        line.setAttribute('opacity', '0.93');
        svg.appendChild(line);

        // Sync position
        const r2 = getBoardRect();
        if (r2) {
            svg.style.left = r2.left + 'px';
            svg.style.top  = r2.top  + 'px';
        }

        arrowVisible = true;
        arrowForFen  = forFen;
        return true;
    };

    const syncArrowPos = () => {
        if (!arrowSvg) return;
        const rect = getBoardRect();
        if (!rect) return;
        arrowSvg.style.left   = rect.left   + 'px';
        arrowSvg.style.top    = rect.top    + 'px';
        arrowSvg.style.width  = rect.width  + 'px';
        arrowSvg.style.height = rect.height + 'px';
        arrowSvg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    };
    window.addEventListener('scroll', syncArrowPos, true);
    window.addEventListener('resize', syncArrowPos);

    // ═══════════════════════════════════════════════════════════════════════════
    //  BOARD / FEN HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    const getBoard = () => getBoardEl();

    const isValidFen = (fen) => {
        if (!fen || typeof fen !== 'string') return false;
        const p = fen.trim().split(/\s+/);
        if (p.length < 4) return false;
        const ranks = p[0].split('/');
        if (ranks.length !== 8) return false;
        for (const rank of ranks) {
            let n = 0;
            for (const c of rank) {
                if ('rnbqkpRNBQKP'.includes(c)) n++;
                else if ('12345678'.includes(c)) n += +c;
                else return false;
            }
            if (n !== 8) return false;
        }
        return true;
    };

    const getFen = () => {
        try {
            const b = getBoard();
            if (b?.game?.getFEN) {
                const fen = b.game.getFEN();
                if (isValidFen(fen)) return fen;
            }
        } catch(_){}
        return null;
    };

    const getMyColor = () => {
        try {
            const b = getBoard();
            if (!b) return null;
            if (b.game && typeof b.game.getPlayingAs === 'function') {
                const pa = b.game.getPlayingAs();
                if (pa===1) return 'w'; if (pa===2) return 'b';
            }
            if (b.game && typeof b.game.getOptions === 'function') {
                const opts = b.game.getOptions();
                if (opts?.flipped===true)  return 'b';
                if (opts?.flipped===false) return 'w';
            }
            const fa = b.getAttribute('flipped');
            if (fa==='true'||fa==='') return 'b';
            if (fa==='false'||fa===null) return 'w';
            if (b.classList.contains('flipped')) return 'b';
            const myUsername =
                window.chesscom?.user?.username ||
                document.querySelector('.home-username-link')?.textContent?.trim() ||
                document.querySelector('[data-username]')?.dataset?.username ||
                document.querySelector('.nav-profile-username')?.textContent?.trim();
            if (myUsername) {
                const botText=[
                    '.player-component.player-bottom .user-username-component',
                    '.board-player-default:last-child .user-username-component',
                    '[data-player-color="black"] .user-username-component',
                ].map(s=>document.querySelector(s)?.textContent?.trim()).find(Boolean)||'';
                const topText=[
                    '.player-component.player-top .user-username-component',
                    '.board-player-default:first-child .user-username-component',
                    '[data-player-color="white"] .user-username-component',
                ].map(s=>document.querySelector(s)?.textContent?.trim()).find(Boolean)||'';
                const me=myUsername.toLowerCase();
                if (botText.toLowerCase()===me) return 'b';
                if (topText.toLowerCase()===me) return 'w';
            }
            const coords=b.querySelectorAll('.coordinates > *');
            if (coords.length) {
                const rls=[...coords].map(c=>c.textContent.trim()).filter(l=>/^[1-8]$/.test(l));
                if (rls.length>=2) {
                    const last=rls[rls.length-1];
                    if (last==='1') return 'w'; if (last==='8') return 'b';
                }
            }
            for (const piece of b.querySelectorAll('[class*="piece"]')) {
                const sq=piece.getAttribute('square')||'';
                const cls=piece.className||'';
                const rank=parseInt(sq[1],10);
                if (!rank) continue;
                if (cls.includes('wk')||cls.includes('white-king')) return rank<=4?'w':'b';
                if (cls.includes('bk')||cls.includes('black-king')) return rank>=5?'w':'b';
            }
        } catch(_){}
        return null;
    };

    const isMyTurn   = (fen) => { const c=getMyColor(); return !c||fen.split(' ')[1]===c; };
    const isGameOver = () => { try { return getBoard()?.game?.getPositionInfo?.()?.gameOver===true; } catch(_){return false;} };

    // ═══════════════════════════════════════════════════════════════════════════
    //  DUAL API  — Primary: chess-api.com  |  Fallback: stockfish.online
    // ═══════════════════════════════════════════════════════════════════════════
    const httpPost = (url, headers, body) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method:'POST', url, headers, data: body, timeout:10000,
            onload:(r)=>{
                if (r.status>=200&&r.status<300) {
                    try { resolve(JSON.parse(r.responseText)); }
                    catch(_){ reject(new Error('Parse error')); }
                } else reject(new Error(`HTTP ${r.status}`));
            },
            onerror:()=>reject(new Error('Network error')),
            ontimeout:()=>reject(new Error('Timeout')),
        });
    });

    const httpGet = (url) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method:'GET', url, timeout:10000,
            onload:(r)=>{
                if (r.status>=200&&r.status<300) {
                    try { resolve(JSON.parse(r.responseText)); }
                    catch(_){ reject(new Error('Parse error')); }
                } else reject(new Error(`HTTP ${r.status}`));
            },
            onerror:()=>reject(new Error('Network error')),
            ontimeout:()=>reject(new Error('Timeout')),
        });
    });

    // Extract best move from chess-api.com response
    const extractPrimary = (d) => {
        const move =
            d.move || d.bestmove || d.best_move || d.uci ||
            (d.pv ? d.pv.trim().split(/\s+/)[0] : null) || null;
        if (!move || move==='(none)') return null;

        let evalObj = {};
        if (d.mate!=null&&d.mate!==0) evalObj={mate:d.mate};
        else {
            const raw =
                typeof d.eval       ==='number'?d.eval:
                typeof d.evaluation ==='number'?d.evaluation:
                typeof d.score      ==='number'?d.score:
                typeof d.cp         ==='number'?d.cp:
                typeof d.winChance  ==='number'?(d.winChance-50)*4:null;
            if (raw!==null) evalObj={cp:raw};
        }
        return { move, eval:evalObj, depth:d.depth||CONFIG.depth, source:'chess-api' };
    };

    // Extract best move from stockfish.online response
    // Response: { success, bestmove:"bestmove e2e4 ponder ...", evaluation, mate, ... }
    const extractFallback = (d) => {
        if (!d?.success) return null;
        // Parse "bestmove e2e4 ponder e7e5" or just "e2e4"
        let move = null;
        if (d.bestmove) {
            const parts = d.bestmove.trim().split(/\s+/);
            // could be "bestmove e2e4 ..." or just "e2e4"
            if (parts[0]==='bestmove') move = parts[1] || null;
            else move = parts[0] || null;
        }
        if (!move||move==='(none)') return null;

        let evalObj = {};
        if (d.mate!=null&&d.mate!==0) evalObj={mate:d.mate};
        else if (typeof d.evaluation==='number') evalObj={cp:d.evaluation*100};
        else if (typeof d.eval==='number') evalObj={cp:d.eval*100};
        return { move, eval:evalObj, depth:d.depth||CONFIG.depth, source:'stockfish.online' };
    };

    // Call primary API (chess-api.com)
    const callPrimary = async (fen) => {
        const d = await httpPost(
            CONFIG.API_PRIMARY,
            {'Content-Type':'application/json'},
            JSON.stringify({ fen, depth: CONFIG.depth })
        );
        const result = extractPrimary(d);
        if (!result) throw new Error('No move in primary response');
        return result;
    };

    // Call fallback API (stockfish.online)
    const callFallback = async (fen) => {
        const encodedFen = encodeURIComponent(fen);
        const url = `${CONFIG.API_FALLBACK}?fen=${encodedFen}&depth=${CONFIG.depth}`;
        const d = await httpGet(url);
        const result = extractFallback(d);
        if (!result) throw new Error('No move in fallback response');
        return result;
    };

    // Try primary first, then fallback, with retries on each
    const analyzePosition = async (fen) => {
        // Try primary up to 2 times
        for (let i=0; i<2; i++) {
            try { return await callPrimary(fen); }
            catch(e) {
                if (i===0) await new Promise(r=>setTimeout(r, CONFIG.retryDelayMs));
                // else fall through to fallback
            }
        }
        // Primary failed — try fallback up to 2 times
        for (let i=0; i<2; i++) {
            try { return await callFallback(fen); }
            catch(e) {
                if (i===0) await new Promise(r=>setTimeout(r, CONFIG.retryDelayMs));
                else throw new Error('Both APIs failed');
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  DRAGGABLE
    // ═══════════════════════════════════════════════════════════════════════════
    const makeDraggable = (elem, handle) => {
        let drag=false,ox=0,oy=0;
        handle.addEventListener('mousedown',e=>{
            if(e.target.closest('.co-btn,input,label'))return;
            drag=true;
            const r=elem.getBoundingClientRect();
            ox=e.clientX-r.left;oy=e.clientY-r.top;
            elem.classList.add('dragging');e.preventDefault();
        });
        document.addEventListener('mousemove',e=>{
            if(!drag)return;
            elem.style.left  =Math.max(0,Math.min(e.clientX-ox,innerWidth -elem.offsetWidth ))+'px';
            elem.style.top   =Math.max(0,Math.min(e.clientY-oy,innerHeight-elem.offsetHeight))+'px';
            elem.style.right ='auto';elem.style.bottom='auto';
        });
        document.addEventListener('mouseup',()=>{
            if(!drag)return;drag=false;elem.classList.remove('dragging');
            try{localStorage.setItem('co_pos',JSON.stringify({left:elem.style.left,top:elem.style.top}));}catch(_){}
        });
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  BUILD UI
    // ═══════════════════════════════════════════════════════════════════════════
    const buildOverlay = () => {
        document.getElementById('co-wrap')?.remove();

        const wrap=document.createElement('div');
        wrap.id='co-wrap';
        try {
            const p=JSON.parse(localStorage.getItem('co_pos')||'null');
            if(p?.left){wrap.style.left=p.left;wrap.style.top=p.top;wrap.style.right='auto';wrap.style.bottom='auto';}
        } catch(_){}

        wrap.innerHTML=`
            <div id="co-header">
                <div id="co-title-wrap">
                    <div id="co-title-icon">♟</div>
                    <span id="co-title">Engine</span>
                </div>
                <div class="co-btns">
                    <button class="co-btn" id="co-min" title="Minimize">─</button>
                    <button class="co-btn danger" id="co-close" title="Close">✕</button>
                </div>
            </div>
            <div id="co-body">
                <div id="co-idle">
                    <span class="co-idle-icon">♜</span>
                    Not in a game.<br>Start a <b>Live</b>, <b>Daily</b>, or <b>Bot</b> game.
                </div>
                <div id="co-game" style="display:none">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <div id="co-turn-badge" class="white">● White</div>
                        <label id="co-arrow-toggle" title="Show arrow on board">
                            <input type="checkbox" id="co-arrow-check" checked> Show arrow
                        </label>
                    </div>
                    <div id="co-hero">
                        <div>
                            <div id="co-hero-label">Best Move</div>
                            <div id="co-hero-move" class="co-waiting">–</div>
                        </div>
                        <div id="co-hero-right"></div>
                    </div>
                    <div id="co-not-your-turn" style="display:none">Waiting for opponent…</div>
                    <div id="co-stats">
                        <div class="co-stat"><div class="co-stat-label">Evaluation</div><div class="co-stat-val" id="co-eval">–</div></div>
                        <div class="co-stat"><div class="co-stat-label">Depth</div><div class="co-stat-val" id="co-depth">${CONFIG.depth}</div></div>
                    </div>
                    <div id="co-moves-section">
                        <div id="co-moves-header"><span>Alternatives</span><span>Score</span></div>
                        ${[1,2,3,4,5].map(i=>`
                        <div class="co-move-row${i===1?' co-top-move':''}">
                            <span class="co-mn">${i}</span>
                            <span class="co-mm" id="co-m${i}">–</span>
                            <span class="co-ms" id="co-s${i}">–</span>
                        </div>`).join('')}
                    </div>
                    <div id="co-statusbar">
                        <div id="co-status-dot"></div>
                        <span id="co-status-text">Initializing…</span>
                        <span id="co-api-badge">–</span>
                    </div>
                    <div id="co-debug"></div>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);

        const $=id=>document.getElementById(id);
        const el={
            wrap,idle:$('co-idle'),game:$('co-game'),
            turnBadge:$('co-turn-badge'),heroMove:$('co-hero-move'),
            notYourTurn:$('co-not-your-turn'),eval:$('co-eval'),depth:$('co-depth'),
            dot:$('co-status-dot'),statusText:$('co-status-text'),apiBadge:$('co-api-badge'),
            debug:$('co-debug'),arrowCheck:$('co-arrow-check'),
            tm:[1,2,3,4,5].map(i=>({m:$(`co-m${i}`),s:$(`co-s${i}`)})),
        };

        try{if(localStorage.getItem('co_arrow')==='false')el.arrowCheck.checked=false;}catch(_){}
        el.arrowCheck.addEventListener('change',()=>{
            try{localStorage.setItem('co_arrow',String(el.arrowCheck.checked));}catch(_){}
            if(!el.arrowCheck.checked) clearArrow();
        });

        $('co-min').onclick=()=>{
            wrap.classList.toggle('co-minimized');
            $('co-min').textContent=wrap.classList.contains('co-minimized')?'□':'─';
        };
        $('co-close').onclick=()=>{clearArrow();wrap.remove();};
        makeDraggable(wrap,$('co-header'));

        const arrowsOn  =()=>el.arrowCheck.checked;
        const setStatus =(txt,state='')=>{el.statusText.textContent=txt;el.dot.className=state;};
        const showIdle  =()=>{el.idle.style.display='';el.game.style.display='none';clearArrow();};
        const showGame  =()=>{el.idle.style.display='none';el.game.style.display='';};
        const resetHero =()=>{el.heroMove.textContent='–';el.heroMove.className='co-waiting';};

        // ── State ──────────────────────────────────────────────────────────────
        let lastAnalyzedFen = '';
        let analyzing       = false;
        let lastFen         = '';    // previous poll FEN — for detecting any change

        // ── Apply result to UI ─────────────────────────────────────────────────
        const applyResult = (result, forFen) => {
            const { move, eval:ev, depth:d, source } = result;

            el.heroMove.textContent = move;
            el.heroMove.className   = '';
            el.apiBadge.textContent = source==='chess-api' ? 'chess-api' : 'stockfish';

            // Arrow — draw only if board is still on same position
            if (arrowsOn() && move.length>=4 && getFen()===forFen) {
                drawArrow(move.slice(0,2), move.slice(2,4), forFen);
            }

            // Eval
            let evalTxt='–', evalCls='';
            if (ev.mate!=null) {
                evalTxt=`M${Math.abs(ev.mate)}`;
                evalCls=ev.mate>0?'good':'bad';
            } else if (ev.cp!=null) {
                const turn=forFen.split(' ')[1];
                const de  =turn==='b'?-ev.cp:ev.cp;
                evalTxt   =(de>0?'+':'')+(de/100).toFixed(2);
                evalCls   =de>30?'good':de>=-30?'equal':'bad';
            }
            el.eval.textContent=evalTxt;
            el.eval.className  =`co-stat-val ${evalCls}`;
            el.depth.textContent=d;

            // Alternatives row 1
            el.tm[0].m.textContent=move;
            el.tm[0].s.textContent=evalTxt;
            for(let i=1;i<5;i++){el.tm[i].m.textContent='–';el.tm[i].s.textContent='–';}
        };

        // ── Main poll ──────────────────────────────────────────────────────────
        const poll = async () => {
            if (!isGamePage()) { showIdle(); clearArrow(); return; }
            showGame();
            if (isGameOver()) { clearArrow(); setStatus('Game over',''); return; }

            const fen = getFen();
            if (!fen) { setStatus('Waiting for board…','loading'); return; }

            const turn   = fen.split(' ')[1];
            const myTurn = isMyTurn(fen);
            const myColor= getMyColor();

            // ── INSTANT CLEAR: FEN changed → remove our arrow immediately ─────
            if (fen !== lastFen) {
                clearArrow();
                lastFen = fen;
            }

            // Turn badge
            el.turnBadge.textContent=turn==='w'?'● White to move':'● Black to move';
            el.turnBadge.className  =turn==='w'?'white':'black';
            if (myTurn) el.turnBadge.classList.add('your-turn');
            el.debug.textContent=`me:${myColor??'?'} turn:${turn}${myTurn?' ← MINE':''}`;

            if (!myTurn) {
                el.notYourTurn.style.display='';
                setStatus("Opponent's turn",'');
                return;
            }
            el.notYourTurn.style.display='none';

            // Already have result for this position — redraw arrow if it got cleared
            if (fen===lastAnalyzedFen) {
                // Arrow was cleared on FEN change. If it's still our turn on same FEN,
                // re-draw from stored hero move text
                const storedMove=el.heroMove.textContent;
                if (arrowsOn()&&storedMove.length>=4&&!arrowVisible&&el.heroMove.className==='') {
                    drawArrow(storedMove.slice(0,2),storedMove.slice(2,4),fen);
                }
                return;
            }

            if (analyzing) return;

            lastAnalyzedFen=fen;
            analyzing=true;

            setStatus('Analyzing…','loading');
            el.heroMove.textContent='…';
            el.heroMove.className='co-waiting';

            wrap.classList.remove('co-flash');
            void wrap.offsetWidth;
            wrap.classList.add('co-flash');

            const fenAtReq=fen;

            try {
                const result = await analyzePosition(fenAtReq);
                const nowFen = getFen();

                if (nowFen && nowFen!==fenAtReq) {
                    // Position moved on while we waited — show text, no arrow
                    el.heroMove.textContent=result.move;
                    el.heroMove.className='';
                    el.apiBadge.textContent=result.source==='chess-api'?'chess-api':'stockfish';
                    setStatus('Position changed','');
                    // Reset so we re-analyze the new position next tick
                    lastAnalyzedFen='';
                } else {
                    applyResult(result, fenAtReq);
                    setStatus('Live','ok');
                }
            } catch(err) {
                setStatus(err.message,'err');
                resetHero();
                lastAnalyzedFen='';  // allow retry next tick
                console.error('[ChessOverlay]', err);
            } finally {
                analyzing=false;
            }
        };

        setInterval(poll, CONFIG.pollIntervalMs);
        setTimeout(poll, 800);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  BOOTSTRAP
    // ═══════════════════════════════════════════════════════════════════════════
    const boot = () => {
        if (window.__coOverlayV12) return;
        window.__coOverlayV12 = true;
        buildOverlay();
        onNavigate(()=>{
            setTimeout(()=>{
                clearArrow();
                document.getElementById(CONFIG.ARROW_ID)?.remove();
                arrowSvg=null; arrowVisible=false; arrowForFen='';
                buildOverlay();
                window.__coOverlayV12=true;
            }, 1200);
        });
    };

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();

// v1