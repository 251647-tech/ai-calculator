/* ai-nl.js — Natural Language AI Layer for Your Scientific Calculator
   Works with:
   - window.evaluateExpression (from your script.js)
   - DEG/RAD mode (your trig wrapper)
   - history system
   - parser + shunting-yard + RPN evaluator
*/

(() => {

  // ===============================
  // 1. NLP RULE TABLE
  // ===============================
  const RULES = [
    [/\bplus\b/gi, '+'],
    [/\badd\b/gi, '+'],
    [/\bminus\b/gi, '-'],
    [/\bsubtract\b/gi, '-'],
    [/\bmultipl(y|ied|y by)\b/gi, '*'],
    [/\btimes\b/gi, '*'],
    [/\binto\b/gi, '*'],
    [/\bdivided by\b/gi, '/'],
    [/\bdivide\b/gi, '/'],
    [/\bover\b/gi, '/'],
    [/\bpercent of\b/gi, '% of'],
    [/\bpercent\b/gi, '%'],
    [/\bper cent\b/gi, '%'],
    [/\bto the power of\b/gi, '^'],
    [/\bpower of\b/gi, '^'],
    [/\bsquared\b/gi, '^2'],
    [/\bcubed\b/gi, '^3'],
    [/\bsquare root of\b/gi, 'sqrt('],
    [/\bsquare root\b/gi, 'sqrt('],
    [/\broot of\b/gi, 'sqrt('],
    [/\bsin\b/gi, 'sin'],
    [/\bcos\b/gi, 'cos'],
    [/\btan\b/gi, 'tan'],
    [/\bsolve\b/gi, 'solve'],
    [/\bequals\b/gi, '='],
  ];

  // ===============================
  // 2. AI FLOATING UI CREATION
  // ===============================
  function createUI() {
    const toggle = document.createElement("button");
    toggle.className = "ai-toggle-btn";
    toggle.innerHTML = "AI";
    document.body.appendChild(toggle);

    const box = document.createElement("div");
    box.className = "ai-bubble";
    box.style.display = "none";

    box.innerHTML = `
      <div class="head">
        <h4>AI Input</h4>
        <button class="close-btn">✕</button>
      </div>

      <div class="body">
        <input id="aiInput" placeholder="e.g. 20% of 450, solve 2x+5=15" />

        <div class="example-list">
          <div class="example">20% of 450</div>
          <div class="example">solve 2x + 6 = 16</div>
          <div class="example">square root of 81</div>
          <div class="example">sin 45 + cos 30</div>
        </div>

        <div class="results" id="aiResults"></div>
      </div>
    `;

    document.body.appendChild(box);

    // Events
    toggle.addEventListener("click", () => {
      box.style.display = box.style.display === "none" ? "block" : "none";
    });

    box.querySelector(".close-btn").addEventListener("click", () => {
      box.style.display = "none";
    });

    const input = box.querySelector("#aiInput");
    const results = box.querySelector("#aiResults");

    // ENTER to run
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (input.value.trim()) {
          processInput(input.value.trim(), results);
          input.value = "";
        }
      }
    });

    // Example click
    box.querySelectorAll(".example").forEach(ex => {
      ex.addEventListener("click", () => {
        input.value = ex.textContent;
        input.focus();
      });
    });
  }

  // ===============================
  // 3. NATURAL LANGUAGE → EXPRESSION
  // ===============================
  function applyRules(t) {
    let s = t.toLowerCase();

    // Remove question marks
    s = s.replace(/\?/g, '').trim();

    // Core replacements
    RULES.forEach(([re, rep]) => {
      s = s.replace(re, rep);
    });

    // Percent of → (x/100)*y
    s = s.replace(/(\d+)\s*% of\s*(\d+)/gi, "($1/100)*$2");

    // "x percent" → x%
    s = s.replace(/(\d+)\s*percent/gi, "$1%");

    // Square root auto close
    s = s.replace(/sqrt\((\d+)(?!\))/gi, "sqrt($1)");

    // Remove filler words
    s = s.replace(/\bwhat is\b/gi, "");
    s = s.replace(/\bcalculate\b/gi, "");
    s = s.replace(/\bcompute\b/gi, "");
    s = s.replace(/\bthen\b/gi, "");

    return s.trim();
  }

  // ===============================
  // 4. MAIN AI PROCESSOR
  // ===============================
  function processInput(text, container) {
    container.innerHTML = `<div class="result-row">Processing…</div>`;

    try {
      // "solve" mode detected
      if (/solve/i.test(text) || text.includes("=")) {
        container.innerHTML = `
          <div class="result-row">
            <strong>Equation solving is not built-in yet</strong><br>
            Expression mode will be used.
          </div>
        `;
      }

      const expr = applyRules(text);

      const out1 = document.createElement("div");
      out1.className = "result-row";
      out1.innerHTML = `<strong>Expression:</strong> ${expr}`;
      container.innerHTML = "";
      container.appendChild(out1);

      let result;

      if (window.evaluateExpression) {
        try {
          result = window.evaluateExpression(expr);
        } catch (e) {
          result = "Error";
        }
      } else {
        result = "Evaluator missing";
      }

      const out2 = document.createElement("div");
      out2.className = "result-row";
      out2.innerHTML = `<strong>Result:</strong> ${result}`;
      container.appendChild(out2);

      const display = document.getElementById("display");
      const expression = document.getElementById("expression");
      if (display) display.textContent = result;
      if (expression) expression.textContent = expr;

    } catch (e) {
      container.innerHTML = `<div class="result-row">Error: ${e.message}</div>`;
    }
  }

  // ===============================
  // 5. INIT
  // ===============================
  document.addEventListener("DOMContentLoaded", createUI);

})();
