// ─── Git Graph Renderer ───────────────────────────────────────────────────
// Renders git commit history as an SVG graph with lane assignment.

import { escapeHtml } from './utils.js';
import { ICON_GIT_GRAPH } from './constants.js';

let _ctx = null;

export function initGitGraphDeps(ctx) { _ctx = ctx; }

// ── SVG Graph Constants ──
const GG = {
  ROW_H: 28, LANE_W: 16, NODE_R: 4, LEFT_PAD: 12,
  COLORS: ['#85e89d','#79b8ff','#b392f0','#ffab70','#f97583','#4ec9b0','#d1bcf9','#ffd33d'],
};

export function renderGitGraphPane(paneData) {
  const existingPane = document.getElementById(`pane-${paneData.id}`);
  if (existingPane) existingPane.remove();

  const pane = document.createElement('div');
  pane.className = 'pane git-graph-pane';
  pane.id = `pane-${paneData.id}`;
  pane.style.left = `${paneData.x}px`;
  pane.style.top = `${paneData.y}px`;
  pane.style.width = `${paneData.width}px`;
  pane.style.height = `${paneData.height}px`;
  pane.style.zIndex = paneData.zIndex;
  pane.dataset.paneId = paneData.id;

  if (!paneData.shortcutNumber) paneData.shortcutNumber = _ctx.getNextShortcutNumber();
  const deviceTag = paneData.device ? _ctx.deviceLabelHtml(paneData.device) : '';

  pane.innerHTML = `
    <div class="pane-header">
      <span class="pane-title git-graph-title">
        ${deviceTag}<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align: middle; margin-right: 4px;">${ICON_GIT_GRAPH}</svg>
        ${paneData.repoName || 'Git Graph'}
      </span>
      ${_ctx.paneNameHtml(paneData)}
      <div class="pane-header-right">
        ${_ctx.shortcutBadgeHtml(paneData)}
        <div class="pane-zoom-controls">
          <button class="pane-zoom-btn zoom-out" data-tooltip="Zoom out">\u2212</button>
          <button class="pane-zoom-btn zoom-in" data-tooltip="Zoom in">+</button>
        </div>
        <button class="pane-expand" aria-label="Expand pane" data-tooltip="Expand">\u26F6</button>
        <button class="pane-close" aria-label="Close pane"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>
    <div class="pane-content">
      <div class="git-graph-container">
        <div class="git-graph-header">
          <span class="git-graph-branch"></span>
          <span class="git-graph-status"></span>
          <button class="git-graph-mode-btn" data-tooltip="Toggle SVG/ASCII mode">${paneData.graphMode === 'ascii' ? 'SVG' : 'ASCII'}</button>
          <button class="git-graph-push-btn" data-tooltip="Push to remote"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push</button>
        </div>
        <div class="git-graph-output"><span class="git-graph-loading">Loading git graph...</span></div>
      </div>
    </div>
    <div class="pane-resize-handle"></div>
  `;

  _ctx.setupPaneListeners(pane, paneData);
  setupGitGraphListeners(pane, paneData);
  _ctx.getCanvas().appendChild(pane);

  fetchGitGraphData(pane, paneData);
}

