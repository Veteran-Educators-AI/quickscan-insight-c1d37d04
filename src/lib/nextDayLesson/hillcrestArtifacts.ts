import type { NextDayDraft, SlideDraft, WorksheetItemDraft } from './types';
import { H, E, F, head, item as printItem, strip, settable, board } from '@/lib/hillcrestPrint';

export interface CoverageRow {
  element: string;
  where: string;
  what: string;
  met?: boolean;
}

export interface TipPlanRow {
  prescribed: string;
  where: string;
  artifact: string;
  met?: boolean;
}

export interface TipFindingRow {
  finding: string;
  answer: string;
  met?: boolean;
}

export interface LessonDeckEntry {
  key: string;
  slideNumber: number;
  kind: SlideDraft['kind'] | 'key-vocabulary';
  title: string;
  bullets: string[];
  speakerNotes: string;
  sourceSlide?: SlideDraft;
  minutes?: number;
  timelineLabel?: string;
  timelineDetail?: string;
}

export const TIP_SOURCE_TEXT = 'Prescribed activities are quoted from the April 2026 observation report as reproduced in Mr. Francois\'s own written input to the plan, not from an issued Teacher Improvement Plan document I have read. If the issued plan is loaded later, re-cut this table against that plan\'s own wording.';

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const math = (value: unknown) =>
  esc(value)
    .replace(/−/g, '&minus;')
    .replace(/ - /g, ' &minus; ')
    .replace(/×/g, '&middot;')
    .replace(/\*/g, '&middot;')
    .replace(/->/g, '&rarr;')
    .replace(/…/g, '&hellip;');

const courseOf = (draft: NextDayDraft) => /stat/i.test(draft.className) ? 'Statistics' : /alg/i.test(draft.className) ? 'Algebra II' : draft.className;
const periodDigit = (draft: NextDayDraft) => {
  const match = draft.className.match(/period\s*(\d+)/i) || draft.className.match(/\bp\s*(\d+)/i);
  return match ? match[1] : '';
};
const standards = (draft: NextDayDraft) => draft.lessonPlan.standards || [];
const stdChips = (draft: NextDayDraft) => standards(draft).map((s) => `<span class="std">${esc(s)}</span>`).join(' ');
export const standardsText = (draft: NextDayDraft) => {
  const supplied = standards(draft).filter(Boolean);
  if (supplied.length > 0) return supplied.join(' · ');
  return /stat/i.test(draft.className) ? 'AI-S.ID.1 · AI-S.ID.2 · AI-S.ID.3' : 'AII-F.BF.2 · AII-F.LE.2 · AII-F.IF.3';
};
const builtFromLine = (draft: NextDayDraft) => {
  const b = draft.builtFrom;
  const when = b.worksheetDate ? new Date(b.worksheetDate).toLocaleDateString() : 'undated';
  return `Built from results actually received: ${esc(b.className)} &middot; ${esc(b.worksheetCode)} (${esc(b.worksheetTitle)}) &middot; ${esc(when)} &middot; ${b.papers} paper(s) from ${b.studentCount} student(s).`;
};

export const studentBoardName = (student: { name: string; realName?: string }) => student.realName?.trim() || student.name;

export const setMap = (draft: NextDayDraft) => Object.fromEntries(
  draft.grouping.groups.map((group, index) => [String(index + 1), group.itemNumbers])
) as Record<string, number[]>;

export const totalMap = (draft: NextDayDraft) => Object.fromEntries(
  draft.grouping.groups.map((group, index) => [String(index + 1), group.checkTotal])
) as Record<string, number>;

export function firstSixTotal(draft: NextDayDraft, itemNumbers: number[]) {
  const total = itemNumbers.slice(0, 6).reduce((sum, n) => {
    const found = draft.worksheet.items.find((i) => i.itemNumber === n);
    return sum + (typeof found?.answerNumeric === 'number' ? found.answerNumeric : 0);
  }, 0);
  return Math.round(total * 1000) / 1000;
}

export function vocabularyRows(draft: NextDayDraft): [string, string][] {
  if (/stat/i.test(draft.className)) {
    return [
      ['Data value', 'One number in the set.'],
      ['Median', 'The middle value after the data are ordered.'],
      ['Quartile', 'A cut point that splits the ordered data into fourths.'],
      ['Spread', 'How far apart the data values are.'],
      ['Outlier', 'A value far enough away that it may change the summary.'],
    ];
  }
  return [
    ['Sequence', 'A list of numbers in order.'],
    ['Term', 'One value in the sequence.'],
    ['First term', 'The value you start with.'],
    ['Common difference or ratio', 'The change you use from one term to the next.'],
    ['Check total', 'The sum of your assigned answers.'],
  ];
}

function adjustedTimeline(draft: NextDayDraft) {
  const duration = draft.lessonPlan.durationMinutes || 45;
  const raw = (draft.lessonPlan.timeline || []).map((step) => ({ ...step }));
  const hasVocabulary = raw.some((step) => /vocab|word/i.test(`${step.label} ${step.detail}`));
  const doNowIndex = raw.findIndex((step) => /do\s*now|warm/i.test(`${step.label} ${step.detail}`));
  if (!hasVocabulary) {
    const insertAt = doNowIndex >= 0 ? doNowIndex + 1 : Math.min(1, raw.length);
    const donorIndex = raw.findIndex((step, index) => index >= insertAt && step.minutes >= 6);
    const donor = donorIndex >= 0 ? donorIndex : raw.findIndex((step) => step.minutes >= 6);
    if (donor >= 0) raw[donor].minutes = Math.max(1, raw[donor].minutes - 3);
    raw.splice(insertAt, 0, { minutes: 3, label: 'Key vocabulary', detail: 'Five words from the Side 2 help card, in plain language, before students need them.' });
  }
  const total = raw.reduce((sum, step) => sum + step.minutes, 0);
  if (raw.length > 0 && total !== duration) {
    const last = raw[raw.length - 1];
    last.minutes = Math.max(1, last.minutes + duration - total);
  }
  return raw;
}

