const APP_VERSION = '0.3.0';
const MS_PER_DAY = 86400000;

function normalizeForSearch(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡!?]/g, '')
    .toLowerCase()
    .trim();
}

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
let settingsOpen = false;
let cheatSheetQuery = '';

// Which resources[] entries are relevant to each weekly slot. "family" has none —
// the family task text itself is the instruction, not an external resource.
const SLOT_RESOURCE_JOBS = {
  vocab: ['Vocabulary'],
  listening: ['Graded listening', 'Chilean listening, slow', 'Chilean listening, learner', 'Native content, easy', 'Native content, full speed'],
  study: ['Beginner course'],
  tutor: ['Tutor'],
  family: []
};

function phaseLabel(phase) {
  return `Phase ${phase.id.split('-')[1]}`;
}

function resourcesForSlot(slot, phase) {
  const jobs = SLOT_RESOURCE_JOBS[slot.id] || [];
  if (!jobs.length || !phase) return [];
  const label = phaseLabel(phase);
  return CONTENT.resources.filter(r => jobs.includes(r.job) && (r.phases.includes(label) || r.phases.includes('All phases')));
}

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

  if (settingsOpen) {
    screen.appendChild(renderSettings(state));
    return;
  }

  const tab = document.body.dataset.tab || 'today';
  if (tab === 'today') screen.appendChild(renderToday(state, actualWeek));
  else if (tab === 'plan') screen.appendChild(renderPlan(state));
  else if (tab === 'cheatsheet') screen.appendChild(renderCheatSheet(state));
  else if (tab === 'family') screen.appendChild(renderFamily(state, actualWeek));
  else if (tab === 'progress') screen.appendChild(renderProgress(state, actualWeek));

  document.querySelectorAll('.tab-bar button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
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
    container2.appendChild(el('h2', { class: 'steps-heading', text: 'Steps this week' }));
    const slotsCard = el('div', { class: 'card slots' });
    CONTENT.weeklySlots.forEach((slot, idx) => {
      const count = (weekData.slots && weekData.slots[slot.id]) || 0;
      const target = slot.targetPerWeek;
      const done = typeof target === 'number' && count >= target;
      const row = el('div', { class: `slot-row${done ? ' slot-done' : ''}` });

      const info = el('div', { class: 'slot-info' });
      info.appendChild(el('div', { class: 'slot-heading' }, [
        el('span', { class: 'slot-number', text: `${idx + 1}.` }),
        el('span', { class: 'slot-label', text: `${slot.label}${typeof target === 'number' ? ` — ${target}× this week` : ''}` })
      ]));
      if (slot.purpose) info.appendChild(el('div', { class: 'slot-purpose', text: slot.purpose }));
      const resources = resourcesForSlot(slot, phase);
      if (resources.length) {
        const resLine = el('div', { class: 'slot-resources' }, [el('strong', { text: 'Use: ' })]);
        resources.forEach((r, i) => {
          if (i > 0) resLine.appendChild(document.createTextNode(' · '));
          if (r.url) {
            resLine.appendChild(el('a', { href: r.url, target: '_blank', rel: 'noopener', text: r.name }));
          } else {
            resLine.appendChild(document.createTextNode(r.name));
          }
        });
        info.appendChild(resLine);
      }
      row.appendChild(info);

      const controls = el('div', { class: 'slot-controls' });
      if (target === 1) {
        // Single occurrence: a plain done/not-done toggle reads clearer than an open-ended counter.
        const toggleBtn = el('button', {
          class: `slot-toggle${done ? ' done' : ''}`,
          'aria-label': done ? `Mark ${slot.label} not done` : `Mark ${slot.label} done`
        }, [document.createTextNode(done ? '✓' : '')]);
        toggleBtn.addEventListener('click', () => {
          Store.update(s => {
            if (!s.weeks[week]) s.weeks[week] = { slots: {}, familyTaskDone: false, note: '' };
            if (!s.weeks[week].slots) s.weeks[week].slots = {};
            s.weeks[week].slots[slot.id] = done ? 0 : 1;
            if (slot.id === 'family') s.weeks[week].familyTaskDone = !done;
          });
          renderApp();
        });
        controls.appendChild(toggleBtn);
        controls.appendChild(el('div', { class: 'slot-progress', text: done ? 'Done' : 'Not yet' }));
      } else {
        const tapBtn = el('button', { class: 'slot-tap', 'aria-label': `Log ${slot.label}` }, [document.createTextNode('+')]);
        tapBtn.addEventListener('click', () => {
          Store.update(s => {
            if (!s.weeks[week]) s.weeks[week] = { slots: {}, familyTaskDone: false, note: '' };
            if (!s.weeks[week].slots) s.weeks[week].slots = {};
            s.weeks[week].slots[slot.id] = (s.weeks[week].slots[slot.id] || 0) + 1;
          });
          renderApp();
        });
        controls.appendChild(tapBtn);
        controls.appendChild(el('div', { class: 'slot-progress', text: `${count} / ${target}` }));
      }
      row.appendChild(controls);
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

function renderCheatSheet(state) {
  const container = el('div', { class: 'screen-cheatsheet' });
  container.appendChild(el('h1', { text: 'Cheat sheet' }));

  const sheet = CONTENT.cheatSheet;

  container.appendChild(el('div', { class: 'card note-card' }, [el('p', { text: sheet.ustedNote })]));

  container.appendChild(el('h2', { text: 'Sound changes' }));
  const soundsCard = el('div', { class: 'card' });
  sheet.sounds.forEach(s => {
    const row = el('div', { class: 'sound-row' });
    row.appendChild(el('div', { class: 'sound-example' }, [
      el('span', { text: s.textbook }),
      el('span', { class: 'sound-arrow', text: ' → ' }),
      el('span', { class: 'sound-chilean', text: s.chilean })
    ]));
    row.appendChild(el('div', { class: 'sound-pattern muted', text: s.pattern }));
    soundsCard.appendChild(row);
  });
  container.appendChild(soundsCard);

  container.appendChild(el('h2', { text: 'Voseo (informal tú)' }));
  const voseoCard = el('div', { class: 'card' });
  voseoCard.appendChild(el('p', { class: 'muted', text: sheet.voseoNote }));
  const voseoList = el('div', { class: 'voseo-list' });
  sheet.voseo.forEach(v => {
    voseoList.appendChild(el('div', { class: 'voseo-pair' }, [
      el('span', { text: v.standard }),
      el('span', { class: 'sound-arrow', text: ' → ' }),
      el('strong', { text: v.voseo })
    ]));
  });
  voseoCard.appendChild(voseoList);
  container.appendChild(voseoCard);

  container.appendChild(el('h2', { text: 'Core words' }));
  const searchInput = el('input', { type: 'search', class: 'search-input', placeholder: 'Search word, meaning or example…' });
  searchInput.value = cheatSheetQuery;
  searchInput.addEventListener('input', () => {
    cheatSheetQuery = searchInput.value;
    renderApp();
    // Re-focus and restore cursor position after the re-render replaces the input.
    const newInput = document.querySelector('.search-input');
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(newInput.value.length, newInput.value.length);
    }
  });
  container.appendChild(searchInput);

  const q = normalizeForSearch(cheatSheetQuery);
  const starred = state.starredWords || [];
  let words = sheet.words.filter(w => {
    if (!q) return true;
    return normalizeForSearch(w.word).includes(q) || normalizeForSearch(w.meaning).includes(q) || normalizeForSearch(w.example).includes(q);
  });
  words = [
    ...words.filter(w => starred.includes(w.word)),
    ...words.filter(w => !starred.includes(w.word))
  ];

  const wordsCard = el('div', { class: 'card' });
  if (!words.length) {
    wordsCard.appendChild(el('p', { class: 'muted', text: 'No matches.' }));
  }
  words.forEach(w => {
    const isStarred = starred.includes(w.word);
    const row = el('div', { class: 'word-row' });
    const starBtn = el('button', { class: 'star-btn', 'aria-label': isStarred ? `Unstar ${w.word}` : `Star ${w.word}` }, [document.createTextNode(isStarred ? '★' : '☆')]);
    starBtn.addEventListener('click', () => {
      Store.update(s => {
        s.starredWords = s.starredWords || [];
        const i = s.starredWords.indexOf(w.word);
        if (i >= 0) s.starredWords.splice(i, 1);
        else s.starredWords.push(w.word);
      });
      renderApp();
    });
    row.appendChild(starBtn);
    const info = el('div', { class: 'word-info' });
    info.appendChild(el('div', { class: 'word-text' }, [el('strong', { text: w.word }), document.createTextNode(` — ${w.meaning}`)]));
    info.appendChild(el('div', { class: 'word-example muted', text: w.example }));
    row.appendChild(info);
    wordsCard.appendChild(row);
  });
  container.appendChild(wordsCard);

  if (sheet.diminutivesNote) {
    container.appendChild(el('p', { class: 'muted small-note', text: sheet.diminutivesNote }));
  }

  return container;
}

function renderFamily(state, actualWeek) {
  const container = el('div', { class: 'screen-family' });
  container.appendChild(el('h1', { text: 'Family' }));

  const phase = findPhaseForWeek(actualWeek);
  const block = findBlockForWeek(phase, actualWeek);
  if (block && block.familyTask) {
    container.appendChild(el('h2', { text: 'This week' }));
    container.appendChild(el('div', { class: 'card' }, [
      el('p', { class: 'family-task', text: block.familyTask })
    ]));
  }

  container.appendChild(el('h2', { text: 'Jobs for your in-laws' }));
  const jobsCard = el('div', { class: 'card' });
  const jobsList = el('ul', { class: 'habits' });
  CONTENT.family.jobs.forEach(j => jobsList.appendChild(el('li', { text: j })));
  jobsCard.appendChild(jobsList);
  if (CONTENT.family.cookingSuggestions && CONTENT.family.cookingSuggestions.length) {
    jobsCard.appendChild(el('p', {}, [
      el('strong', { text: 'Good first cooking requests: ' }),
      document.createTextNode(CONTENT.family.cookingSuggestions.join(', '))
    ]));
    if (CONTENT.family.cookingNote) jobsCard.appendChild(el('p', { class: 'muted', text: CONTENT.family.cookingNote }));
  }
  container.appendChild(jobsCard);

  container.appendChild(el('h2', { text: 'Question bank' }));
  const questionsCard = el('div', { class: 'card' });
  const allQuestions = [...CONTENT.family.questions, ...(state.myQuestions || [])];
  allQuestions.forEach(q => questionsCard.appendChild(renderQuestionRow(q, state)));

  const addQRow = el('div', { class: 'add-row' });
  const qInput = el('input', { type: 'text', placeholder: 'Add your own question…' });
  const qBtn = el('button', { class: 'secondary-btn small-btn', text: 'Add' });
  qBtn.addEventListener('click', () => {
    const val = qInput.value.trim();
    if (!val) return;
    Store.update(s => { s.myQuestions = s.myQuestions || []; s.myQuestions.push(val); });
    renderApp();
  });
  addQRow.appendChild(qInput);
  addQRow.appendChild(qBtn);
  questionsCard.appendChild(addQRow);
  container.appendChild(questionsCard);

  container.appendChild(el('h2', { text: 'My collected chilenismos' }));
  const wordsCard = el('div', { class: 'card' });
  const myWords = state.myWords || [];
  if (!myWords.length) {
    wordsCard.appendChild(el('p', { class: 'muted', text: 'Nothing collected yet.' }));
  }
  myWords.forEach((w, idx) => {
    const row = el('div', { class: 'word-row' });
    const info = el('div', { class: 'word-info' });
    info.appendChild(el('div', { class: 'word-text' }, [el('strong', { text: w.word }), document.createTextNode(w.meaning ? ` — ${w.meaning}` : '')]));
    if (w.example) info.appendChild(el('div', { class: 'word-example muted', text: w.example }));
    row.appendChild(info);
    const removeBtn = el('button', { class: 'star-btn', 'aria-label': `Remove ${w.word}` }, [document.createTextNode('×')]);
    removeBtn.addEventListener('click', () => {
      Store.update(s => { s.myWords.splice(idx, 1); });
      renderApp();
    });
    row.appendChild(removeBtn);
    wordsCard.appendChild(row);
  });

  const addWordRow = el('div', { class: 'add-row add-row-stacked' });
  const wordInput = el('input', { type: 'text', placeholder: 'Word' });
  const meaningInput = el('input', { type: 'text', placeholder: 'Meaning' });
  const exampleInput = el('input', { type: 'text', placeholder: 'Example (optional)' });
  const addWordBtn = el('button', { class: 'secondary-btn small-btn', text: 'Add word' });
  addWordBtn.addEventListener('click', () => {
    const word = wordInput.value.trim();
    const meaning = meaningInput.value.trim();
    if (!word) return;
    Store.update(s => {
      s.myWords = s.myWords || [];
      s.myWords.push({ word, meaning, example: exampleInput.value.trim() });
    });
    renderApp();
  });
  addWordRow.appendChild(wordInput);
  addWordRow.appendChild(meaningInput);
  addWordRow.appendChild(exampleInput);
  addWordRow.appendChild(addWordBtn);
  wordsCard.appendChild(addWordRow);
  container.appendChild(wordsCard);

  return container;
}

function renderQuestionRow(questionText, state) {
  const asked = state.askedQuestions && state.askedQuestions[questionText];
  const row = el('div', { class: 'question-row' });
  const top = el('div', { class: 'question-top' });
  const checkbox = el('input', { type: 'checkbox' });
  checkbox.checked = !!asked;
  checkbox.addEventListener('change', () => {
    Store.update(s => {
      s.askedQuestions = s.askedQuestions || {};
      if (checkbox.checked) {
        s.askedQuestions[questionText] = { date: new Date().toISOString().slice(0, 10), note: (s.askedQuestions[questionText] && s.askedQuestions[questionText].note) || '' };
      } else {
        delete s.askedQuestions[questionText];
      }
    });
    renderApp();
  });
  top.appendChild(checkbox);
  top.appendChild(el('span', { class: 'question-text', text: questionText }));
  row.appendChild(top);
  if (asked) {
    const noteInput = el('input', { type: 'text', class: 'question-note', placeholder: 'What did you learn?' });
    noteInput.value = asked.note || '';
    noteInput.addEventListener('change', () => {
      Store.update(s => { if (s.askedQuestions[questionText]) s.askedQuestions[questionText].note = noteInput.value; });
    });
    row.appendChild(noteInput);
  }
  return row;
}

function isWeekComplete(weekData) {
  if (!weekData || !weekData.slots) return false;
  return CONTENT.weeklySlots.every(slot => (weekData.slots[slot.id] || 0) >= slot.targetPerWeek);
}

function computeStreak(state, actualWeek) {
  let streak = 0;
  let w = actualWeek;
  while (w >= state.settings.startWeek) {
    const wd = state.weeks[w];
    const tutorOk = wd && wd.slots && (wd.slots.tutor || 0) >= 1;
    const listeningOk = wd && wd.slots && (wd.slots.listening || 0) >= 5;
    if (tutorOk && listeningOk) { streak++; w--; } else break;
  }
  return streak;
}

function generateMonths(settings) {
  const start = parseDate(settings.startDate);
  const end = addDays(start, 52 * 7);
  const months = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function renderProgress(state, actualWeek) {
  const container = el('div', { class: 'screen-progress' });
  container.appendChild(el('h1', { text: 'Progress' }));

  const weeksCompleted = Object.keys(state.weeks).filter(w => isWeekComplete(state.weeks[w])).length;
  const streak = computeStreak(state, actualWeek);

  const statsCard = el('div', { class: 'card stats-card' });
  statsCard.appendChild(el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value', text: String(weeksCompleted) }),
    el('div', { class: 'stat-label', text: 'weeks completed' })
  ]));
  statsCard.appendChild(el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value', text: String(streak) }),
    el('div', { class: 'stat-label', text: 'week streak' })
  ]));
  container.appendChild(statsCard);

  container.appendChild(el('h2', { text: 'Milestones' }));
  const milestonesCard = el('div', { class: 'card' });
  CONTENT.milestones.forEach(m => {
    const done = state.milestones && state.milestones[m.id];
    const target = weekStartDate(state.settings, m.weekOffset);
    const targetEnd = addDays(target, 6);
    const row = el('div', { class: 'milestone-row' });
    const checkbox = el('input', { type: 'checkbox' });
    checkbox.checked = !!done;
    checkbox.addEventListener('change', () => {
      Store.update(s => {
        s.milestones = s.milestones || {};
        if (checkbox.checked) s.milestones[m.id] = new Date().toISOString().slice(0, 10);
        else delete s.milestones[m.id];
      });
      renderApp();
    });
    row.appendChild(checkbox);
    const info = el('div', { class: 'milestone-info' });
    info.appendChild(el('div', { text: m.label }));
    info.appendChild(el('div', { class: 'muted small-note', text: `By ${formatDate(targetEnd)} (week ${m.weekOffset})` }));
    row.appendChild(info);
    milestonesCard.appendChild(row);
  });
  container.appendChild(milestonesCard);

  container.appendChild(el('h2', { text: 'Monthly recording' }));
  const monthsCard = el('div', { class: 'card' });
  generateMonths(state.settings).forEach(monthDate => {
    const key = monthKey(monthDate);
    const done = state.monthlyRecordings && state.monthlyRecordings[key];
    const row = el('div', { class: 'milestone-row' });
    const checkbox = el('input', { type: 'checkbox' });
    checkbox.checked = !!done;
    checkbox.addEventListener('change', () => {
      Store.update(s => {
        s.monthlyRecordings = s.monthlyRecordings || {};
        if (checkbox.checked) s.monthlyRecordings[key] = new Date().toISOString().slice(0, 10);
        else delete s.monthlyRecordings[key];
      });
      renderApp();
    });
    row.appendChild(checkbox);
    row.appendChild(el('div', { text: monthDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) }));
    monthsCard.appendChild(row);
  });
  container.appendChild(monthsCard);

  const historyWeeks = Object.keys(state.weeks).map(Number).filter(w => {
    const wd = state.weeks[w];
    return wd && wd.slots && Object.keys(wd.slots).length;
  }).sort((a, b) => b - a);

  if (historyWeeks.length) {
    const details = el('details', { class: 'phase-block' });
    details.appendChild(el('summary', { text: 'View history' }));
    historyWeeks.forEach(w => {
      const wd = state.weeks[w];
      const phase = findPhaseForWeek(w);
      const summary = CONTENT.weeklySlots.map(slot => `${slot.label}: ${(wd.slots[slot.id] || 0)}/${slot.targetPerWeek}`).join(' · ');
      const row = el('div', { class: 'week-block' });
      row.appendChild(el('div', { class: 'week-block-range', text: `Week ${w}${phase ? ' — ' + phase.title : ''}` }));
      row.appendChild(el('p', { class: 'muted', text: summary }));
      details.appendChild(row);
    });
    container.appendChild(details);
  }

  return container;
}