function setupGitGraphListeners(paneEl, paneData) {
  const graphOutput = paneEl.querySelector('.git-graph-output');
  const pushBtn = paneEl.querySelector('.git-graph-push-btn');
  const modeBtn = paneEl.querySelector('.git-graph-mode-btn');

  if (!paneData.graphMode) paneData.graphMode = 'svg';

  modeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    paneData.graphMode = paneData.graphMode === 'svg' ? 'ascii' : 'svg';
    modeBtn.textContent = paneData.graphMode === 'ascii' ? 'SVG' : 'ASCII';
    _ctx.cloudSaveLayout(paneData);
    fetchGitGraphData(paneEl, paneData);
  });

  pushBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    pushBtn.disabled = true;
    pushBtn.textContent = 'Pushing\u2026';
    pushBtn.classList.add('pushing');
    try {
      await _ctx.agentRequest('POST', `/api/git-graphs/${paneData.id}/push`, null, paneData.agentId);
      pushBtn.textContent = 'Pushed!';
      pushBtn.classList.add('push-success');
      fetchGitGraphData(paneEl, paneData);
    } catch (err) {
      pushBtn.textContent = 'Failed';
      pushBtn.classList.add('push-failed');
      console.error('[App] Git push error:', err);
    }
    setTimeout(() => {
      pushBtn.disabled = false;
      pushBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: middle; margin-right: 3px;"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>Push';
      pushBtn.classList.remove('pushing', 'push-success', 'push-failed');
    }, 2000);
  });

  graphOutput.addEventListener('mousedown', (e) => e.stopPropagation());
  graphOutput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  graphOutput.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  const refreshInterval = setInterval(() => fetchGitGraphData(paneEl, paneData), 5000);
  _ctx.gitGraphPanes.set(paneData.id, { refreshInterval });
}

export function assignLanes(commits) {
  const hashIndex = new Map();
  commits.forEach((c, i) => hashIndex.set(c.hash, i));

  const lanes = new Map();
  const activeLanes = [];
  let maxLane = 0;
  const branchColors = new Map();
  let nextColor = 1;

  let masterHash = null;
  for (const c of commits) {
    if (c.refs && (/HEAD -> main\b/.test(c.refs) || /HEAD -> master\b/.test(c.refs))) {
      masterHash = c.hash;
      break;
    }
  }

  for (const commit of commits) {
    let lane = -1;
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === commit.hash) { lane = i; break; }
    }
    if (lane === -1) {
      for (let i = 0; i < activeLanes.length; i++) {
        if (activeLanes[i] === null) { lane = i; break; }
      }
      if (lane === -1) { lane = activeLanes.length; activeLanes.push(null); }
    }

    lanes.set(commit.hash, lane);
    if (lane > maxLane) maxLane = lane;

    if (!branchColors.has(lane)) {
      if (commit.hash === masterHash) { branchColors.set(lane, 0); }
      else { branchColors.set(lane, nextColor); nextColor = (nextColor + 1) % GG.COLORS.length; if (nextColor === 0) nextColor = 1; }
    }

    activeLanes[lane] = null;

    if (commit.parents.length > 0) {
      const firstParent = commit.parents[0];
      if (hashIndex.has(firstParent) && !lanes.has(firstParent)) {
        const existingLane = activeLanes.indexOf(firstParent);
        if (existingLane === -1) activeLanes[lane] = firstParent;
      }
      for (let p = 1; p < commit.parents.length; p++) {
        const parentHash = commit.parents[p];
        if (!hashIndex.has(parentHash) || lanes.has(parentHash)) continue;
        const existing = activeLanes.indexOf(parentHash);
        if (existing !== -1) continue;
        let mergeLane = -1;
        for (let i = 0; i < activeLanes.length; i++) { if (activeLanes[i] === null) { mergeLane = i; break; } }
        if (mergeLane === -1) { mergeLane = activeLanes.length; activeLanes.push(null); }
        activeLanes[mergeLane] = parentHash;
        if (mergeLane > maxLane) maxLane = mergeLane;
        if (!branchColors.has(mergeLane)) { branchColors.set(mergeLane, nextColor); nextColor = (nextColor + 1) % GG.COLORS.length; if (nextColor === 0) nextColor = 1; }
      }
    }
  }

  return { lanes, maxLane, branchColors };
}