export function lessonDeckEntries(draft: NextDayDraft): LessonDeckEntry[] {
  const entries: LessonDeckEntry[] = [];
  let insertedVocabulary = false;
  const pushSlide = (slide: SlideDraft) => {
    entries.push({
      key: `slide-${entries.length + 1}-${slide.kind}`,
      slideNumber: entries.length + 1,
      kind: slide.kind,
      title: slide.title,
      bullets: slide.bullets || [],
      speakerNotes: slide.speakerNotes || '',
      sourceSlide: slide,
    });
  };

  for (const slide of draft.slides || []) {
    pushSlide(slide);
    if (!insertedVocabulary && slide.kind === 'do-now') {
      entries.push({
        key: `slide-${entries.length + 1}-key-vocabulary`,
        slideNumber: entries.length + 1,
        kind: 'key-vocabulary',
        title: 'Key vocabulary',
        bullets: vocabularyRows(draft).map(([word, meaning]) => `${word}: ${meaning}`),
        speakerNotes: 'Read each word quickly and point students to the same table on Side 2.',
      });
      insertedVocabulary = true;
    }
  }

  if (!insertedVocabulary) {
    const insertAfter = Math.min(1, entries.length);
    entries.splice(insertAfter, 0, {
      key: `slide-vocab`,
      slideNumber: insertAfter + 1,
      kind: 'key-vocabulary',
      title: 'Key vocabulary',
      bullets: vocabularyRows(draft).map(([word, meaning]) => `${word}: ${meaning}`),
      speakerNotes: 'Read each word quickly and point students to the same table on Side 2.',
    });
  }

  entries.forEach((entry, index) => { entry.slideNumber = index + 1; });

  const used = new Set<number>();
  const findEntry = (label: string, detail: string, fallback: number) => {
    const text = `${label} ${detail}`.toLowerCase();
    const rules: Array<[RegExp, LessonDeckEntry['kind'][]]> = [
      [/do\s*now|warm/, ['do-now']],
      [/vocab|word/, ['key-vocabulary']],
      [/reteach|repair|yesterday|error/, ['reteach-worked']],
      [/independent|practice|own|work time/, ['independent-work']],
      [/exit|ticket/, ['exit-ticket']],
      [/debrief|answer/, ['debrief']],
      [/teach|launch|model|example|new/, ['teaching', 'reteach-worked']],
    ];
    for (const [re, kinds] of rules) {
      if (!re.test(text)) continue;
      const found = entries.findIndex((entry, index) => !used.has(index) && kinds.includes(entry.kind));
      if (found >= 0) return found;
    }
    const open = entries.findIndex((entry, index) => !used.has(index) && entry.kind !== 'title');
    return open >= 0 ? open : Math.min(fallback, Math.max(0, entries.length - 1));
  };

  adjustedTimeline(draft).forEach((step, index) => {
    const entryIndex = findEntry(step.label, step.detail, index + 1);
    used.add(entryIndex);
    const entry = entries[entryIndex];
    if (entry) {
      entry.minutes = step.minutes;
      entry.timelineLabel = step.label;
      entry.timelineDetail = step.detail;
    }
  });

  return entries;
}

export const lessonDeckSlideCount = (draft: NextDayDraft) => lessonDeckEntries(draft).length + 2;

export function lessonPeriodRows(draft: NextDayDraft) {
  const entries = lessonDeckEntries(draft);
  const timed = entries.filter((entry) => typeof entry.minutes === 'number').sort((a, b) => a.slideNumber - b.slideNumber);
  return timed.map((entry, index) => {
    const next = timed[index + 1]?.slideNumber ?? (entries.length + 1);
    const end = Math.max(entry.slideNumber, next - 1);
    const slides = end > entry.slideNumber ? `${entry.slideNumber}&ndash;${end}` : `${entry.slideNumber}`;
    return {
      minutes: entry.minutes || 0,
      slides,
      label: entry.timelineLabel || entry.title,
      detail: entry.timelineDetail || entry.bullets.join(' '),
    };
  });
}

function worksheetTag(draft: NextDayDraft, worksheetItem: WorksheetItemDraft, index: number) {
  const repair = draft.lessonPlan.reteach.items.find((r) => r.itemNumber === worksheetItem.itemNumber);
  if (repair?.wrongAnswersQuoted?.length) return 'From a real paper &middot; name removed';
  if (index === Math.max(0, draft.worksheet.items.length - 1)) return 'Regents style';
  if (index === 10) return '&#9632; Set 4: do this one first';
  if (index === 12) return '&#9670; Set 4: after item 11';
  return worksheetItem.skillTag ? math(worksheetItem.skillTag) : '';
}

function workLines(count = 2) {
  return Array.from({ length: count }, () => '<div class="work"></div>').join('');
}

function sectionFoot(draft: NextDayDraft, side: number) {
  return `<div class="foot">${stdChips(draft)} <span style="float:right">Side ${side} of 4</span></div>`;
}

function renderWorksheetItem(draft: NextDayDraft, worksheetItem: WorksheetItemDraft, index: number) {
  const repair = draft.lessonPlan.reteach.items.find((r) => r.itemNumber === worksheetItem.itemNumber);
  const paperLine = repair?.wrongAnswersQuoted?.length
    ? `<div class="ref">A paper we read said: &ldquo;${math(repair.wrongAnswersQuoted[0])}&rdquo;. Fix the idea, not the person.</div>`
    : '';
  return printItem(
    worksheetItem.itemNumber,
    `<span class="math">${math(worksheetItem.prompt)}</span>${paperLine}${workLines(2)}`,
    worksheetTag(draft, worksheetItem, index)
  );
}

