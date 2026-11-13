const MS_PER_DAY = 86400000;

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysBetween(a, b) {
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bMid - aMid) / MS_PER_DAY);
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function computeCurrentWeek(settings, now) {
  const start = parseDate(settings.startDate);
  const shiftedStart = addDays(start, settings.scheduleShiftDays || 0);
  const diffDays = daysBetween(shiftedStart, now);
  const weeksElapsed = Math.floor(diffDays / 7);
  return Math.max(settings.startWeek, settings.startWeek + weeksElapsed);
}

function weekStartDate(settings, weekNumber) {
  const start = parseDate(settings.startDate);
  const shiftedStart = addDays(start, settings.scheduleShiftDays || 0);
  return addDays(shiftedStart, (weekNumber - settings.startWeek) * 7);
}

let CONTENT = null;
let viewingWeek = null; // week currently shown on Today screen (may differ from actual current week)

function findPhaseForWeek(week) {
  return CONTENT.phases.find(p => week >= p.weekStart && week <= p.weekEnd) || null;
}

function findBlockForWeek(phase, week) {
  if (!phase || !phase.blocks) return null;
  return phase.blocks.find(b => week >= b.weekStart && week <= b.weekEnd) || null;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  }
  (children || []).forEach(c => {
    if (c) node.appendChild(c);
  });
  return node;
}

