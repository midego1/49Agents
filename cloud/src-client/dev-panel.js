// ─── 49Agents Dev Panel ───────────────────────────────────────────────────
// Activated via ?dev=true URL parameter or Ctrl+Shift+D keyboard shortcut.
// Provides simulation tools for testing UI without a real agent connection.

(function() {
  'use strict';

  let panelVisible = false;
  let panelEl = null;
  let dummyPaneCounter = 0;
  let claudeStateInterval = null;
  const DUMMY_AGENT_ID = 'dev-agent-000000';
  const DUMMY_AGENT_NAME = 'DevAgent';

  // ── Activation ──

  function shouldActivate() {
    return new URLSearchParams(window.location.search).has('dev');
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      togglePanel();
    }
  });

  // ── Panel UI ──

  function createPanel() {
    const el = document.createElement('div');
    el.id = 'dev-panel';
    el.innerHTML = `
      <style>
        #dev-panel {
          position: fixed;
          bottom: 12px;
          right: 12px;
          width: 320px;
          max-height: 80vh;
          overflow-y: auto;
          background: rgba(20, 22, 30, 0.95);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 10px;
          padding: 14px;
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 12px;
          color: rgba(255,255,255,0.85);
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        #dev-panel .dp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        #dev-panel .dp-title {
          font-weight: 700;
          font-size: 13px;
          color: rgba(129,212,250,0.9);
        }
        #dev-panel .dp-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          font-size: 16px;
          padding: 2px 6px;
        }
        #dev-panel .dp-close:hover { color: rgba(255,255,255,0.8); }
        #dev-panel .dp-section {
          margin-bottom: 12px;
        }
        #dev-panel .dp-section-title {
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: rgba(255,255,255,0.45);
          margin-bottom: 6px;
        }
        #dev-panel .dp-btn {
          display: block;
          width: 100%;
          padding: 7px 10px;
          margin-bottom: 4px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: rgba(255,255,255,0.8);
          font-size: 12px;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
        }
        #dev-panel .dp-btn:hover {
          background: rgba(255,255,255,0.12);
        }
        #dev-panel .dp-btn:active {
          background: rgba(255,255,255,0.18);
        }
        #dev-panel .dp-btn-row {
          display: flex;
          gap: 4px;
        }
        #dev-panel .dp-btn-row .dp-btn {
          flex: 1;
          text-align: center;
        }
        #dev-panel .dp-btn.dp-danger {
          border-color: rgba(239,154,154,0.3);
          color: rgba(239,154,154,0.9);
        }
        #dev-panel .dp-btn.dp-danger:hover {
          background: rgba(239,154,154,0.15);
        }
        #dev-panel .dp-status {
          font-size: 11px;
          color: rgba(255,255,255,0.35);
          margin-top: 2px;
          padding: 4px 0;
        }
        #dev-panel .dp-select {
          width: 100%;
          padding: 6px 8px;
          margin-bottom: 4px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px;
          color: rgba(255,255,255,0.8);
          font-size: 12px;
        }
      </style>
      <div class="dp-header">
        <span class="dp-title">Dev Panel</span>
        <button class="dp-close" id="dp-close">x</button>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Fake Agent</div>
        <button class="dp-btn" id="dp-inject-agent">Inject dummy agent (online)</button>
        <button class="dp-btn" id="dp-toggle-agent">Toggle agent online/offline</button>
        <div class="dp-status" id="dp-agent-status">No dummy agent</div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Panes</div>
        <button class="dp-btn" id="dp-add-terminal">Add dummy terminal pane</button>
        <button class="dp-btn" id="dp-add-note">Add dummy note pane</button>
        <button class="dp-btn" id="dp-add-file">Add dummy file pane</button>
        <button class="dp-btn dp-danger" id="dp-clear-panes">Remove all dummy panes</button>
        <div class="dp-status" id="dp-pane-status">0 dummy panes</div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Notification Sounds</div>
        <div class="dp-btn-row">
          <button class="dp-btn" id="dp-sound-permission">Permission</button>
          <button class="dp-btn" id="dp-sound-question">Question</button>
          <button class="dp-btn" id="dp-sound-dismiss">Dismiss</button>
        </div>
        <div class="dp-btn-row">
          <button class="dp-btn" id="dp-sound-permission-esc">Perm (loud)</button>
          <button class="dp-btn" id="dp-sound-question-esc">Q (loud)</button>
          <button class="dp-btn" id="dp-sound-generic">Generic</button>
        </div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Claude State Simulation</div>
        <select class="dp-select" id="dp-state-select">
          <option value="">-- Pick a state --</option>
          <option value="working">Working</option>
          <option value="idle">Idle</option>
          <option value="permission">Permission needed</option>
          <option value="question">Question / Input needed</option>
          <option value="inputNeeded">Input needed (alt)</option>
        </select>
        <button class="dp-btn" id="dp-fire-state">Fire state on all dummy panes</button>
        <button class="dp-btn" id="dp-cycle-states">Auto-cycle states (5s each)</button>
        <button class="dp-btn dp-danger" id="dp-stop-cycle">Stop cycling</button>
        <div class="dp-status" id="dp-state-status">Idle</div>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">Toast Notifications</div>
        <button class="dp-btn" id="dp-toast-permission">Show "Needs permission" toast</button>
        <button class="dp-btn" id="dp-toast-question">Show "Needs input" toast</button>
        <button class="dp-btn" id="dp-toast-complete">Show "Task complete" toast</button>
        <button class="dp-btn" id="dp-toast-custom">Show custom toast</button>
      </div>
    `;

    document.body.appendChild(el);
    panelEl = el;

    // Wire up event handlers
    el.querySelector('#dp-close').addEventListener('click', togglePanel);
    el.querySelector('#dp-inject-agent').addEventListener('click', injectDummyAgent);
    el.querySelector('#dp-toggle-agent').addEventListener('click', toggleDummyAgent);
    el.querySelector('#dp-add-terminal').addEventListener('click', () => addDummyPane('terminal'));
    el.querySelector('#dp-add-note').addEventListener('click', () => addDummyPane('note'));
    el.querySelector('#dp-add-file').addEventListener('click', () => addDummyPane('file'));
    el.querySelector('#dp-clear-panes').addEventListener('click', clearDummyPanes);

    el.querySelector('#dp-sound-permission').addEventListener('click', () => dbg().playNotificationSound('permission', 0));
    el.querySelector('#dp-sound-question').addEventListener('click', () => dbg().playNotificationSound('question', 0));
    el.querySelector('#dp-sound-dismiss').addEventListener('click', () => dbg().playDismissSound());
    el.querySelector('#dp-sound-permission-esc').addEventListener('click', () => dbg().playNotificationSound('permission', 5));
    el.querySelector('#dp-sound-question-esc').addEventListener('click', () => dbg().playNotificationSound('question', 5));
    el.querySelector('#dp-sound-generic').addEventListener('click', () => dbg().playNotificationSound('other', 0));

    el.querySelector('#dp-fire-state').addEventListener('click', fireSelectedState);
    el.querySelector('#dp-cycle-states').addEventListener('click', startCycleStates);
    el.querySelector('#dp-stop-cycle').addEventListener('click', stopCycleStates);

    el.querySelector('#dp-toast-permission').addEventListener('click', () => showFakeToast('permission'));
    el.querySelector('#dp-toast-question').addEventListener('click', () => showFakeToast('question'));
    el.querySelector('#dp-toast-complete').addEventListener('click', () => showFakeToast('idle'));
    el.querySelector('#dp-toast-custom').addEventListener('click', showCustomToastPrompt);

    return el;
  }

  function togglePanel() {
    if (!panelEl) createPanel();
    panelVisible = !panelVisible;
    panelEl.style.display = panelVisible ? 'block' : 'none';
  }

  // ── Helpers ──

  function dbg() { return window.TC2_DEBUG; }

  function getDummyPanes() {
    return dbg().state.panes.filter(p => p._isDummy);
  }

  function updatePaneStatus() {
    const el = document.getElementById('dp-pane-status');
    if (el) el.textContent = `${getDummyPanes().length} dummy pane(s)`;
  }

  function updateAgentStatus() {
    const el = document.getElementById('dp-agent-status');
    if (!el) return;
    const agents = dbg().agents;
    const dummy = agents.find(a => a.agentId === DUMMY_AGENT_ID);
    if (dummy) {
      el.textContent = `${DUMMY_AGENT_NAME}: ${dummy.online ? 'online' : 'offline'}`;
    } else {
      el.textContent = 'No dummy agent';
    }
  }

  function genId() {
    return 'dev-' + (++dummyPaneCounter).toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // ── Fake Agent ──

  function injectDummyAgent() {
    const agents = dbg().agents;
    const existing = agents.find(a => a.agentId === DUMMY_AGENT_ID);
    if (existing) {
      existing.online = true;
      updateAgentStatus();
      return;
    }

    agents.push({
      agentId: DUMMY_AGENT_ID,
      online: true,
      version: '0.0.0-dev',
      hostname: DUMMY_AGENT_NAME,
      createdAt: new Date().toISOString(),
    });

    dbg().renderHud();
    updateAgentStatus();
  }

  function toggleDummyAgent() {
    const agents = dbg().agents;
    const dummy = agents.find(a => a.agentId === DUMMY_AGENT_ID);
    if (!dummy) {
      injectDummyAgent();
      return;
    }
    dummy.online = !dummy.online;
    dbg().renderHud();
    updateAgentStatus();
  }

  // ── Dummy Panes ──

  function addDummyPane(type) {
    const id = genId();
    const defaults = dbg().PANE_DEFAULTS[type] || { width: 500, height: 350 };

    // Stagger position based on count
    const offset = getDummyPanes().length * 30;
    const paneData = {
      id,
      type,
      x: 100 + offset,
      y: 100 + offset,
      width: defaults.width,
      height: defaults.height,
      zIndex: dbg().state.nextZIndex++,
      agentId: DUMMY_AGENT_ID,
      _isDummy: true,
    };

    // Type-specific fields
    if (type === 'terminal') {
      paneData.tmuxSession = 'dev-tmux-' + dummyPaneCounter;
      paneData.device = DUMMY_AGENT_NAME;
    } else if (type === 'note') {
      paneData.content = '# Dev Note\n\nThis is a dummy note pane for testing.';
      paneData.fontSize = 13;
    } else if (type === 'file') {
      paneData.fileName = 'example.js';
      paneData.filePath = '/tmp/example.js';
      paneData.content = '// Dummy file content\nconst hello = "world";\nconsole.log(hello);\n';
      paneData.device = DUMMY_AGENT_NAME;
    }

    dbg().state.panes.push(paneData);
    dbg().renderPane(paneData);
    dbg().updateCanvasTransform();
    updatePaneStatus();
  }

  function clearDummyPanes() {
    const dummies = getDummyPanes();
    for (const pane of dummies) {
      dbg().deletePane(pane.id);
    }
    updatePaneStatus();
  }

  // ── Claude State Simulation ──

  function fireSelectedState() {
    const select = document.getElementById('dp-state-select');
    const state = select?.value;
    if (!state) return;
    fireStateOnDummies(state);
  }

  function fireStateOnDummies(claudeState) {
    const dummies = getDummyPanes().filter(p => p.type === 'terminal');
    if (dummies.length === 0) {
      // Fire on a fake terminal ID so the toast still shows
      fireSingleState('dev-sim-terminal', claudeState);
      return;
    }
    for (const pane of dummies) {
      fireSingleState(pane.id, claudeState);
    }
    const statusEl = document.getElementById('dp-state-status');
    if (statusEl) statusEl.textContent = `Fired: ${claudeState}`;
  }

  function fireSingleState(terminalId, claudeState) {
    const payload = {};
    payload[terminalId] = {
      isClaude: true,
      state: claudeState,
      location: { name: '/dev/simulated' },
      claudeSessionId: 'dev-session-001',
      claudeSessionName: 'Dev Session',
    };
    dbg().updateClaudeStates(payload);
  }

  const CYCLE_STATES = ['working', 'permission', 'working', 'question', 'working', 'idle'];
  let cycleIndex = 0;

  function startCycleStates() {
    stopCycleStates();
    cycleIndex = 0;
    fireCycleStep();
    claudeStateInterval = setInterval(fireCycleStep, 5000);
    const statusEl = document.getElementById('dp-state-status');
    if (statusEl) statusEl.textContent = 'Cycling states...';
  }

  function fireCycleStep() {
    const state = CYCLE_STATES[cycleIndex % CYCLE_STATES.length];
    fireStateOnDummies(state);
    cycleIndex++;
  }

  function stopCycleStates() {
    if (claudeStateInterval) {
      clearInterval(claudeStateInterval);
      claudeStateInterval = null;
    }
    const statusEl = document.getElementById('dp-state-status');
    if (statusEl) statusEl.textContent = 'Stopped';
  }

  // ── Toast Notifications ──

  function showFakeToast(claudeState) {
    const dummies = getDummyPanes().filter(p => p.type === 'terminal');
    const termId = dummies.length > 0 ? dummies[0].id : 'dev-toast-' + Date.now();

    const configs = {
      permission: { title: 'Needs permission', icon: '\uD83D\uDD11', priority: 'high' },
      question:   { title: 'Needs input',      icon: '\u2753',       priority: 'high' },
      idle:       { title: 'Task complete',     icon: '\u2705',       priority: 'medium' },
    };

    const cfg = configs[claudeState] || configs.idle;
    dbg().showToast(
      termId,
      cfg.title,
      DUMMY_AGENT_NAME,
      '/dev/simulated',
      cfg.icon,
      cfg.priority,
      claudeState,
      { location: { name: '/dev/simulated' } }
    );
  }

  function showCustomToastPrompt() {
    const title = prompt('Toast title:', 'Custom notification');
    if (!title) return;
    const state = prompt('Claude state (working/idle/permission/question):', 'working');
    if (!state) return;

    const termId = 'dev-custom-' + Date.now();
    dbg().showToast(termId, title, DUMMY_AGENT_NAME, '/dev/custom', '\uD83D\uDD14', 'medium', state);
  }

  // ── Init ──

  if (shouldActivate()) {
    // Wait for app to init
    const waitForDebug = setInterval(() => {
      if (window.TC2_DEBUG) {
        clearInterval(waitForDebug);
        createPanel();
        panelVisible = true;
        panelEl.style.display = 'block';
        console.log('[DevPanel] Activated. Press Ctrl+Shift+D to toggle.');
      }
    }, 200);
  }
})();