export function worksheetHtml(draft: NextDayDraft) {
  const course = courseOf(draft);
  const title = draft.worksheet.title || draft.nextLessonTitle;
  const day = draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day not set';
  const period = periodDigit(draft) || 'the digit';
  const items = draft.worksheet.items.slice(0, 14);
  const side3 = items.slice(0, 7).map((it, i) => renderWorksheetItem(draft, it, i)).join('');
  const side4 = items.slice(7, 14).map((it, i) => renderWorksheetItem(draft, it, i + 7)).join('');
  const first = items[0];
  const second = items[1] || first;
  return H +
    head(`${course} &middot; ${day} &middot; ${esc(draft.nextLessonDate)}`, `${esc(title)} &mdash; Practice`) +
    `<div class="nameline"><div>Name</div><div>Period &mdash; write ${esc(period)}</div><div>Date</div></div>` +
    `<div class="side">Side 1 &nbsp;&middot;&nbsp; fill in with me</div>` +
    `<div class="banner"><b>Aim:</b> ${math(draft.lessonPlan.aim || draft.nextLessonTitle)}. Side 1 is guided, Side 2 is the help card, and Sides 3&ndash;4 are the shared problem pool.</div>` +
    `<h2>1 &nbsp;&middot;&nbsp; What yesterday showed</h2><p>${math(draft.lessonPlan.reteach.summary || draft.lessonPlan.builtFrom || 'Use the last exit ticket to name the repair work.')}</p>` +
    `<h2>2 &nbsp;&middot;&nbsp; Fix one item together</h2><p class="math">${first ? math(first.prompt) : F('l')}</p><p class="stepl">The important value is ${F()} because ${F('l')}</p><div class="ruleline"></div>` +
    `<h2>3 &nbsp;&middot;&nbsp; Check the rule</h2><p class="math">${second ? math(second.prompt) : F('l')}</p><p class="stepl">Answer: ${F()} &nbsp; Reason: ${F('l')}</p><div class="ruleline"></div>` +
    `<h2>4 &nbsp;&middot;&nbsp; Before independent work</h2><p>Only do the 8 item numbers next to your name. Put final numbers on the strip and compare the check total.</p>` +
    sectionFoot(draft, 1) +
    `<div class="pb"></div>` +
    head(`${course} &middot; ${day}`, 'Help card') +
    `<div class="side">Side 2 &nbsp;&middot;&nbsp; help card</div>` +
    `<div class="gbox k"><div class="cap">Decision flow</div><p>Read the representation. Name what is changing. Write the rule. Check it with one value before you move on.</p></div>` +
    `<table><tr><th>Thing</th><th>What it is</th></tr>${vocabularyRows(draft).map(([word, meaning]) => `<tr><td>${esc(word)}</td><td>${esc(meaning)}</td></tr>`).join('')}</table>` +
    `<div class="g2"><div class="box4"><div class="cap">Worked &middot; from yesterday</div><p class="math">${first ? math(first.prompt) : 'Use the first item.'}</p><p>Check: ${first ? math(first.verifyNote || first.verify || '') : F()}</p></div><div class="box4"><div class="cap">Worked &middot; new numbers</div><p class="math">${second ? math(second.prompt) : 'Use the second item.'}</p><p>Check: ${second ? math(second.verifyNote || second.verify || '') : F()}</p></div></div>` +
    `<h2>Before you hand this in</h2><p><span class="ck"></span>I did only my 8 items. &nbsp; <span class="ck"></span>I wrote answers on the strip. &nbsp; <span class="ck"></span>I compared my total.</p>` +
    sectionFoot(draft, 2) +
    `<div class="pb"></div>` +
    head(`${course} &middot; ${day}`, 'Independent problem pool') +
    `<div class="side own">Side 3 &nbsp;&middot;&nbsp; on your own</div>` +
    `<div class="banner">Do only the 8 items on the list next to your name on the board. Everyone uses this same sheet.</div>${side3}` +
    sectionFoot(draft, 3) +
    `<div class="pb"></div>` +
    head(`${course} &middot; ${day}`, 'Independent problem pool') +
    `<div class="side own">Side 4 &nbsp;&middot;&nbsp; on your own</div>` +
    `<div class="banner">Finish your assigned items, then fill in the answer strip and check the total.</div>${side4}${strip(14)}` +
    sectionFoot(draft, 4) + E;
}

export function exitTicketsHtml(draft: NextDayDraft) {
  const course = courseOf(draft);
  const period = periodDigit(draft) || 'the digit';
  const formOf = (form: 'A' | 'B') => (form === 'B' && draft.exitTicketFormB ? draft.exitTicketFormB : draft.exitTicket);
  const renderSlip = (form: 'A' | 'B') => {
    const ticket = formOf(form);
    return `<div class="slip">${head(`${course} &middot; ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day'} &middot; ${esc(draft.nextLessonDate)} &middot; Form ${form}`, `Exit Ticket &mdash; ${esc(ticket.title || draft.nextLessonTitle)}`)}<p class="sans">Name ${F('l')} &nbsp; Period <span class="pbox"></span> Date ${F()}</p><p class="sans" style="font-size:8.4pt">In the box: write ${esc(period)} (your class period, not your grade). A blank answer tells me something different from a wrong answer.</p><div class="qs3">${ticket.items.slice(0, 3).map((q, i) => `<div class="q"><b>${i + 1}</b><span class="math">${math(q.prompt)}</span></div><div class="ruleline"></div><div class="ruleline"></div>`).join('')}</div><p class="sans" style="margin-top:8px">How sure are you? (circle) &nbsp; 1 not yet &nbsp; 2 a little &nbsp; 3 mostly &nbsp; 4 I could teach it</p></div>`;
  };
  return H + '<style>@page{margin:6mm 11mm}.slip{font-size:11pt}</style>' + renderSlip('A') + renderSlip('B') + E;
}

export function answerKeyHtml(draft: NextDayDraft) {
  const course = courseOf(draft);
  const rows = draft.worksheet.items.map((it) => `<tr><td>${it.itemNumber}</td><td>${math(it.workedSolution || it.verify || '')}<br><b>${math(it.answer || (it.answerNumeric ?? ''))}</b></td><td>${math(it.answerNumeric ?? it.answer)}</td><td>${math(it.skillTag || 'Check the method and the final value.')}</td><td>${math(it.errorTagIfWrong || 'Record the written error.')}</td></tr>`).join('');
  const totals = draft.grouping.groups.map((group, index) => `<tr><td>${index + 1}</td><td>${group.itemNumbers.join(', ')}</td><td><b>${group.checkTotal}</b></td><td>${firstSixTotal(draft, group.itemNumbers)}</td></tr>`).join('');
  const exitRowsFor = (ticket: NextDayDraft['exitTicket'], form: string) =>
    ticket.items.map((it) => `<tr><td>Form ${esc(form)} &middot; ${it.itemNumber}</td><td><b>${math(it.answer || (it.answerNumeric ?? ''))}</b>${it.workedSolution ? `<br>${math(it.workedSolution)}` : ''}</td><td>${math(it.skillTag || '')}</td></tr>`).join('');
  const exitRows = exitRowsFor(draft.exitTicket, 'A') + (draft.exitTicketFormB ? exitRowsFor(draft.exitTicketFormB, 'B') : '');
  return H + head(`Teacher copy &middot; ${course} &middot; ${esc(draft.className)} &middot; ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day'} &middot; every value verified before print`, `${esc(draft.nextLessonTitle)} &mdash; Answer key and grading table`) +
    `<table><tr><th>#</th><th>Answer</th><th>Strip</th><th>What to look for</th><th>Wrong answer &rarr; note</th></tr>${rows}</table>` +
    `<h2>Check totals</h2><table><tr><th>Set</th><th>Items</th><th>Check total</th><th>First-six subtotal</th></tr>${totals}</table>` +
    `<h2>Exit-ticket key</h2><table><tr><th>#</th><th>Answer</th><th>Skill</th></tr>${exitRows}</table>` +
    `<div class="foot">Regents-style item: item ${draft.worksheet.items.at(-1)?.itemNumber ?? 14}, written to the released-question pattern unless the TIP alignment note marks it not met.</div>` + E;
}