export function gitRelativeTime(ts) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return '1m';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function renderSvgGitGraph(outputEl, commits, currentBranch) {
  if (!commits || commits.length === 0) {
    outputEl.innerHTML = '<span class="git-graph-loading">No commits found</span>';
    return;
  }

  const { lanes, maxLane, branchColors } = assignLanes(commits);
  const svgWidth = GG.LEFT_PAD + (maxLane + 1) * GG.LANE_W + 8;
  const totalHeight = commits.length * GG.ROW_H;

  const paths = [];
  const nodes = [];
  const hashIndex = new Map();
  commits.forEach((c, i) => hashIndex.set(c.hash, i));

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const lane = lanes.get(commit.hash);
    const colorIdx = branchColors.get(lane) ?? 1;
    const color = GG.COLORS[colorIdx];
    const cx = GG.LEFT_PAD + lane * GG.LANE_W;
    const cy = i * GG.ROW_H + GG.ROW_H / 2;

    nodes.push({ cx, cy, color, hash: commit.hash });

    for (const parentHash of commit.parents) {
      const pi = hashIndex.get(parentHash);
      if (pi === undefined) continue;
      const parentLane = lanes.get(parentHash);
      if (parentLane === undefined) continue;
      const parentColorIdx = branchColors.get(parentLane) ?? 1;
      const px = GG.LEFT_PAD + parentLane * GG.LANE_W;
      const py = pi * GG.ROW_H + GG.ROW_H / 2;

      let d;
      if (lane === parentLane) {
        d = `M${cx} ${cy} L${px} ${py}`;
      } else {
        const midY = cy + GG.ROW_H * 0.8;
        d = `M${cx} ${cy} C${cx} ${midY}, ${px} ${py - GG.ROW_H * 0.8}, ${px} ${py}`;
      }
      const lineColor = lane !== parentLane ? GG.COLORS[parentColorIdx] : color;
      paths.push({ d, color: lineColor });
    }
  }

  const svgPaths = paths.map(p => `<path d="${p.d}" stroke="${p.color}" stroke-width="2" fill="none" stroke-opacity="0.7"/>`).join('');
  const svgNodes = nodes.map(n => `<circle cx="${n.cx}" cy="${n.cy}" r="${GG.NODE_R}" fill="${n.color}" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>`).join('');

  const rowsHtml = commits.map((commit, i) => {
    const lane = lanes.get(commit.hash);
    const colorIdx = branchColors.get(lane) ?? 1;
    const color = GG.COLORS[colorIdx];
    const timeStr = commit.timestamp ? gitRelativeTime(commit.timestamp) : '';

    let refsHtml = '';
    if (commit.refs) {
      const refParts = commit.refs.split(',').map(r => r.trim()).filter(Boolean);
      for (const ref of refParts) {
        if (ref.startsWith('HEAD -> ')) {
          refsHtml += `<span class="gg-ref gg-ref-head">${escapeHtml(ref.replace('HEAD -> ', ''))}</span>`;
        } else if (ref.startsWith('tag: ')) {
          refsHtml += `<span class="gg-ref gg-ref-tag">${escapeHtml(ref.replace('tag: ', ''))}</span>`;
        } else if (ref.startsWith('origin/')) {
          refsHtml += `<span class="gg-ref gg-ref-remote">${escapeHtml(ref)}</span>`;
        } else {
          refsHtml += `<span class="gg-ref gg-ref-branch">${escapeHtml(ref)}</span>`;
        }
      }
    }

    return `<div class="gg-row" data-hash="${commit.hash}" style="height:${GG.ROW_H}px">
      <div class="gg-graph-spacer" style="width:${svgWidth}px"></div>
      <div class="gg-info">
        <span class="gg-hash" style="color:${color}">${commit.hash}</span>
        <span class="gg-time">${timeStr}</span>
        ${refsHtml}
        <span class="gg-subject">${escapeHtml(commit.subject || '')}</span>
        <span class="gg-author">${escapeHtml(commit.author || '')}</span>
      </div>
    </div>`;
  }).join('');

  outputEl.innerHTML = `
    <div class="gg-scroll-container">
      <svg class="gg-svg" width="${svgWidth}" height="${totalHeight}"
           viewBox="0 0 ${svgWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        ${svgPaths}
        ${svgNodes}
      </svg>
      <div class="gg-rows">${rowsHtml}</div>
    </div>`;
}

