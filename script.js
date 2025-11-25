
/* final_script.js - Complete Scientific Calculator with AI Bridge
   - Tokenizer + Shunting-yard + RPN evaluator
   - Features: keyboard support, scientific functions, deg/rad toggle,
               postfix ! and % operators, history persisted in localStorage,
               focus navigation and graceful error handling.
   - Exposes global evaluator for AI: window.evaluateExpression
   - Provides showAIResult(msg) to display AI result on calculator
*/

(() => {
  // ——— DOM elements (guarded) ———
  const displayEl = document.getElementById('display');
  const exprEl = document.getElementById('expression');
  const buttons = Array.from(document.querySelectorAll('.btn')) || [];
  const historyPanel = document.getElementById('historyPanel');
  const historyList = document.getElementById('historyList');
  const degToggle = document.getElementById('degToggle');
  const historyToggle = document.getElementById('historyToggle');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const exportHistoryBtn = document.getElementById('exportHistory');

  if (!displayEl || !exprEl) {
    console.error('Missing required elements (#display or #expression).');
    return;
  }

  // ——— State ———
  let expr = '';
  let locked = false; // after error
  let useDegrees = true;
  let history = [];
  try { history = JSON.parse(localStorage.getItem('calc_history_v1') || '[]'); } catch (e) { history = []; }

  // ——— Utilities ———
  const isDigit = (c) => /[0-9]/.test(c);
  const isAlpha = (c) => /[a-zA-Z]/.test(c);
  const isWhitespace = (c) => /\s/.test(c);

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render() {
    exprEl.textContent = expr;
    displayEl.textContent = expr === '' ? '0' : expr;
  }

  // Factorial (integer only)
  function factorial(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n < 0) throw new Error('Invalid factorial');
    if (Math.floor(n) !== n) throw new Error('Factorial requires integer');
    if (n > 170) throw new Error('Result too large');
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  // Trig wrapper to respect DEG/RAD
  function trigOp(name, x) {
    let v = Number(x);
    if (!Number.isFinite(v)) throw new Error('Invalid trig arg');
    if (useDegrees) v = v * Math.PI / 180;
    switch (name) {
      case 'sin': return Math.sin(v);
      case 'cos': return Math.cos(v);
      case 'tan': return Math.tan(v);
      case 'csc': return 1 / Math.sin(v);
      case 'sec': return 1 / Math.cos(v);
      case 'cot': return 1 / Math.tan(v);
      default: throw new Error('Unknown trig');
    }
  }

  // ——— Tokenizer ———
  function tokenize(s) {
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (isWhitespace(ch)) { i++; continue; }

      // number (supports decimals)
      if (isDigit(ch) || (ch === '.' && isDigit(s[i+1] || ''))) {
        let j = i + 1;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const numStr = s.slice(i, j);
        if ((numStr.match(/\./g) || []).length > 1) throw new Error('Invalid number');
        tokens.push({ type: 'number', value: parseFloat(numStr) });
        i = j;
        continue;
      }

      // identifier (function names)
      if (isAlpha(ch)) {
        let j = i + 1;
        while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++;
        const name = s.slice(i, j).toLowerCase();
        tokens.push({ type: 'name', value: name });
        i = j;
        continue;
      }

      // parentheses & comma
      if (ch === '(' || ch === ')' || ch === ',') {
        tokens.push({ type: ch === '(' ? 'lparen' : ch === ')' ? 'rparen' : 'comma', value: ch });
        i++; continue;
      }

      // postfix operators ! and %
      if (ch === '!' || ch === '%') {
        tokens.push({ type: 'postfix', value: ch });
        i++; continue;
      }

      // operators + - * / ^ 
      if ('+-*/^'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++; continue;
      }

      // Unicode variants ÷ × − — map them to standard
      if (ch === '÷') { tokens.push({ type: 'op', value: '/' }); i++; continue; }
      if (ch === '×') { tokens.push({ type: 'op', value: '*' }); i++; continue; }
      if (ch === '−' || ch === '—') { tokens.push({ type: 'op', value: '-' }); i++; continue; }

      throw new Error('Unexpected character: ' + ch);
    }
    return tokens;
  }

  // ——— Shunting-yard → RPN ———
  const OPS = {
    '+': { prec: 2, assoc: 'L', fn: (a,b)=>a+b },
    '-': { prec: 2, assoc: 'L', fn: (a,b)=>a-b },
    '*': { prec: 3, assoc: 'L', fn: (a,b)=>a*b },
    '/': { prec: 3, assoc: 'L', fn: (a,b)=>a/b },
    '^': { prec: 4, assoc: 'R', fn: (a,b)=>Math.pow(a,b) },
  };

  function toRPN(tokens) {
    const output = [];
    const stack = [];
    let prevToken = null;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      if (t.type === 'number') {
        output.push(t);
      } else if (t.type === 'name') {
        // function or constant (support 'pi' and 'e')
        if (t.value === 'pi') {
          output.push({ type: 'number', value: Math.PI });
        } else if (t.value === 'e') {
          output.push({ type: 'number', value: Math.E });
        } else {
          stack.push(t); // function name
        }
      } else if (t.type === 'comma') {
        // pop until left paren
        while (stack.length && stack[stack.length-1].type !== 'lparen') {
          output.push(stack.pop());
        }
        if (!stack.length) throw new Error('Misplaced comma or parentheses');
      } else if (t.type === 'op') {
        // handle unary minus (if prev token is null or operator or leftparen)
        const isUnary = (t.value === '-') && (prevToken == null || (prevToken.type === 'op' || prevToken.type === 'lparen' || prevToken.type === 'comma'));
        if (isUnary) {
          // treat unary minus as a function 'u-' (high precedence)
          stack.push({ type: 'func', value: 'u-' });
        } else {
          while (stack.length) {
            const top = stack[stack.length-1];
            if (top.type === 'op') {
              const o1 = t.value;
              const o2 = top.value;
              const p1 = OPS[o1].prec, p2 = OPS[o2].prec;
              if ((OPS[o1].assoc === 'L' && p1 <= p2) || (OPS[o1].assoc === 'R' && p1 < p2)) {
                output.push(stack.pop());
                continue;
              }
            }
            break;
          }
          stack.push(t);
        }
      } else if (t.type === 'lparen') {
        stack.push(t);
      } else if (t.type === 'rparen') {
        // pop until lparen
        while (stack.length && stack[stack.length-1].type !== 'lparen') {
          output.push(stack.pop());
        }
        if (!stack.length) throw new Error('Mismatched parentheses');
        stack.pop(); // remove lparen
        // if function name on top, pop it to output
        if (stack.length && (stack[stack.length-1].type === 'name' || stack[stack.length-1].type === 'func')) {
          output.push(stack.pop());
        }
      } else if (t.type === 'postfix') {
        // postfix operators are placed directly to output as tokens so RPN evaluator can handle them
        output.push(t);
      } else {
        throw new Error('Unknown token type: ' + t.type);
      }
      prevToken = t;
    }

    while (stack.length) {
      const top = stack.pop();
      if (top.type === 'lparen' || top.type === 'rparen') throw new Error('Mismatched parentheses');
      output.push(top);
    }

    return output;
  }

  // ——— RPN evaluator ———
  function evalRPN(rpn) {
    const st = [];
    for (let i = 0; i < rpn.length; i++) {
      const t = rpn[i];
      if (t.type === 'number') {
        st.push(t.value);
      } else if (t.type === 'op') {
        const b = st.pop(); const a = st.pop();
        if (a === undefined || b === undefined) throw new Error('Invalid binary operation');
        const res = OPS[t.value].fn(a,b);
        if (!Number.isFinite(res)) throw new Error('Math error');
        st.push(res);
      } else if (t.type === 'postfix') {
        const a = st.pop();
        if (a === undefined) throw new Error('Invalid postfix operation');
        if (t.value === '!') {
          st.push(factorial(a));
        } else if (t.value === '%') {
          st.push(a / 100);
        } else {
          throw new Error('Unknown postfix: ' + t.value);
        }
      } else if (t.type === 'name' || t.type === 'func') {
        const name = t.value;
        // functions: sin, cos, tan, sec, csc, cot, ln, log, sqrt
        if (name === 'u-') {
          // unary minus
          const a = st.pop();
          if (a === undefined) throw new Error('Invalid unary');
          st.push(-a);
        } else if (['sin','cos','tan','sec','csc','cot'].includes(name)) {
          const a = st.pop();
          if (a === undefined) throw new Error('Invalid function arg');
          const v = trigOp(name, a);
          st.push(v);
        } else if (name === 'ln') {
          const a = st.pop();
          if (a === undefined) throw new Error('Invalid function arg');
          st.push(Math.log(a));
        } else if (name === 'log') {
          const a = st.pop();
          if (a === undefined) throw new Error('Invalid function arg');
          // base 10 log; fallback if Math.log10 not supported
          if (typeof Math.log10 === 'function') st.push(Math.log10(a));
          else st.push(Math.log(a) / Math.LN10);
        } else if (name === 'sqrt') {
          const a = st.pop();
          if (a === undefined) throw new Error('Invalid function arg');
          st.push(Math.sqrt(a));
        } else {
          throw new Error('Unknown function: ' + name);
        }
      } else {
        throw new Error('Unhandled RPN token: ' + JSON.stringify(t));
      }
    }
    if (st.length !== 1) throw new Error('Invalid expression');
    const final = st[0];
    if (typeof final !== 'number' || !Number.isFinite(final)) throw new Error('Result not finite');
    return final;
  }

  // ——— Evaluate expression (tokenize → RPN → eval)
  // expose internal evaluator to global after IIFE
  function internalEvaluateExpression(str) {
    // quick sanitize: convert unicode operators always
    const normalized = String(str)
      .replace(/÷/g, '/')
      .replace(/×/g, '*')
      .replace(/−/g, '-')
      .replace(/\s+/g, '');
    const tokens = tokenize(normalized);
    const rpn = toRPN(tokens);
    const value = evalRPN(rpn);
    return value;
  }

  // ——— Input handling and UI glue ———
  function handleInput({ action, val, fnName }) {
    if (locked && action !== 'clear') return;
    if (action === 'clear') {
      expr = '';
      locked = false;
      render();
      return;
    }
    if (action === 'back') {
      expr = expr.slice(0, -1);
      render();
      return;
    }
    if (action === 'equals') {
      if (!expr) return;
      try {
        const raw = expr;
        const res = internalEvaluateExpression(expr);
        const display = (Number.isInteger(res) ? res : +res.toPrecision(12)).toString();
        history.unshift({ expr: raw, result: display, ts: Date.now() });
        history = history.slice(0, 200);
        try { localStorage.setItem('calc_history_v1', JSON.stringify(history)); } catch (e) {}
        updateHistoryUI();
        expr = display;
        locked = false;
        render();
      } catch (err) {
        displayEl.textContent = 'Error';
        locked = true;
        console.warn('Eval error:', err && err.message ? err.message : err);
      }
      return;
    }
    if (fnName) {
      // append function name plus '('
      expr += fnName;
      render();
      return;
    }
    if (val !== undefined) {
      // basic guard: don't allow two binary ops in a row (except minus unary)
      const last = expr.slice(-1);
      const ops = '+-*/^';
      if (ops.includes(last) && ops.includes(val)) {
        expr = expr.slice(0, -1) + val;
      } else {
        expr += val;
      }
      render();
      return;
    }
  }

  // attach button handlers
  buttons.forEach(btn => {
    const val = btn.dataset.val;
    const action = btn.dataset.action;
    const fnName = btn.dataset.fn;
    btn.tabIndex = 0;
    btn.addEventListener('click', () => handleInput({ action, val, fnName }));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleInput({ action, val, fnName });
      }
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        e.preventDefault();
        focusDir(e.key);
      }
    });
  });

  // keyboard global events
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key >= '0' && e.key <= '9') { handleInput({ val: e.key }); e.preventDefault(); return; }
    if (e.key === '.') { handleInput({ val: '.' }); e.preventDefault(); return; }
    if (e.key === 'Backspace') { handleInput({ action: 'back' }); e.preventDefault(); return; }
    if (e.key === 'Escape') { handleInput({ action: 'clear' }); e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === '=') { handleInput({ action: 'equals' }); e.preventDefault(); return; }

    if (['+','-','*','/','^'].includes(e.key)) { handleInput({ val: e.key }); e.preventDefault(); return; }
    if (e.key === '%') { handleInput({ val: '%' }); e.preventDefault(); return; }
    if (e.key === '(' || e.key === ')') { handleInput({ val: e.key }); e.preventDefault(); return; }

    // letter shortcuts
    const key = e.key.toLowerCase();
    if (key === 's') { handleInput({ fnName: 'sin(' }); e.preventDefault(); return; }
    if (key === 'c') { handleInput({ fnName: 'cos(' }); e.preventDefault(); return; }
    if (key === 't') { handleInput({ fnName: 'tan(' }); e.preventDefault(); return; }
    if (key === 'l') { handleInput({ fnName: 'ln(' }); e.preventDefault(); return; }
    if (key === 'g') { handleInput({ fnName: 'log(' }); e.preventDefault(); return; }
  });

  // focus navigation
  const btnGrid = buttons;
  function focusDir(key) {
    const idx = btnGrid.indexOf(document.activeElement);
    const cols = 4;
    if (idx === -1) { if (btnGrid[0]) btnGrid[0].focus(); return; }
    let t = idx;
    if (key === 'ArrowLeft') t = Math.max(0, idx - 1);
    if (key === 'ArrowRight') t = Math.min(btnGrid.length - 1, idx + 1);
    if (key === 'ArrowUp') t = Math.max(0, idx - cols);
    if (key === 'ArrowDown') t = Math.min(btnGrid.length - 1, idx + cols);
    if (btnGrid[t]) btnGrid[t].focus();
  }

  // history UI
  function updateHistoryUI() {
    if (!historyList) return;
    historyList.innerHTML = '';
    history.forEach(h => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="his-expr">${escapeHtml(h.expr)}</span><strong class="his-res">${escapeHtml(h.result)}</strong>`;
      li.addEventListener('click', () => { expr = h.result; render(); });
      historyList.appendChild(li);
    });
  }

  clearHistoryBtn?.addEventListener('click', () => {
    history = [];
    try { localStorage.removeItem('calc_history_v1'); } catch (e) {}
    updateHistoryUI();
  });

  exportHistoryBtn?.addEventListener('click', () => {
    const data = JSON.stringify(history, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'calc-history.json'; a.click();
    URL.revokeObjectURL(url);
  });

  degToggle?.addEventListener('click', () => {
    useDegrees = !useDegrees;
    if (degToggle) degToggle.textContent = useDegrees ? 'DEG' : 'RAD';
  });

  historyToggle?.addEventListener('click', () => {
    if (!historyPanel) return;
    const isHidden = historyPanel.hasAttribute('hidden');
    if (isHidden) {
      historyPanel.removeAttribute('hidden');
      historyToggle.setAttribute('aria-expanded', 'true');
    } else {
      historyPanel.setAttribute('hidden', '');
      historyToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // initial render
  updateHistoryUI();
  render();

})(); 
// --- AI Evaluator Bridge ---
// Make a global evaluator that calls the internal evaluator
window.evaluateExpression = function(expr) {
  try {
    return window._internalEvaluate(expr);
  } catch (e) {
    // if internal not set, try fallback name
    try { return internalEvaluateExpression(expr); } catch (err) { return "Error"; }
  }
};

// shim: if the internal function wasn't exposed, set it now
if (typeof window._internalEvaluate !== 'function') {
  // expose the IIFE internal evaluator by detecting function defined earlier
  try {
    // try to bind the earlier internal function name if present in scope
    // (some older versions used internalEvaluateExpression)
    if (typeof internalEvaluateExpression === 'function') {
      window._internalEvaluate = internalEvaluateExpression;
    }
  } catch (e) { /* no-op */ }
}

// Show AI result on calculator display
window.showAIResult = function (msg) {
  try {
    const display = document.getElementById("display");
    const exprOut = document.getElementById("expression");
    if (display) display.textContent = msg;
    if (exprOut) exprOut.textContent = "AI →";
  } catch (e) {
    console.error("AI display error:", e);
  }
};