export function whoDoesWhichHtml(draft: NextDayDraft) {
  const SETS = setMap(draft);
  const TOT = totalMap(draft);
  const teacherRows: [string, number, string, string][] = [];
  draft.grouping.groups.forEach((group, index) => {
    group.students.forEach((student) => teacherRows.push([studentBoardName(student), index + 1, student.evidence, '']));
  });
  const groups = Object.fromEntries(draft.grouping.groups.map((group, index) => [String(index + 1), group.students.map(studentBoardName)]));
  return H + head(`Teacher copy &middot; ${esc(draft.className)} &middot; ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day'} &middot; sets carried from ${esc(draft.builtFrom.worksheetCode)}`, `${esc(draft.nextLessonTitle)} &mdash; Who Does Which Problems`) +
    `<div class="banner">These sets come from item marks on the last received results. <b>No paper handed in = Set 2</b>; never guess an unmatched paper.</div>` +
    `<table><tr><th>Set</th><th>Items</th><th>Check total</th><th>First-six</th><th>What the set is for</th></tr>${draft.grouping.groups.map((group, index) => `<tr><td>${index + 1}</td><td>${group.itemNumbers.join(', ')}</td><td><b>${group.checkTotal}</b></td><td>${firstSixTotal(draft, group.itemNumbers)}</td><td>${index === 0 ? 'Repair-heavy work from the last ticket.' : index === draft.grouping.groups.length - 1 ? 'Secure students extend and explain.' : 'Core practice with repair mixed in.'}</td></tr>`).join('')}</table>` +
    settable(teacherRows, 2, SETS, TOT) +
    `<h2>How a student got their set</h2><p>Placement comes from item marks, not the percentage score. A half-credit mark never moves a student down. No paper handed in means Set 2.</p><p><b>Two rules that never change: the Scan Scholar score never places anybody, and an M mark never moves a student down.</b></p>` +
    board(`${periodDigit(draft) ? `Period ${periodDigit(draft)}` : draft.className} &middot; find your name`, groups as Record<string, string[]>, SETS, TOT, 2) + E;
}

export function teacherListHtml(draft: NextDayDraft) {
  const rows = draft.grouping.groups.flatMap((group, index) => group.students.map((student) => `<tr><td><b>${esc(studentBoardName(student))}</b></td><td>${index + 1}</td><td>${group.itemNumbers.join(', ')}</td><td><b>${group.checkTotal}</b></td><td>${math(student.evidence)}</td></tr>`)).join('') +
    draft.grouping.noResultsYet.map((student) => `<tr><td><b>${esc(studentBoardName(student))}</b></td><td>Set by hand</td><td>&mdash;</td><td>&mdash;</td><td>No results received yet; do not guess.</td></tr>`).join('');
  return H + head(`Teacher copy &middot; ${esc(draft.className)} &middot; ${esc(draft.nextLessonDate)}`, 'Who Does Which &mdash; Teacher List') +
    `<table><tr><th>Student</th><th>Set</th><th>Items</th><th>Check total</th><th>Evidence from their paper</th></tr>${rows}</table>` + E;
}