export function renderAsciiGitGraph(outputEl, asciiGraph, commits) {
  if (!asciiGraph) {
    outputEl.innerHTML = '<span class="git-graph-loading">No graph data</span>';
    return;
  }

  // Build lookup from hash -> commit for enrichment
  const commitMap = new Map();
  if (commits) commits.forEach(c => commitMap.set(c.hash, c));

  // Determine lane colors: use assignLanes if commits available
  let laneColors = null;
  if (commits && commits.length > 0) {
    const { lanes, branchColors } = assignLanes(commits);
    laneColors = { lanes, branchColors };
  }

  const lines = asciiGraph.split('\n').filter(l => l.length > 0);

  const rowsHtml = lines.map(line => {
    // git log --graph --oneline produces: "graph_part hash (refs) subject"
    // Split into graph portion and text portion at the first hash match
    const hashMatch = line.match(/^([*|/\\ _.\-\s]+?)([a-f0-9]{7,})\s/);

    if (!hashMatch) {
      // Connector-only line (no commit on this line)
      const graphPart = escapeHtml(line);
      const colored = colorizeGraphChars(graphPart, laneColors, null);
      return `<div class="gg-row gg-ascii-row" style="height:${GG.ROW_H}px"><span class="gg-ascii-graph">${colored}</span></div>`;
    }

    const graphPart = hashMatch[1];
    const hash = hashMatch[2];
    const rest = line.slice(hashMatch[0].length - 1).slice(hash.length).trim();
    const commit = commitMap.get(hash);

    // Colorize graph characters
    const coloredGraph = colorizeGraphChars(escapeHtml(graphPart), laneColors, hash);

    // Get lane color for the hash
    let hashColor = '#79b8ff';
    if (laneColors && commit) {
      const lane = laneColors.lanes.get(hash);
      if (lane !== undefined) {
        const colorIdx = laneColors.branchColors.get(lane) ?? 1;
        hashColor = GG.COLORS[colorIdx];
      }
    }

    // Time
    const timeStr = commit?.timestamp ? gitRelativeTime(commit.timestamp) : '';

    // Refs from commit data (more reliable than parsing the oneline)
    let refsHtml = '';
    const refSrc = commit?.refs || '';
    if (refSrc) {
      const refParts = refSrc.split(',').map(r => r.trim()).filter(Boolean);
      for (const ref of refParts) {
        if (ref.startsWith('HEAD -> ')) {
          refsHtml += `<span class="gg-ref gg-ref-head">${escapeHtml(ref.replace('HEAD -> ', ''))}</span>`;
        } else if (ref.startsWith('tag: ')) {
          refsHtml += `<span class="gg-ref gg-ref-tag">${escapeHtml(ref.replace('tag: ', ''))}</span>`;
        } else if (ref.startsWith('origin/')) {
          refsHtml += `<span class="gg-ref gg-ref-remote">${escapeHtml(ref)}</span>`;
        } else {
          refsHtml += `<span class="gg-ref gg-ref-branch">${escapeHtml(ref)}</span>`;
        }
      }
    }

    // Subject: strip the (refs) decoration from git's oneline output
    const subject = commit?.subject || rest.replace(/\([^)]*\)\s*/, '').trim();

    // Author
    const authorHtml = commit?.author ? `<span class="gg-author">${escapeHtml(commit.author)}</span>` : '';

    return `<div class="gg-row gg-ascii-row" style="height:${GG.ROW_H}px">
      <span class="gg-ascii-graph">${coloredGraph}</span>
      <span class="gg-info">
        <span class="gg-hash" style="color:${hashColor}">${hash}</span>
        <span class="gg-time">${timeStr}</span>
        ${refsHtml}
        <span class="gg-subject">${escapeHtml(subject)}</span>
        ${authorHtml}
      </span>
    </div>`;
  }).join('');

  outputEl.innerHTML = `<div class="gg-scroll-container gg-ascii-container">${rowsHtml}</div>`;
}

