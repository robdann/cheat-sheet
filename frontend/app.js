'use strict';

// ─── State ─────────────────────────────────────────────────────────────────────

let state = { songs: [], setlists: [], view: 'home', songId: null, setlistId: null, homeTab: 'songs' };
let _saveTimer = null;
let _saveStatus = 'saved';

function setSaveStatus(s) {
  _saveStatus = s;
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = s === 'saving' ? 'Saving…' : s === 'error' ? 'Save failed' : 'Saved';
  el.className = 'save-status ' + s;
}

function save() {
  localStorage.setItem('cs_v1', JSON.stringify(state));
  clearTimeout(_saveTimer);
  setSaveStatus('saving');
  _saveTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs: state.songs, setlists: state.setlists }),
      });
      setSaveStatus(r.ok ? 'saved' : 'error');
    } catch (_) { setSaveStatus('error'); }
  }, 400);
}

async function load() {
  try {
    const r = await fetch('/api/songs');
    if (r.ok) {
      const data = await r.json();
      // Handle old format (plain array) and new format ({songs, setlists})
      if (Array.isArray(data)) {
        if (data.length > 0) { state.songs = data; return; }
      } else if (data && Array.isArray(data.songs)) {
        state.songs = data.songs;
        state.setlists = data.setlists || [];
        return;
      }
    }
  } catch (_) {}
  try { const d = localStorage.getItem('cs_v1'); if (d) Object.assign(state, JSON.parse(d)); } catch (_) {}
}

function uid() { return Math.random().toString(36).slice(2, 9); }

function S()  { return state.songs.find(s => s.id === state.songId); }
function SL() { return state.setlists.find(sl => sl.id === state.setlistId); }
function getSection(sid) { return S().sections.find(s => s.id === sid); }
function getStep(aid)    { return S().arrangement.find(a => a.id === aid); }

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Song mutations ────────────────────────────────────────────────────────────

function goHome()     { state.view = 'home'; save(); render(); }