export function formatCoverageRows(draft: NextDayDraft): CoverageRow[] {
  const items = draft.worksheet.items;
  const has14 = items.length === 14;
  const integers = [...items, ...draft.exitTicket.items].filter((it) => typeof it.answerNumeric === 'number').every((it) => Number.isInteger(it.answerNumeric));
  const realItem = items.find((it, index) => worksheetTag(draft, it, index).includes('real paper'));
  const regents = items.at(-1);
  const square = items[10];
  const diamond = items[12];
  const totals = draft.grouping.groups.map((group, index) => `Set ${index + 1}: ${group.checkTotal}`).join('; ');
  const firstSix = draft.grouping.groups.map((group, index) => `Set ${index + 1}: ${firstSixTotal(draft, group.itemNumbers)}`).join('; ');
  const answerList = items.map((it) => `${it.itemNumber}=${it.answerNumeric ?? it.answer}`).join(', ');
  const exitAnswers = draft.exitTicket.items.map((it) => `Q${it.itemNumber}: ${it.answer ?? it.answerNumeric}`).join('; ');
  const rows: CoverageRow[] = [
    { element: 'Four sides, fixed purpose', where: 'Sides 1&ndash;4', what: 'Side 1 is guided, Side 2 is the help card, and Sides 3&ndash;4 carry the common independent pool and strip.' },
    { element: 'Header, name line, period as a digit', where: 'Side 1; tickets', what: `The worksheet and slips include Name, Date, and Period &mdash; write ${esc(periodDigit(draft) || 'the digit')}.` },
    { element: 'Side tabs', where: 'Sides 1&ndash;4', what: 'Each worksheet side has a black or dark-red side tab naming its purpose.' },
    { element: 'Banner stating the aim', where: 'Side 1', what: `The banner states the aim: ${math(draft.lessonPlan.aim || draft.nextLessonTitle)}.` },
    { element: 'Numbered sections', where: 'Side 1', what: 'Side 1 uses numbered sections for the guided launch, repair, check, and independent-work setup.' },
    { element: 'Help card, four parts', where: 'Side 2', what: 'The help card includes a decision flow, vocabulary table, two worked examples, and a before-you-hand-this-in checklist.' },
    { element: '14 items, 4 / 4 / 3 / 3 — list the actual item numbers in each band', where: has14 ? 'Items 1&ndash;14' : '<b>Not met</b>', what: has14 ? `Foundation: ${items.slice(0,4).map(i=>i.itemNumber).join(', ')}; core: ${items.slice(4,8).map(i=>i.itemNumber).join(', ')}; extension: ${items.slice(8,11).map(i=>i.itemNumber).join(', ')}; depth: ${items.slice(11,14).map(i=>i.itemNumber).join(', ')}.` : `This draft has ${items.length} items, not 14.`, met: has14 },
    { element: 'One item from a real paper — name the item number', where: realItem ? `Item ${realItem.itemNumber}` : '<b>Not met</b>', what: realItem ? `Item ${realItem.itemNumber} quotes an actual wrong answer from the received results with the name removed.` : 'No received wrong-answer quote could be attached to a worksheet item.', met: !!realItem },
    { element: 'One Regents-style item — name the item number, and the released question if one was used', where: regents ? `Item ${regents.itemNumber}` : '<b>Not met</b>', what: regents ? `Item ${regents.itemNumber} is tagged Regents style; no released question number was supplied in the source data.` : 'No Regents-style item is present.', met: !!regents },
    { element: 'The ■ → ◆ Set 4 pair — name both item numbers, square first', where: square && diamond ? `Items ${square.itemNumber}, ${diamond.itemNumber}` : '<b>Not met</b>', what: square && diamond ? `The square task is item ${square.itemNumber}; the diamond follow-up is item ${diamond.itemNumber}.` : 'The draft did not contain enough items to place the square/diamond pair.', met: !!(square && diamond) },
    { element: 'Nothing reveals difficulty', where: 'Student sheet and board deck', what: 'The sheet is common to everyone. The board version shows names, item numbers, and check totals only; reasons stay on the teacher list.' },
    { element: 'Four sets of 8, check totals — print all four totals', where: draft.grouping.groups.length === 4 ? 'Key, list, strip' : '<b>Not met</b>', what: draft.grouping.groups.length === 4 ? totals : `This draft has ${draft.grouping.groups.length} groups. ${totals}`, met: draft.grouping.groups.length === 4 },
    { element: 'Every answer an integer — list them, or say plainly it is not met', where: integers ? 'Whole sheet' : '<b>Not met</b>', what: integers ? answerList : `Not every answer is an integer. This is expected for some Statistics work; current values are ${answerList}.`, met: integers },
    { element: 'First-six subtotal — print all four', where: 'Key and teacher list', what: firstSix },
    { element: 'Exit tickets, two forms — name Form A\'s and Form B\'s answers', where: 'Exit-ticket page', what: `Form A and Form B use the same skills with alternate forms; answers: ${math(exitAnswers)}.` },
    { element: 'Answer key, five columns', where: 'Answer key', what: 'The key table has #, Answer, Strip, What to look for, and Wrong answer &rarr; note.' },
    { element: 'Who Does Which, both versions', where: 'Key, list, strip', what: 'The teacher copy includes set, evidence, items, and totals; the board version removes reasons and set labels.' },
    { element: 'Verification before print — say what was proved and that the pages were inspected', where: 'Build', what: `Verified item arithmetic is printed on the key. Pages use the fixed Hillcrest stylesheet and are generated as print documents for inspection before distribution.` },
  ];
  return rows;
}

export function coverageNoteHtml(rows: CoverageRow[]) {
  const broken = rows.filter((row) => row.met === false);
  if (broken.length === 0) return '';
  return `<div class="gbox k"><b>Format exception:</b> ${broken.map((row) => esc(row.element)).join('; ')}. The teacher can live with it for this lesson, change the pack, or change the rule.</div>`;
}

const textOnly = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&middot;/g, '·').replace(/&rarr;/g, '→');

export function houseFormatLine(draft: NextDayDraft) {
  const rows = formatCoverageRows(draft);
  const by = (element: string) => rows.find((row) => row.element.startsWith(element));
  return `${textOnly(by('Four sides')?.where || 'Sides 1–4')}; item banding ${textOnly(by('14 items')?.what || '')}; check totals ${textOnly(by('Four sets')?.what || '')}; real-paper ${textOnly(by('One item from a real paper')?.where || 'Not met')}; Regents ${textOnly(by('One Regents-style')?.where || 'Not met')}; ■→◆ pair ${textOnly(by('The ■')?.where || 'Not met')}; ${textOnly(by('Verification')?.what || 'every value verified before printing')}.`;
}