function renderApp() {
  const state = Store.get();
  const now = new Date();
  const actualWeek = computeCurrentWeek(state.settings, now);
  if (viewingWeek === null) viewingWeek = actualWeek;

  const screen = document.getElementById('screen');
  screen.innerHTML = '';

  const tab = document.body.dataset.tab || 'today';
  if (tab === 'today') screen.appendChild(renderToday(state, actualWeek));
  else if (tab === 'plan') screen.appendChild(renderPlan(state));
  else screen.appendChild(renderPlaceholder(tab));

  document.querySelectorAll('.tab-bar button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

function renderPlaceholder(tab) {
  const names = { cheatsheet: 'Cheat sheet', family: 'Family', progress: 'Progress' };
  return el('div', { class: 'placeholder' }, [
    el('p', { text: `${names[tab] || tab} — coming in step 3.` })
  ]);
}

function renderToday(state, actualWeek) {
  const week = viewingWeek;
  const phase = findPhaseForWeek(week);
  const block = findBlockForWeek(phase, week);
  const weekData = state.weeks[week] || { slots: {}, familyTaskDone: false, note: '' };

  const container = el('div', { class: 'screen-today' });

  const header = el('div', { class: 'week-header' }, [
    el('div', { class: 'week-nav' }, [
      el('button', { class: 'nav-btn', 'aria-label': 'Previous week', onclick: () => { viewingWeek = Math.max(1, viewingWeek - 1); renderApp(); } }, [document.createTextNode('‹')]),
      el('div', { class: 'week-title' }, [
        el('h1', { text: `Week ${week}` }),
        el('p', { class: 'phase-label', text: phase ? phase.title : 'Outside the plan' })
      ]),
      el('button', { class: 'nav-btn', 'aria-label': 'Next week', onclick: () => { viewingWeek = viewingWeek + 1; renderApp(); } }, [document.createTextNode('›')])
    ])
  ]);
  if (week !== actualWeek) {
    header.appendChild(el('button', { class: 'link-btn', text: `Back to current week (${actualWeek})`, onclick: () => { viewingWeek = actualWeek; renderApp(); } }));
  }

  const container2 = el('div', {});
  container2.appendChild(header);

  if (block) {
    const focusCard = el('div', { class: 'card' });
    if (block.grammar) focusCard.appendChild(el('p', {}, [el('strong', { text: 'Grammar: ' }), document.createTextNode(block.grammar)]));
    if (block.vocabulary) focusCard.appendChild(el('p', {}, [el('strong', { text: 'Vocabulary: ' }), document.createTextNode(block.vocabulary)]));
    if (block.conversationFocus) focusCard.appendChild(el('p', {}, [el('strong', { text: 'Conversation: ' }), document.createTextNode(block.conversationFocus)]));
    if (block.familyTask) focusCard.appendChild(el('p', { class: 'family-task' }, [el('strong', { text: 'Family task: ' }), document.createTextNode(block.familyTask)]));
    container2.appendChild(focusCard);
  } else if (phase) {
    const focusCard = el('div', { class: 'card' });
    focusCard.appendChild(el('p', { text: phase.goal }));
    if (phase.grammarNote) focusCard.appendChild(el('p', { class: 'muted', text: phase.grammarNote }));
    container2.appendChild(focusCard);
  } else {
    container2.appendChild(el('div', { class: 'card' }, [el('p', { text: 'This week is outside the 52-week plan.' })]));
  }

  if (phase && week === actualWeek) {
    const slotsCard = el('div', { class: 'card slots' });
    CONTENT.weeklySlots.forEach(slot => {
      const count = (weekData.slots && weekData.slots[slot.id]) || 0;
      const target = slot.targetPerWeek;
      const row = el('div', { class: 'slot-row' });
      row.appendChild(el('div', { class: 'slot-info' }, [
        el('div', { class: 'slot-label', text: slot.label }),
        el('div', { class: 'slot-progress', text: `${count} / ${target}` })
      ]));
      const tapBtn = el('button', { class: 'slot-tap', 'aria-label': `Log ${slot.label}` }, [document.createTextNode('+')]);
      tapBtn.addEventListener('click', () => {
        Store.update(s => {
          if (!s.weeks[week]) s.weeks[week] = { slots: {}, familyTaskDone: false, note: '' };
          if (!s.weeks[week].slots) s.weeks[week].slots = {};
          s.weeks[week].slots[slot.id] = (s.weeks[week].slots[slot.id] || 0) + 1;
        });
        renderApp();
      });
      row.appendChild(tapBtn);
      slotsCard.appendChild(row);
    });
    container2.appendChild(slotsCard);

    const repeatBtn = el('button', { class: 'secondary-btn', text: 'Repeat this week', onclick: () => {
      Store.update(s => { s.settings.scheduleShiftDays = (s.settings.scheduleShiftDays || 0) + 7; });
      viewingWeek = null;
      renderApp();
    }});
    container2.appendChild(repeatBtn);
  } else if (!phase) {
    // outside plan, nothing to log
  } else {
    container2.appendChild(el('p', { class: 'muted', text: 'Logging is only available for the current week.' }));
  }

  container.appendChild(container2);
  return container;
}

function renderPlan(state) {
  const container = el('div', { class: 'screen-plan' });
  container.appendChild(el('h1', { text: 'Plan' }));

  CONTENT.phases.forEach(phase => {
    const details = el('details', { class: 'phase-block' });
    details.open = false;
    const summary = el('summary', {}, [
      el('span', { class: 'phase-title', text: `${phase.title} (weeks ${phase.weekStart}–${phase.weekEnd})` })
    ]);
    details.appendChild(summary);

    const goal = el('p', { class: 'phase-goal', text: phase.goal });
    details.appendChild(goal);

    if (phase.habits && phase.habits.length) {
      const habitsList = el('ul', { class: 'habits' });
      phase.habits.forEach(h => habitsList.appendChild(el('li', { text: h })));
      details.appendChild(habitsList);
    }
    if (phase.grammarNote) details.appendChild(el('p', { class: 'muted', text: phase.grammarNote }));

    phase.blocks.forEach(block => {
      const blockEl = el('div', { class: 'week-block' });
      blockEl.appendChild(el('div', { class: 'week-block-range', text: `Weeks ${block.weekStart}–${block.weekEnd}` }));
      if (block.grammar) blockEl.appendChild(el('p', {}, [el('strong', { text: 'Grammar: ' }), document.createTextNode(block.grammar)]));
      if (block.vocabulary) blockEl.appendChild(el('p', {}, [el('strong', { text: 'Vocabulary: ' }), document.createTextNode(block.vocabulary)]));
      if (block.conversationFocus) blockEl.appendChild(el('p', {}, [el('strong', { text: 'Conversation: ' }), document.createTextNode(block.conversationFocus)]));
      if (block.familyTask) blockEl.appendChild(el('p', { class: 'family-task' }, [el('strong', { text: 'Family task: ' }), document.createTextNode(block.familyTask)]));
      const jumpBtn = el('button', { class: 'link-btn', text: `Jump to week ${block.weekStart}`, onclick: () => {
        viewingWeek = block.weekStart;
        document.body.dataset.tab = 'today';
        renderApp();
      }});
      blockEl.appendChild(jumpBtn);
      details.appendChild(blockEl);
    });

    if (phase.capstone) {
      const capstoneEl = el('div', { class: 'week-block capstone' });
      capstoneEl.appendChild(el('p', {}, [el('strong', { text: 'Capstone: ' }), document.createTextNode(phase.capstone.label)]));
      capstoneEl.appendChild(el('p', { class: 'muted', text: phase.capstone.note }));
      details.appendChild(capstoneEl);
    }

    const exitDone = !!state.exitChecks[phase.id];
    const exitRow = el('div', { class: 'exit-check' });
    const checkbox = el('input', { type: 'checkbox' });
    checkbox.checked = exitDone;
    checkbox.addEventListener('change', () => {
      Store.update(s => {
        if (checkbox.checked) s.exitChecks[phase.id] = new Date().toISOString().slice(0, 10);
        else delete s.exitChecks[phase.id];
      });
      renderApp();
    });
    exitRow.appendChild(checkbox);
    exitRow.appendChild(el('span', { text: ` Exit check: ${phase.exitCheck}` }));
    details.appendChild(exitRow);

    container.appendChild(details);
  });

  return container;
}

function setupTabs() {
  document.querySelectorAll('.tab-bar button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.body.dataset.tab = btn.dataset.tab;
      renderApp();
    });
  });
}

async function init() {
  Store.onWarning(msg => {
    const banner = document.getElementById('warning-banner');
    banner.textContent = msg;
    banner.hidden = false;
  });

  const res = await fetch('content.json');
  CONTENT = await res.json();

  document.body.dataset.tab = 'today';
  setupTabs();
  renderApp();
}

init();