function copySetlistLink(id) {
  const url = `${location.origin}${location.pathname}#setlist/${id}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.btn-sm[onclick^="copySetlistLink"]');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Share', 1500); }
  });
}
function setView(v)   { state.view = v; save(); render(); }
function openSong(id)     { state.songId = id; state.view = 'perform'; save(); render(); }
function editSong(id)     { state.songId = id; state.view = 'edit'; save(); render(); }

function newSong() {
  const song = { id: uid(), title: 'Untitled', key: '', tempo: '', sections: [], arrangement: [] };
  state.songs.push(song);
  state.songId = song.id;
  state.view = 'edit';
  save(); render();
}

function deleteSong(id) {
  if (!confirm('Delete this song?')) return;
  state.songs = state.songs.filter(s => s.id !== id);
  state.setlists.forEach(sl => { sl.entries = sl.entries.filter(e => e.songId !== id); });
  if (state.songId === id) { state.songId = null; state.view = 'home'; }
  save(); render();
}

function updateSong(field, value) { S()[field] = value; save(); }

function setSongType(type) {
  S().type = S().type === type ? '' : type;
  save(); render();
}

function addSection() {
  S().sections.push({ id: uid(), name: '', abbr: '', lines: [''] });
  save(); renderSections();
}

function removeSection(sid) {
  const s = S();
  s.sections = s.sections.filter(sec => sec.id !== sid);
  s.arrangement = s.arrangement.filter(a => a.sectionId !== sid);
  save(); renderSections(); renderArrangement();
}

function updateSecName(sid, value) {
  const sec = getSection(sid);
  sec.name = value;
  if (!sec._abbrLocked) {
    const initials = value.match(/\b[A-Za-z]/g)?.map(c => c.toUpperCase()).join('') || '';
    sec.abbr = (initials || value.slice(0,2).toUpperCase()).slice(0,3);
  }
  save();
}

function updateSecAbbr(sid, value) {
  const sec = getSection(sid);
  sec.abbr = value.toUpperCase().slice(0, 3);
  sec._abbrLocked = true;
  save();
}

function addLine(sid) { getSection(sid).lines.push(''); save(); renderSections(); }

function removeLine(sid, idx) {
  const lines = getSection(sid).lines;
  if (lines.length > 1) { lines.splice(idx, 1); save(); renderSections(); }
}

function updateLine(sid, idx, value) { getSection(sid).lines[idx] = value; save(); }

function addStep(sectionId) {
  S().arrangement.push({ id: uid(), sectionId, dynamics: '', note: '', transitionNote: '' });
  save(); renderArrangement();
}

function removeStep(aid) {
  S().arrangement = S().arrangement.filter(a => a.id !== aid);
  save(); renderArrangement();
}

function moveStep(aid, dir) {
  const arr = S().arrangement;
  const i = arr.findIndex(a => a.id === aid);
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  save(); renderArrangement();
}

function setDynamics(aid, value) {
  const step = getStep(aid);
  step.dynamics = step.dynamics === value ? '' : value;
  save(); renderArrangement();
}

function updateStepNote(aid, value)   { getStep(aid).note = value; save(); }
function updateTransition(aid, value) { getStep(aid).transitionNote = value; save(); }

// ─── Setlist mutations ─────────────────────────────────────────────────────────

function newSetlist() {
  const sl = { id: uid(), name: 'New Set List', entries: [] };
  state.setlists.push(sl);
  state.setlistId = sl.id;
  state.view = 'setlist-edit';
  save(); render();
}

function openSetlist(id)     { state.setlistId = id; state.view = 'setlist-perform'; save(); render(); }
function editSetlist(id)     { state.setlistId = id; state.view = 'setlist-edit'; save(); render(); }

function deleteSetlist(id) {
  if (!confirm('Delete this set list?')) return;
  state.setlists = state.setlists.filter(sl => sl.id !== id);
  if (state.setlistId === id) { state.setlistId = null; state.view = 'home'; }
  save(); render();
}

function updateSetlistName(value) { SL().name = value; save(); }

function addSetlistEntry(songId) {
  const song = state.songs.find(s => s.id === songId);
  SL().entries.push({ id: uid(), songId, key: song?.key || '' });
  save(); renderSetlistEntries();
}

function removeSetlistEntry(eid) {
  SL().entries = SL().entries.filter(e => e.id !== eid);
  save(); renderSetlistEntries();
}

function moveSetlistEntry(eid, dir) {
  const entries = SL().entries;
  const i = entries.findIndex(e => e.id === eid);
  const j = i + dir;
  if (j < 0 || j >= entries.length) return;
  [entries[i], entries[j]] = [entries[j], entries[i]];
  save(); renderSetlistEntries();
}

function updateEntryKey(eid, value) {
  SL().entries.find(e => e.id === eid).key = value;
  save();
}

// ─── Random set list ───────────────────────────────────────────────────────────

function randomPick(songs, n) {
  const pool = [...songs];
  const picks = [];
  while (picks.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}

function generateRandomSetlist() {
  const byType = t => state.songs.filter(s => s.type === t);
  const allAge  = byType('All-Age');
  const praise  = byType('Praise');
  const worship = byType('Worship');

  const missing = [];
  if (allAge.length  < 1) missing.push('1 All-Age');
  if (praise.length  < 2) missing.push('2 Praise');
  if (worship.length < 2) missing.push('2 Worship');
  if (missing.length) {
    alert(`Not enough tagged songs. Still need: ${missing.join(', ')}.`);
    return;
  }

  const picks = [
    ...randomPick(allAge, 1),
    ...randomPick(praise, 2),
    ...randomPick(worship, 2),
  ];

  const sl = {
    id: uid(),
    name: 'Random Set',
    entries: picks.map(s => ({ id: uid(), songId: s.id, key: s.key || '' })),
  };
  state.setlists.push(sl);
  state.setlistId = sl.id;
  state.view = 'setlist-edit';
  save(); render();
}


// ─── Render helpers ────────────────────────────────────────────────────────────

const DYNAMICS_OPTS = ['FULL', 'DRUMS', 'DROP', 'BREAKDOWN', 'BUILD'];
const SONG_TYPES    = ['Praise', 'Worship', 'Moment', 'All-Age'];

function instanceNum(arrangement, idx) {
  const step = arrangement[idx];
  const total = arrangement.filter(a => a.sectionId === step.sectionId).length;
  if (total <= 1) return '';
  return arrangement.slice(0, idx + 1).filter(a => a.sectionId === step.sectionId).length;
}

// Renders a single song's perform block (used in both single and setlist perform views)
function renderSongBlock(song, overrideKey) {
  const arr = song.arrangement;
  const key = overrideKey || song.key;

  const seen = new Set();
  const usedSections = arr
    .map(a => song.sections.find(sec => sec.id === a.sectionId))
    .filter(sec => sec && !seen.has(sec.id) && seen.add(sec.id));

  const arrBoxes = arr.map((a, i) => {
    const sec = song.sections.find(sec => sec.id === a.sectionId) || {};
    const num = instanceNum(arr, i);
    const dyn = a.dynamics ? `<span class="p-dyn">${esc(a.dynamics.toLowerCase())}</span>` : '';
    const note = a.note ? `<span class="p-note">${esc(a.note)}</span>` : '';
    const trans = a.transitionNote && i < arr.length - 1
      ? `<div class="p-trans-row"><span class="p-trans-note">→ ${esc(a.transitionNote)}</span></div>`
      : '';
    return `
      <div class="p-arr-step">
        <div class="p-step-box">
          <span class="p-step-abbr">${esc(sec.abbr || '?')}${num}</span>
          ${dyn}${note}
        </div>
        ${trans}
      </div>`;
  }).join('');

  return `
    <div class="p-header">
      ${key ? `<span class="p-key">${esc(key)}</span><span class="p-sep">|</span>` : ''}
      <span class="p-title">${esc(song.title)}</span>
      ${song.tempo ? `<span class="p-tempo">♩=${esc(song.tempo)}</span>` : ''}
    </div>
    <div class="p-body">
      <div class="p-sections">
        ${usedSections.map(sec => `
          <div class="p-section">
            <span class="p-sec-abbr">${esc(sec.abbr)}</span>
            <div class="p-lines">
              ${sec.lines.map(line => `<div class="p-line">${esc(line)}</div>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="p-arr">${arrBoxes}</div>
    </div>`;
}

// ─── Home ──────────────────────────────────────────────────────────────────────

function setHomeTab(tab) { state.homeTab = tab; render(); }

function renderHome() {
  const tab = state.homeTab || 'songs';
  const songRows = [...state.songs].sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(s => `
    <li class="song-item ${s.type ? 'has-type type-' + s.type.toLowerCase().replace('-','') : ''}" onclick="openSong('${s.id}')">
      <div class="song-item-left">
        <span class="song-item-title">${esc(s.title)}</span>
      </div>
      <div class="song-item-actions">
        <button class="btn-icon" title="Edit" onclick="event.stopPropagation(); editSong('${s.id}')">✎</button>
        <button class="btn-icon" onclick="event.stopPropagation(); deleteSong('${s.id}')">×</button>
      </div>
    </li>`).join('');

  const setlistRows = state.setlists.map(sl => `
    <li class="song-item" onclick="openSetlist('${sl.id}')">
      <div class="song-item-left">
        <span class="song-item-title">${esc(sl.name)}</span>
        <span class="badge-count">${sl.entries.length} song${sl.entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="song-item-actions">
        <button class="btn-icon" title="Edit" onclick="event.stopPropagation(); editSetlist('${sl.id}')">✎</button>
        <button class="btn-icon" onclick="event.stopPropagation(); deleteSetlist('${sl.id}')">×</button>
      </div>
    </li>`).join('');

  return `
    <div class="home">
      <header class="home-header">
        <div class="home-wordmark">
          <div class="wm-icon"></div>
          <div class="wm-text">
            <span class="wm-title">Cheat Sheet</span>
            <span class="wm-sub">Praise · Worship</span>
          </div>
        </div>
      </header>

      <div class="home-tabs">
        <button class="home-tab ${tab === 'songs' ? 'active' : ''}" onclick="setHomeTab('songs')">Songs</button>
        <button class="home-tab ${tab === 'setlists' ? 'active' : ''}" onclick="setHomeTab('setlists')">Set Lists</button>
      </div>

      ${tab === 'songs' ? `
        <div class="home-tab-actions">
          <button class="btn-primary" onclick="newSong()">+ New Song</button>
        </div>
        ${state.songs.length === 0
          ? `<p class="empty-state">No songs yet.</p>`
          : `<ul class="song-list">${songRows}</ul>`}
      ` : `
        <div class="home-tab-actions">
          <button class="btn-sm" onclick="generateRandomSetlist()" title="1 All-Age · 2 Praise · 2 Worship">⚄ Random</button>
          <button class="btn-primary" onclick="newSetlist()">+ New Set List</button>
        </div>
        ${state.setlists.length === 0
          ? `<p class="empty-state">No set lists yet.</p>`
          : `<ul class="song-list">${setlistRows}</ul>`}
      `}
    </div>`;
}

// ─── View toggle helper ────────────────────────────────────────────────────────

function viewToggleHTML(active, editView, performView) {
  return `
    <div class="view-tabs">
      <button class="view-tab ${active === 'edit' ? 'active' : ''}" onclick="setView('${editView}')">Edit</button>
      <button class="view-tab ${active === 'perform' ? 'active' : ''}" onclick="setView('${performView}')">Perform</button>
    </div>`;
}

// ─── Song edit ─────────────────────────────────────────────────────────────────

function renderEditShell() {
  const s = S();
  return `
    <div class="edit-layout">
      <div class="topbar">
        <button class="btn-back" onclick="goHome()">← Home</button>
        <input class="input-title" value="${esc(s.title)}" placeholder="Song title"
               onblur="updateSong('title', this.value)"
               onkeydown="if(event.key==='Enter') this.blur()">
        <div class="type-picker">
          ${SONG_TYPES.map(t => `
            <button class="type-btn type-${t.toLowerCase().replace('-','')} ${s.type === t ? 'type-active' : ''}"
                    onclick="setSongType('${t}')">${t}</button>
          `).join('')}
        </div>
        <span id="save-status" class="save-status ${_saveStatus}">${_saveStatus === 'saving' ? 'Saving…' : _saveStatus === 'error' ? 'Save failed' : 'Saved'}</span>
      </div>
      ${viewToggleHTML('edit', 'edit', 'perform')}
      <div class="edit-body">
        <div class="panel" id="sections-panel">${renderSectionsHTML()}</div>
        <div class="panel" id="arrangement-panel">${renderArrangementHTML()}</div>
      </div>
    </div>`;
}

function renderSectionsHTML() {
  const s = S();
  return `
    <div class="panel-hdr">
      <h2>Sections</h2>
      <button class="btn-sm" onclick="addSection()">+ Add</button>
    </div>
    <div class="sections-list">
      ${s.sections.map(sec => `
        <div class="sec-card">
          <div class="sec-card-hdr">
            <input class="input-abbr" value="${esc(sec.abbr)}" placeholder="Ab" maxlength="3"
                   title="Abbreviation"
                   onblur="updateSecAbbr('${sec.id}', this.value)">
            <input class="input-secname" value="${esc(sec.name)}" placeholder="Section name"
                   onblur="updateSecName('${sec.id}', this.value)"
                   onkeydown="if(event.key==='Enter') this.blur()">
            <div class="sec-card-actions">
              <button class="btn-sm" onclick="addStep('${sec.id}')" title="Append to arrangement">+arr</button>
              <button class="btn-icon" onclick="removeSection('${sec.id}')">×</button>
            </div>
          </div>
          <div class="sec-lines">
            ${sec.lines.map((line, i) => `
              <div class="line-row">
                <input class="input-line" value="${esc(line)}" placeholder="1  5  6  4"
                       onblur="updateLine('${sec.id}', ${i}, this.value)">
                ${sec.lines.length > 1
                  ? `<button class="btn-icon-sm" onclick="removeLine('${sec.id}', ${i})">×</button>`
                  : ''}
              </div>
            `).join('')}
            <button class="btn-addline" onclick="addLine('${sec.id}')">+ line</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function renderArrangementHTML() {
  const s = S();
  const arr = s.arrangement;

  const addRow = s.sections.length > 0 ? `
    <div class="add-step-row">
      <span class="add-label">Add →</span>
      ${s.sections.map(sec => `
        <button class="btn-sec-add" onclick="addStep('${sec.id}')">${esc(sec.abbr || sec.name || '?')}</button>
      `).join('')}
    </div>` : '';

  if (arr.length === 0) {
    return `
      <div class="panel-hdr"><h2>Arrangement</h2></div>
      <p class="empty-state">Build sections on the left, then add them here.</p>
      ${addRow}`;
  }

  return `
    <div class="panel-hdr"><h2>Arrangement</h2></div>
    <div class="arr-list">
      ${arr.map((a, i) => {
        const sec = getSection(a.sectionId) || {};
        const num = instanceNum(arr, i);
        const isLast = i === arr.length - 1;
        return `
          <div class="arr-step">
            <div class="arr-step-main">
              <span class="arr-abbr-badge">${esc(sec.abbr || '?')}${num}</span>
              <span class="arr-secname">${esc(sec.name || '?')}</span>
              <div class="dyn-row">
                ${DYNAMICS_OPTS.map(d => `
                  <button class="dyn-btn ${a.dynamics === d ? 'dyn-active' : ''}"
                          onclick="setDynamics('${a.id}', '${d}')">${d}</button>
                `).join('')}
              </div>
              <input class="input-step-note" value="${esc(a.note)}" placeholder="note…"
                     title="Optional annotation (e.g. x2, hold, solo)"
                     onblur="updateStepNote('${a.id}', this.value)">
              <div class="step-ctrl">
                <button class="btn-icon-sm" onclick="moveStep('${a.id}',-1)" ${i===0?'disabled':''}>↑</button>
                <button class="btn-icon-sm" onclick="moveStep('${a.id}',1)"  ${isLast?'disabled':''}>↓</button>
                <button class="btn-icon"    onclick="removeStep('${a.id}')">×</button>
              </div>
            </div>
            ${!isLast ? `
              <div class="transition-row">
                <span class="trans-arrow">↓</span>
                <input class="input-trans" value="${esc(a.transitionNote)}" placeholder="landing note →next"
                       title="Note to play transitioning into the next section"
                       onblur="updateTransition('${a.id}', this.value)">
              </div>` : ''}
          </div>`;
      }).join('')}
    </div>
    ${addRow}`;
}

// ─── Song perform ──────────────────────────────────────────────────────────────

function renderPerformView() {
  return `
    <div class="perform-layout">
      <div class="topbar topbar-perform">
        <button class="btn-back" onclick="goHome()">← Home</button>
        <button class="btn-sm" onclick="window.print()">Print</button>
      </div>
      ${viewToggleHTML('perform', 'edit', 'perform')}
      <div class="perform-sheet" id="print-area">
        ${renderSongBlock(S(), null)}
      </div>
    </div>`;
}

// ─── Setlist edit ──────────────────────────────────────────────────────────────

function renderSetlistEditShell() {
  const sl = SL();
  return `
    <div class="edit-layout">
      <div class="topbar">
        <button class="btn-back" onclick="goHome()">← Home</button>
        <input class="input-title" value="${esc(sl.name)}" placeholder="Set list name"
               onblur="updateSetlistName(this.value)"
               onkeydown="if(event.key==='Enter') this.blur()">
        <span id="save-status" class="save-status ${_saveStatus}">${_saveStatus === 'saving' ? 'Saving…' : _saveStatus === 'error' ? 'Save failed' : 'Saved'}</span>
      </div>
      ${viewToggleHTML('edit', 'setlist-edit', 'setlist-perform')}
      <div class="setlist-edit-body" id="setlist-entries-panel">
        ${renderSetlistEntriesHTML()}
      </div>
    </div>`;
}

function renderSetlistEntriesHTML() {
  const sl = SL();
  const available = state.songs.filter(s => s.title || s.sections.length);

  // Group available songs by type for the picker
  const groups = [...SONG_TYPES, ''].map(type => ({
    type,
    label: type || 'Untagged',
    songs: available.filter(s => (s.type || '') === type),
  })).filter(g => g.songs.length > 0);

  return `
    <div class="sl-entries">
      ${sl.entries.length === 0
        ? `<p class="empty-state">No songs added yet — pick from the list below.</p>`
        : sl.entries.map((entry, i) => {
            const song = state.songs.find(s => s.id === entry.songId);
            if (!song) return '';
            const isLast = i === sl.entries.length - 1;
            const typeClass = song.type ? `type-${song.type.toLowerCase().replace('-','')}` : '';
            return `
              <div class="sl-entry ${typeClass}">
                <span class="sl-num">${i + 1}</span>
                <input class="input-meta sl-key" value="${esc(entry.key)}" placeholder="Key"
                       title="Key for this song in the set"
                       onblur="updateEntryKey('${entry.id}', this.value)">
                <span class="sl-song-title">${esc(song.title)}</span>
                <div class="step-ctrl">
                  <button class="btn-icon-sm" onclick="moveSetlistEntry('${entry.id}',-1)" ${i===0?'disabled':''}>↑</button>
                  <button class="btn-icon-sm" onclick="moveSetlistEntry('${entry.id}',1)"  ${isLast?'disabled':''}>↓</button>
                  <button class="btn-icon"    onclick="removeSetlistEntry('${entry.id}')">×</button>
                </div>
              </div>`;
          }).join('')
      }
    </div>
    <div class="sl-picker">
      ${groups.map(g => `
        <div class="sl-picker-group">
          <span class="sl-picker-label ${g.type ? `type-${g.type.toLowerCase().replace('-','')}` : ''}">${esc(g.label)}</span>
          <div class="sl-picker-songs">
            ${g.songs.map(s => `
              <button class="btn-sec-add" onclick="addSetlistEntry('${s.id}')">
                ${s.key ? `<span style="opacity:.6;font-size:.7em">${esc(s.key)} </span>` : ''}${esc(s.title || 'Untitled')}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ─── Setlist perform ───────────────────────────────────────────────────────────

function renderSetlistPerformView() {
  const sl = SL();
  const blocks = sl.entries.map((entry, i) => {
    const song = state.songs.find(s => s.id === entry.songId);
    if (!song) return '';
    return `
      <div class="sl-song-block ${i > 0 ? 'sl-song-block-sep' : ''}">
        <div class="sl-song-num">${i + 1}</div>
        ${renderSongBlock(song, entry.key)}
      </div>`;
  }).join('');

  return `
    <div class="perform-layout">
      <div class="topbar topbar-perform">
        <button class="btn-back" onclick="goHome()">← Home</button>
        <span class="sl-perform-title">${esc(sl.name)}</span>
        <button class="btn-sm" onclick="copySetlistLink('${sl.id}')">Share</button>
        <button class="btn-sm" onclick="window.print()">Print</button>
      </div>
      ${viewToggleHTML('perform', 'setlist-edit', 'setlist-perform')}
      <div class="perform-sheet" id="print-area">
        ${blocks || '<p class="empty-state">No songs in this set list.</p>'}
      </div>
    </div>`;
}

// ─── Partial re-renders ────────────────────────────────────────────────────────

function renderSections() {
  const el = document.getElementById('sections-panel');
  if (el) el.innerHTML = renderSectionsHTML();
}

function renderArrangement() {
  const el = document.getElementById('arrangement-panel');
  if (el) el.innerHTML = renderArrangementHTML();
}

function renderSetlistEntries() {
  const el = document.getElementById('setlist-entries-panel');
  if (el) el.innerHTML = renderSetlistEntriesHTML();
}

// ─── Main render ───────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  if      (state.view === 'home')            app.innerHTML = renderHome();
  else if (state.view === 'edit')            app.innerHTML = renderEditShell();
  else if (state.view === 'perform')         app.innerHTML = renderPerformView();
  else if (state.view === 'setlist-edit')    app.innerHTML = renderSetlistEditShell();
  else if (state.view === 'setlist-perform') app.innerHTML = renderSetlistPerformView();
  syncHash();
}

// ─── Routing ───────────────────────────────────────────────────────────────────

function syncHash() {
  const h = buildHash();
  if (location.hash !== h) history.replaceState(null, '', h || '#');
}

function buildHash() {
  if (state.view === 'setlist-perform') return `#setlist/${state.setlistId}`;
  if (state.view === 'setlist-edit')    return `#setlist/${state.setlistId}/edit`;
  if (state.view === 'perform')         return `#song/${state.songId}`;
  if (state.view === 'edit')            return `#song/${state.songId}/edit`;
  return '';
}

function applyHash() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return;
  const [type, id, sub] = hash.split('/');
  if (type === 'setlist' && id) {
    state.setlistId = id;
    state.view = sub === 'edit' ? 'setlist-edit' : 'setlist-perform';
  } else if (type === 'song' && id) {
    state.songId = id;
    state.view = sub === 'edit' ? 'edit' : 'perform';
  }
}

window.addEventListener('popstate', () => { applyHash(); render(); });

// ─── Init ─────────────────────────────────────────────────────────────────────

load().then(() => { applyHash(); render(); });