export function tipAlignmentRows(draft: NextDayDraft): TipPlanRow[] {
  const periodRows = lessonPeriodRows(draft);
  const totalMinutes = periodRows.reduce((sum, row) => sum + row.minutes, 0);
  const minuteChain = periodRows.map((row) => `${row.minutes} min ${textOnly(row.label)} (slides ${textOnly(row.slides)})`).join(' → ');
  const reteachItems = draft.lessonPlan.reteach.items.map((item) => `item ${item.itemNumber}${item.percentCorrect !== null && item.percentCorrect !== undefined ? ` at ${item.percentCorrect}%` : ''}`).join(', ') || 'no RETEACH item marked';
  const regents = draft.worksheet.items.at(-1)?.itemNumber ?? 'not set';
  const groups = draft.grouping.groups.map((group, index) => `Set ${index + 1}: items ${group.itemNumbers.join(', ')} (check ${group.checkTotal}; first six ${firstSixTotal(draft, group.itemNumbers)})`).join('; ');
  const bands = draft.worksheet.items.length >= 14
    ? `14-item pool banded 4 foundation (${draft.worksheet.items.slice(0,4).map(i=>i.itemNumber).join(', ')}), 4 core (${draft.worksheet.items.slice(4,8).map(i=>i.itemNumber).join(', ')}), 3 extension (${draft.worksheet.items.slice(8,11).map(i=>i.itemNumber).join(', ')}), 3 depth (${draft.worksheet.items.slice(11,14).map(i=>i.itemNumber).join(', ')}).`
    : `Item pool has ${draft.worksheet.items.length} items, so the 4/4/3/3 band is not met.`;
  const sideProgression = `Side 1 guided launch and repair; Side 2 help card and vocabulary; Sides 3–4 independent pool; exit ticket closes the period.`;
  return [
    {
      prescribed: 'Workshop structure in a math classroom',
      where: `${minuteChain}. Total timed badges: ${totalMinutes} min.`,
      artifact: `Lesson deck timed slides, worksheet Sides 1–4, exit ticket, and the period table in this plan.`,
      met: totalMinutes === (draft.lessonPlan.durationMinutes || 45),
    },
    {
      prescribed: 'Checks for understanding and exit tickets aligned to Regents expectations',
      where: `Checks happen during ${periodRows.filter((row) => /check|ticket|debrief|do now|reteach/i.test(`${row.label} ${row.detail}`)).map((row) => `${row.minutes} min ${textOnly(row.label)} (slides ${textOnly(row.slides)})`).join('; ') || 'the timed lesson blocks'}; exit ticket is ${draft.exitTicket.items.length} question(s); Regents-style item is item ${regents}.`,
      artifact: `Exit ticket, answer key, and worksheet item ${regents}.`,
      met: !!draft.exitTicket.items.length && !!draft.worksheet.items.at(-1),
    },
    {
      prescribed: 'Weekly analysis of student work to identify instructional trends',
      where: `Source: ${draft.builtFrom.worksheetCode}, ${draft.builtFrom.papers} paper(s) from ${draft.builtFrom.studentCount} student(s), scored item by item rather than by percentage; RETEACH calls: ${reteachItems}.`,
      artifact: `Paper-scan results digest, reteach table, lesson plan Built from row, and answer-key error notes.`,
      met: draft.builtFrom.papers > 0,
    },
    {
      prescribed: 'Tiered tasks and scaffolded problems',
      where: `Sides 3–4: four sets of eight items drawn from a ${bands} ${groups}. Side 2 help card carries the scaffold; first-six subtotals support reduced assignments.`,
      artifact: `Worksheet Side 2, worksheet Sides 3–4, answer key check-total table, Who Does Which teacher list, board deck.`,
      met: draft.grouping.groups.length === 4 && draft.worksheet.items.length === 14,
    },
    {
      prescribed: 'Each lesson structured with a clear progression',
      where: `${sideProgression} Calendar position: ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'day not set'}; ${minuteChain}.`,
      artifact: `Lesson plan, deck slide order, worksheet side tabs, and calendar row.`,
      met: periodRows.length > 0,
    },
  ];
}

export function tipFindingRows(draft: NextDayDraft): TipFindingRow[] {
  const periodRows = lessonPeriodRows(draft);
  const totalMinutes = periodRows.reduce((sum, row) => sum + row.minutes, 0);
  return [
    {
      finding: '“No differentiation, all students given the same task regardless of readiness” (April)',
      answer: `The room contains four sets of eight item numbers, each with a check total, built from the received item marks. The teacher list shows evidence for placement; the student sheet remains common.`,
    },
    {
      finding: '“Students working on different tasks simultaneously without clear directions or regrouping” (April)',
      answer: `This design answers both April findings at once: the differentiation is carried on one identical sheet, same four sides, same 14 items, same number of items each; only the list of eight numbers differs, and that list is on the board beside the student's name. Nothing on the sheet says which set anyone is on.`,
    },
    {
      finding: 'Absence of an exit ticket (December)',
      answer: `The pack includes a two-form exit ticket with ${draft.exitTicket.items.length} question(s), two per page, and the answer key prints the answers by skill.`,
      met: draft.exitTicket.items.length > 0,
    },
    {
      finding: '“Little or no monitoring of student understanding”',
      answer: `Monitoring appears in timed checks, answer strips, check totals, first-six subtotals, debrief answers, and the next-day digest built from ${draft.builtFrom.papers} received paper(s).`,
      met: draft.builtFrom.papers > 0,
    },
    {
      finding: '“Unrealistic time allocations” (April)',
      answer: `The period table and deck badges are generated from the same timing data and add to ${totalMinutes} minutes for a ${draft.lessonPlan.durationMinutes || 45}-minute period.`,
      met: totalMinutes === (draft.lessonPlan.durationMinutes || 45),
    },
  ];
}

export function tipExceptionHtml(rows: Array<{ prescribed?: string; finding?: string; met?: boolean }>) {
  const broken = rows.filter((row) => row.met === false);
  if (broken.length === 0) return '';
  return `<div class="gbox k"><b>TIP alignment exception:</b> ${broken.map((row) => esc(row.prescribed || row.finding || 'row')).join('; ')}. The teacher can live with it for this lesson, change the pack, or change the rule.</div>`;
}

/** True when this lesson touches sequences — the four-rules section is required. */
export function isSequencesLesson(draft: NextDayDraft) {
  const haystack = `${draft.nextLessonTitle} ${draft.lessonPlan.aim} ${draft.lessonPlan.title} ${draft.worksheet.title}`.toLowerCase();
  return /sequence|recursive|explicit|arithmetic|geometric|nth term/.test(haystack);
}

/**
 * The four rules — required in every sequences lesson. Examples are read off
 * the day's own worksheet so the plan and the sheet point at each other.
 */