// Colorize ASCII graph chars (* | / \) using lane colors
function colorizeGraphChars(graphStr, laneColors, commitHash) {
  // Color the graph symbols: * gets commit color, | / \ get lane position colors
  const graphChars = ['*', '|', '/', '\\', '_'];
  let result = '';
  let col = 0;
  for (let i = 0; i < graphStr.length; i++) {
    const ch = graphStr[i];
    if (graphChars.includes(ch)) {
      // Estimate lane from column position
      const laneIdx = Math.floor(col / 2);
      let color = GG.COLORS[laneIdx % GG.COLORS.length];

      // If we have lane data and this is the commit node, use the actual lane color
      if (ch === '*' && commitHash && laneColors) {
        const lane = laneColors.lanes.get(commitHash);
        if (lane !== undefined) {
          const colorIdx = laneColors.branchColors.get(lane) ?? 1;
          color = GG.COLORS[colorIdx];
        }
      }

      result += `<span style="color:${color}">${ch}</span>`;
    } else {
      result += ch;
    }
    col++;
  }
  return result;
}

export async function fetchGitGraphData(paneEl, paneData) {
  try {
    const outputEl = paneEl.querySelector('.git-graph-output');
    const maxCommits = 200;
    const modeParam = paneData.graphMode === 'ascii' ? '&mode=ascii' : '';
    const data = await _ctx.agentRequest('GET', `/api/git-graphs/${paneData.id}/data?maxCommits=${maxCommits}${modeParam}`, null, paneData.agentId);

    const branchEl = paneEl.querySelector('.git-graph-branch');
    const statusEl = paneEl.querySelector('.git-graph-status');

    if (data.error) {
      outputEl.innerHTML = `<span class="git-graph-error">Error: ${data.error}</span>`;
      return;
    }

    branchEl.innerHTML = `<span class="git-graph-branch-name">${escapeHtml(data.branch)}</span>`;

    if (data.clean) {
      statusEl.innerHTML = '<span class="git-graph-clean">&#x25cf; clean</span>';
    } else {
      const u = data.uncommitted;
      const details = [];
      if (u.staged > 0) details.push(`<span class="git-detail-staged">\u2713${u.staged}</span>`);
      if (u.unstaged > 0) details.push(`<span class="git-detail-modified">\u270E${u.unstaged}</span>`);
      if (u.untracked > 0) details.push(`<span class="git-detail-new">+${u.untracked}</span>`);
      const detailHtml = details.length ? `<span class="git-graph-detail">${details.join(' ')}</span>` : '';
      statusEl.innerHTML = `<span class="git-graph-dirty">&#x25cf; ${u.total} uncommitted</span>${detailHtml}`;
    }

    // Preserve scroll position across re-renders
    const scrollEl = outputEl.querySelector('.gg-scroll-container');
    const prevScrollTop = scrollEl ? scrollEl.scrollTop : 0;

    if (data.commits) {
      if (paneData.graphMode === 'ascii' && data.asciiGraph) {
        renderAsciiGitGraph(outputEl, data.asciiGraph, data.commits);
      } else {
        renderSvgGitGraph(outputEl, data.commits, data.branch);
      }
    } else if (data.graphHtml) {
      outputEl.innerHTML = `<pre style="margin:0;padding:8px 10px;white-space:pre;font-family:inherit;font-size:inherit;color:inherit;">${data.graphHtml}</pre>`;
    }

    // Restore scroll position
    if (prevScrollTop > 0) {
      const newScrollEl = outputEl.querySelector('.gg-scroll-container');
      if (newScrollEl) newScrollEl.scrollTop = prevScrollTop;
    }
  } catch (e) {
    console.error('[App] Failed to fetch git graph data:', e);
  }
}