function renderSettings(state) {
  const container = el('div', { class: 'screen-settings' });
  const header = el('div', { class: 'settings-header' }, [
    el('h1', { text: 'Settings' }),
    el('button', { class: 'nav-btn', 'aria-label': 'Close settings', onclick: () => { settingsOpen = false; renderApp(); } }, [document.createTextNode('✕')])
  ]);
  container.appendChild(header);

  const formCard = el('div', { class: 'card' });

  formCard.appendChild(el('label', { class: 'field-label', text: 'Start date' }));
  const dateInput = el('input', { type: 'date', class: 'field-input' });
  dateInput.value = state.settings.startDate;
  dateInput.addEventListener('change', () => {
    Store.update(s => { s.settings.startDate = dateInput.value; s.settings.scheduleShiftDays = 0; });
    viewingWeek = null;
    renderApp();
  });
  formCard.appendChild(dateInput);

  formCard.appendChild(el('label', { class: 'field-label', text: 'Starting point' }));
  const select = el('select', { class: 'field-input' });
  CONTENT.placementGuide.forEach((p, i) => {
    const opt = el('option', { value: String(i), text: p.ability });
    if (p.startWeek === state.settings.startWeek) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const p = CONTENT.placementGuide[Number(select.value)];
    Store.update(s => {
      s.settings.startWeek = p.startWeek;
      s.settings.startPhaseId = `phase-${p.startPhase}`;
      s.settings.scheduleShiftDays = 0;
    });
    viewingWeek = null;
    renderApp();
  });
  formCard.appendChild(select);

  if (state.settings.scheduleShiftDays) {
    const shiftRow = el('p', { class: 'muted', text: `Schedule currently shifted by ${state.settings.scheduleShiftDays} days from "repeat this week".` });
    formCard.appendChild(shiftRow);
    const resetShiftBtn = el('button', { class: 'secondary-btn small-btn', text: 'Reset shift' });
    resetShiftBtn.addEventListener('click', () => {
      Store.update(s => { s.settings.scheduleShiftDays = 0; });
      viewingWeek = null;
      renderApp();
    });
    formCard.appendChild(resetShiftBtn);
  }

  container.appendChild(formCard);

  const dataCard = el('div', { class: 'card' });
  const exportBtn = el('button', { class: 'secondary-btn', text: 'Export progress as JSON' });
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spanish-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  dataCard.appendChild(exportBtn);

  const importLabel = el('label', { class: 'secondary-btn import-label', text: 'Import progress from JSON' });
  const importInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'hidden-file-input' });
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        Store.importJSON(String(reader.result));
        viewingWeek = null;
        renderApp();
        alert('Progress imported.');
      } catch (err) {
        alert('That file could not be read as valid progress JSON.');
      }
    };
    reader.readAsText(file);
  });
  importLabel.appendChild(importInput);
  dataCard.appendChild(importLabel);

  const resetBtn = el('button', { class: 'secondary-btn danger-btn', text: 'Reset all progress' });
  resetBtn.addEventListener('click', () => {
    if (confirm('This clears all logged progress, starred words, questions and milestones. This cannot be undone. Continue?')) {
      Store.resetAll();
      viewingWeek = null;
      renderApp();
    }
  });
  dataCard.appendChild(resetBtn);

  container.appendChild(dataCard);

  container.appendChild(el('p', { class: 'muted version-note', text: `Español v${APP_VERSION}` }));

  return container;
}

function setupTabs() {
  document.querySelectorAll('.tab-bar button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.body.dataset.tab = btn.dataset.tab;
      settingsOpen = false;
      renderApp();
    });
  });
  document.getElementById('settings-btn').addEventListener('click', () => {
    settingsOpen = true;
    renderApp();
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