export function fourRulesHtml(draft: NextDayDraft) {
  if (!isSequencesLesson(draft)) return '';
  const items = draft.worksheet.items;
  const find = (re: RegExp) => items.find((i) => re.test(`${i.prompt} ${i.workedSolution || ''}`));
  const arith = find(/20,\s*17,\s*14|\+\s*d|common difference|4n\s*\+\s*2/) || items[0];
  const geo = find(/2\u207F|geometric|\u00B7\s*2|\u00B7\s*4|3,\s*6,\s*12/) || items.at(-1);
  const findTerm = find(/which term|equals/) || items[0];
  const ref = (i?: WorksheetItemDraft) => (i ? `[item ${i.itemNumber}]` : '');

  return `<h2>The four rules &mdash; what to teach and how to say it</h2>` +
    `<table><tr><th></th><th>Recursive &mdash; one step at a time</th><th>Explicit &mdash; straight to term n</th></tr>` +
    `<tr><th><b>Arithmetic</b> (add the same number d)</th><td>a<sub>1</sub> = first term, a<sub>n</sub> = a<sub>n&minus;1</sub> + d</td><td>a<sub>n</sub> = a<sub>1</sub> + d(n &minus; 1)</td></tr>` +
    `<tr><th><b>Geometric</b> (multiply by the same number r)</th><td>a<sub>1</sub> = first term, a<sub>n</sub> = r &middot; a<sub>n&minus;1</sub></td><td>a<sub>n</sub> = a<sub>1</sub> &middot; r<sup>n&minus;1</sup></td></tr></table>` +

    `<h2>Recursive rule &mdash; arithmetic and geometric</h2><ul>` +
    `<li><b>What it says:</b> start here, then do this to get the next term. It always has <b>two parts</b>: the first term and the step. A rule with only the step describes every sequence with that step and cannot say which one.</li>` +
    `<li><b>Arithmetic:</b> the step is <i>add d</i>, and d is negative when the terms go down. ${ref(arith)} ${arith ? math(arith.prompt) : ''}</li>` +
    `<li><b>Geometric:</b> the step is <i>multiply by r</i>. ${ref(geo)} ${geo ? math(geo.prompt) : ''}</li>` +
    `<li><b>Say it out loud first:</b> &ldquo;The first term is ___ and each term is ___ the one before.&rdquo; A sentence like &ldquo;keep subtracting 3&rdquo; is not a rule.</li>` +
    `<li><b>Its weakness:</b> reaching term 50 means walking through the 49 before it. That is why the explicit rule exists.</li></ul>` +

    `<h2>Explicit rule &mdash; arithmetic and geometric</h2><ul>` +
    `<li><b>What it says:</b> put in the position n, get the term.</li>` +
    `<li><b>Arithmetic:</b> ${ref(arith)} ${arith ? `${math(arith.workedSolution || arith.verify)} &rarr; <b>${math(arith.answer)}</b>` : ''}</li>` +
    `<li><b>Geometric:</b> ${ref(geo)} ${geo ? `${math(geo.workedSolution || geo.verify)} &rarr; <b>${math(geo.answer)}</b>` : ''}</li>` +
    `<li><b>Why n &minus; 1, in both:</b> count the jumps, not the terms. The first term has had no jumps. Four terms, three arrows.</li>` +
    `<li><b>The one check that catches the mistake:</b> put n = 1 in and you must get the first term back. 3 &middot; 2<sup>n</sup> gives 6 at n = 1, not 3 &mdash; the geometric version of the same n &minus; 1 slip.</li></ul>` +

    `<h2>Moving between them, and telling them apart</h2><ul>` +
    `<li><b>Arithmetic or geometric?</b> Subtract neighbouring terms &mdash; same every time &rarr; arithmetic, that number is d. Divide &mdash; same every time &rarr; geometric, that number is r. Neither &rarr; say neither.</li>` +
    `<li><b>Recursive &rarr; explicit:</b> read a<sub>1</sub> and d (or r) off the recursive rule and substitute.</li>` +
    `<li><b>Explicit &rarr; recursive:</b> the coefficient of n is d; put n = 1 to get a<sub>1</sub>. ${ref(findTerm)}</li>` +
    `<li><b>Where it goes next:</b> arithmetic is linear (d is the slope), geometric is exponential (r is the base); a sequence is only the points n = 1, 2, 3, &hellip;</li></ul>`;
}



export function lessonPlanHtml(draft: NextDayDraft) {
  const tipRows = tipAlignmentRows(draft);
  const findingRows = tipFindingRows(draft);
  const tipTable = tipRows.map((row) => `<tr><td><b>${esc(row.prescribed)}</b></td><td><span class="mono">${row.met === false ? '<b>Not met</b><br>' : ''}${math(row.where)}</span></td><td>${math(row.artifact)}</td></tr>`).join('');
  const findingTable = findingRows.map((row) => `<tr><td><i>${math(row.finding)}</i></td><td>${row.met === false ? '<b>Not met</b><br>' : ''}${math(row.answer)}</td></tr>`).join('');
  const totalSlides = lessonDeckSlideCount(draft);
  const materials = [`Slides (${totalSlides}, the last two teacher-reference — hide them before you present)`, 'Worksheet, four sides', 'Exit tickets, Form A and Form B', 'Who Does Which list and board deck', ...(draft.lessonPlan.materials || [])];
  const periodRows = lessonPeriodRows(draft);
  return H + head(`Teacher copy &middot; ${esc(courseOf(draft))} &middot; ${esc(draft.className)} &middot; Hillcrest 28Q505 &middot; Mr. Francois`, `${esc(draft.nextLessonTitle)} &mdash; Lesson plan`) +
    `<table><tr><th>Date and topic</th><td>${esc(draft.nextLessonDate)} &middot; ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day not set'} &middot; ${esc(draft.nextLessonTitle)}</td></tr><tr><th>Aim</th><td><b>${math(draft.lessonPlan.aim || draft.nextLessonTitle)}</b></td></tr><tr><th>Students will</th><td><ol><li>${math(draft.lessonPlan.objective || 'Repair the skill named by the last results.')}</li><li>Use the help card to complete assigned items.</li><li>Check answers against a total before handing in work.</li></ol></td></tr><tr><th>Built from</th><td>${builtFromLine(draft)}</td></tr><tr><th>Materials</th><td>${materials.map((m) => esc(m)).join('<br>')}</td></tr></table>` +
    `<h2>Standards</h2><p>${stdChips(draft) || `<span class="mono">${esc(standardsText(draft))}</span>`}</p>` +
    fourRulesHtml(draft) +
    `<h2>The period</h2><table><tr><th>Min</th><th>Slides</th><th>What happens</th></tr>${periodRows.map((step) => `<tr><td>${step.minutes}</td><td>${step.slides}</td><td><b>${math(step.label)}</b><br>${math(step.detail)}</td></tr>`).join('')}</table>` +
    `<h2>TIP alignment &mdash; what the plan prescribes and where it happens today</h2><p class="sans" style="font-size:8.2pt">The activities are the ones prescribed in the observation report; each row names the minutes in which the activity happens and the artifact that shows it.</p><table><tr><th>What the plan prescribes</th><th>Where it happens in this period</th><th>The artifact that evidences it</th></tr>${tipTable}</table>${tipExceptionHtml(tipRows)}` +
    `<h2>The findings this lesson answers</h2><table><tr><th>The finding, as written</th><th>What this lesson puts in front of the observer</th></tr>${findingTable}</table>${tipExceptionHtml(findingRows)}` +
    `<div class="gbox"><div class="cap">Source</div><p>${esc(TIP_SOURCE_TEXT)}</p></div>` +
    `<p class="sans" style="font-size:8.2pt"><b>House format:</b> ${math(houseFormatLine(draft))}</p>` +
    `<h2>Where this sits on the calendar</h2><table><tr><th>Yesterday</th><td>${esc(draft.builtFrom.worksheetTitle)}</td></tr><tr><th>Today</th><td>${esc(draft.nextLessonTitle)}</td></tr><tr><th>Tomorrow</th><td>Next pacing-calendar lesson.</td></tr><tr><th>Regents</th><td>Thursday 17 June 2027 &mdash; this skill supports the sequence/function work students will need there.</td></tr></table>` +
    `<h2>Supports</h2><table><tr><th>Scaffold</th><th>How it appears</th></tr><tr><td>Flowchart</td><td>Side 2 help card.</td></tr><tr><td>Pre-made answer strip</td><td>Side 4 strip and board check total.</td></tr><tr><td>Co-teacher cue</td><td>During independent work, compare strips to totals and pull students whose totals do not match.</td></tr></table>` + E;
}

export function presentationPdfHtml(draft: NextDayDraft) {
  const entries = lessonDeckEntries(draft);
  const standards = standardsText(draft);
  const footer = `${courseOf(draft)} · ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day'} · ${draft.nextLessonTitle} · ${draft.nextLessonDate}`;
  const slideHtml = entries.map((entry) => {
    const badge = typeof entry.minutes === 'number' ? `<span class="mono" style="background:#111;color:#fff;padding:2px 7px">${entry.minutes} min</span>` : '';
    const rows = entry.kind === 'key-vocabulary'
      ? `<table><tr><th>Word</th><th>What it means</th></tr>${vocabularyRows(draft).map(([word, meaning]) => `<tr><td><b>${esc(word)}</b></td><td>${esc(meaning)}</td></tr>`).join('')}</table>`
      : `<ul>${entry.bullets.slice(0, 5).map((bullet) => `<li>${math(bullet)}</li>`).join('')}</ul>`;
    return `<section class="pb"><div class="side">Slide ${entry.slideNumber}</div> ${badge}<h2>${math(entry.title)}</h2>${rows}<div class="foot">${esc(footer)}<span style="float:right">${esc(standards)}</span></div></section>`;
  }).join('');
  const tipOne = tipAlignmentRows(draft).map((row) => `<tr><td><b>${esc(row.prescribed)}</b></td><td>${row.met === false ? '<b>Not met</b><br>' : ''}${math(row.where)}</td></tr>`).join('');
  const tipTwo = tipFindingRows(draft).map((row) => `<tr><td><i>${math(row.finding)}</i></td><td>${row.met === false ? '<b>Not met</b><br>' : ''}${math(row.answer)}</td></tr>`).join('');
  return H + '<style>@page{size:13.333in 7.5in;margin:8mm 10mm}body{font-size:13pt}.pb{min-height:6.8in}li{margin:7px 0 7px 22px}.side{margin-top:2px}</style>' +
    slideHtml +
    `<section class="pb"><div class="side">TEACHER REFERENCE · NOT FOR DISPLAY</div><h2>TIP alignment &mdash; what the plan prescribes</h2><table><tr><th>Prescribed activity</th><th>Where it happens today</th></tr>${tipOne}</table><div class="foot">Teacher reference · keep this out of presentation mode</div></section>` +
    `<section class="pb"><div class="side">TEACHER REFERENCE · NOT FOR DISPLAY</div><h2>TIP alignment &mdash; the findings this answers</h2><table><tr><th>Finding</th><th>Where it happens today</th></tr>${tipTwo}</table><div class="foot">Teacher reference · keep this out of presentation mode</div></section>` + E;
}

export function printPackHtml(draft: NextDayDraft) {
  return worksheetHtml(draft).replace('</body></html>', '') + '<div class="pb"></div>' + exitTicketsHtml(draft).replace(H, '').replace(E, '') + '<div class="pb"></div>' + answerKeyHtml(draft).replace(H, '').replace(E, '') + E;
}

export function calendarLessonHtml(input: { className: string; dateLabel: string; dayNumber: number | null; title: string; unitLabel: string | null; standards: string[] }) {
  return H + head(`Teacher copy &middot; ${esc(input.className)} &middot; ${esc(input.dateLabel)}`, `${esc(input.title)} &mdash; Calendar lesson`) +
    `<div class="banner">No scored results have been received for this class, so this plan contains no class data &mdash; only the calendar lesson.</div>` +
    `<table><tr><th>Date and topic</th><td>${esc(input.dateLabel)}${input.dayNumber ? ` &middot; Day ${input.dayNumber}` : ''}${input.unitLabel ? ` &middot; ${esc(input.unitLabel)}` : ''}</td></tr><tr><th>Standards</th><td>${input.standards.map((s) => `<span class="std">${esc(s)}</span>`).join(' ')}</td></tr></table>` +
    `<h2>The period</h2><table><tr><th>Min</th><th>What happens</th></tr><tr><td>5</td><td>Do now</td></tr><tr><td>10</td><td>Launch the new idea</td></tr><tr><td>15</td><td>Worked examples together</td></tr><tr><td>10</td><td>Independent practice</td></tr><tr><td>5</td><td>Exit ticket</td></tr></table><h2>Notes</h2><div class="gbox" style="height:160px"></div>` + E;
}

export function speakerNoteWithFormat(slide: { kind: string; speakerNotes?: string }, index: number) {
  const existing = slide.speakerNotes?.trim() || 'Say the answers out loud and connect this slide to the printed material.';
  if (/^\[Format:/.test(existing)) return existing;
  const tagByKind: Record<string, string> = {
    title: 'pacing calendar and evidence source',
    'do-now': 'Side 1, section 1 - do now',
    'key-vocabulary': 'Side 2 help card - key vocabulary',
    'reteach-worked': 'the real-paper item',
    teaching: `Side 1, section ${Math.min(4, index + 1)}`,
    'independent-work': 'Sides 3-4 - independent problem pool',
    'exit-ticket': 'exit tickets, two forms',
    debrief: 'answer key and strip check',
  };
  return `[Format: ${tagByKind[slide.kind] || 'lesson slide'}.] ${existing}`;
}
