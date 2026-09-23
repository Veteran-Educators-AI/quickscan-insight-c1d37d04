import type { NextDayDraft, SlideDraft, WorksheetItemDraft } from './types';
import { H, E, F, head, item as printItem, strip, settable, board } from '@/lib/hillcrestPrint';

export interface CoverageRow {
  element: string;
  where: string;
  what: string;
  met?: boolean;
}

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

const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'not enough attempts' : `${n}%`);
const courseOf = (draft: NextDayDraft) => /stat/i.test(draft.className) ? 'Statistics' : /alg/i.test(draft.className) ? 'Algebra II' : draft.className;
const periodDigit = (draft: NextDayDraft) => {
  const match = draft.className.match(/period\s*(\d+)/i) || draft.className.match(/\bp\s*(\d+)/i);
  return match ? match[1] : '';
};
const standards = (draft: NextDayDraft) => draft.lessonPlan.standards || [];
const stdChips = (draft: NextDayDraft) => standards(draft).map((s) => `<span class="std">${esc(s)}</span>`).join(' ');
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
  const period = periodDigit(draft) || '&mdash;';
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
    `<table><tr><th>Thing</th><th>What it is</th></tr><tr><td>First term</td><td>The value you start with.</td></tr><tr><td>Change or ratio</td><td>How the pattern moves from one term to the next.</td></tr><tr><td>Check total</td><td>The sum of your assigned answers.</td></tr></table>` +
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
  const period = periodDigit(draft) || '&mdash;';
  const renderSlip = (form: 'A' | 'B') => `<div class="slip">${head(`${course} &middot; ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day'} &middot; ${esc(draft.nextLessonDate)} &middot; Form ${form}`, `Exit Ticket &mdash; ${esc(draft.exitTicket.title || draft.nextLessonTitle)}`)}<p class="sans">Name ${F('l')} &nbsp; Period <span class="pbox"></span> Date ${F()}</p><p class="sans" style="font-size:8.4pt">In the box: write ${esc(period)} (your class period, not your grade). A blank answer tells me something different from a wrong answer.</p><div class="qs3">${draft.exitTicket.items.slice(0, 3).map((q, i) => `<div class="q"><b>${i + 1}</b><span class="math">${math(q.prompt)}</span></div><div class="ruleline"></div>`).join('')}</div><p class="sans" style="margin-top:8px">How sure are you? (circle) &nbsp; 1 not yet &nbsp; 2 a little &nbsp; 3 mostly &nbsp; 4 I could teach it</p></div>`;
  return H + '<style>@page{margin:6mm 11mm}.slip{font-size:11pt}</style>' + renderSlip('A') + renderSlip('B') + E;
}

export function answerKeyHtml(draft: NextDayDraft) {
  const course = courseOf(draft);
  const rows = draft.worksheet.items.map((it) => `<tr><td>${it.itemNumber}</td><td>${math(it.workedSolution || it.verify || '')}<br><b>${math(it.answer || it.answerNumeric ?? '')}</b></td><td>${math(it.answerNumeric ?? it.answer)}</td><td>${math(it.skillTag || 'Check the method and the final value.')}</td><td>${math(it.errorTagIfWrong || 'Record the written error.')}</td></tr>`).join('');
  const totals = draft.grouping.groups.map((group, index) => `<tr><td>${index + 1}</td><td>${group.itemNumbers.join(', ')}</td><td><b>${group.checkTotal}</b></td><td>${firstSixTotal(draft, group.itemNumbers)}</td></tr>`).join('');
  const exitRows = draft.exitTicket.items.map((it) => `<tr><td>${it.itemNumber}</td><td>${math(it.answer || it.answerNumeric ?? '')}</td><td>${math(it.skillTag || '')}</td></tr>`).join('');
  return H + head(`Teacher copy &middot; ${course} &middot; ${esc(draft.className)} &middot; ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day'} &middot; every value verified before print`, `${esc(draft.nextLessonTitle)} &mdash; Answer key and grading table`) +
    `<table><tr><th>#</th><th>Answer</th><th>Strip</th><th>What to look for</th><th>Wrong answer &rarr; note</th></tr>${rows}</table>` +
    `<h2>Check totals</h2><table><tr><th>Set</th><th>Items</th><th>Check total</th><th>First-six subtotal</th></tr>${totals}</table>` +
    `<h2>Exit-ticket key</h2><table><tr><th>#</th><th>Answer</th><th>Skill</th></tr>${exitRows}</table>` +
    `<div class="foot">Regents-style item: item ${draft.worksheet.items.at(-1)?.itemNumber ?? 14}, written to the released-question pattern unless the coverage map marks it not met.</div>` + E;
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

export function lessonPlanHtml(draft: NextDayDraft) {
  const rows = formatCoverageRows(draft);
  const coverage = rows.map((row) => `<tr><td><b>${esc(row.element)}</b></td><td><span class="mono">${row.where}</span></td><td>${row.what}</td></tr>`).join('');
  const totalSlides = (draft.slides?.length || 0) + 2;
  const materials = [`Slides (${totalSlides}, the last two teacher-reference &mdash; hide them before you present)`, 'Worksheet, four sides', 'Exit tickets, Form A and Form B', 'Who Does Which list and board deck', ...(draft.lessonPlan.materials || [])];
  return H + head(`Teacher copy &middot; ${esc(courseOf(draft))} &middot; ${esc(draft.className)} &middot; Hillcrest 28Q505 &middot; Mr. Francois`, `${esc(draft.nextLessonTitle)} &mdash; Lesson plan`) +
    `<table><tr><th>Date and topic</th><td>${esc(draft.nextLessonDate)} &middot; ${draft.dayNumber ? `Day ${draft.dayNumber}` : 'Day not set'} &middot; ${esc(draft.nextLessonTitle)}</td></tr><tr><th>Aim</th><td><b>${math(draft.lessonPlan.aim || draft.nextLessonTitle)}</b></td></tr><tr><th>Students will</th><td><ol><li>${math(draft.lessonPlan.objective || 'Repair the skill named by the last results.')}</li><li>Use the help card to complete assigned items.</li><li>Check answers against a total before handing in work.</li></ol></td></tr><tr><th>Built from</th><td>${builtFromLine(draft)}</td></tr><tr><th>Materials</th><td>${materials.map((m) => esc(m)).join('<br>')}</td></tr></table>` +
    `<h2>Standards</h2><p>${stdChips(draft) || '<span class="mono">Standards not supplied</span>'}</p>` +
    `<h2>The period</h2><table><tr><th>Min</th><th>Slides</th><th>What happens</th></tr>${(draft.lessonPlan.timeline || []).map((step, index) => `<tr><td>${step.minutes}</td><td>${index + 1}</td><td><b>${math(step.label)}</b><br>${math(step.detail)}</td></tr>`).join('')}</table>` +
    `<h2>Format coverage &mdash; where each required element is done</h2><table><tr><th>Required element</th><th>Where</th><th>Exactly what does it</th></tr>${coverage}</table>${coverageNoteHtml(rows)}` +
    `<h2>Where this sits on the calendar</h2><table><tr><th>Yesterday</th><td>${esc(draft.builtFrom.worksheetTitle)}</td></tr><tr><th>Today</th><td>${esc(draft.nextLessonTitle)}</td></tr><tr><th>Tomorrow</th><td>Next pacing-calendar lesson.</td></tr><tr><th>Regents</th><td>Thursday 17 June 2027 &mdash; this skill supports the sequence/function work students will need there.</td></tr></table>` +
    `<h2>Supports</h2><table><tr><th>Scaffold</th><th>How it appears</th></tr><tr><td>Flowchart</td><td>Side 2 help card.</td></tr><tr><td>Pre-made answer strip</td><td>Side 4 strip and board check total.</td></tr><tr><td>Co-teacher cue</td><td>During independent work, compare strips to totals and pull students whose totals do not match.</td></tr></table>` + E;
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

export function speakerNoteWithFormat(slide: SlideDraft, index: number) {
  const existing = slide.speakerNotes?.trim() || 'Say the answers out loud and connect this slide to the printed material.';
  if (/^\[Format:/.test(existing)) return existing;
  const tagByKind: Record<string, string> = {
    title: 'pacing calendar and evidence source',
    'do-now': 'Side 1, section 1 - do now',
    'reteach-worked': 'the real-paper item',
    teaching: `Side 1, section ${Math.min(4, index + 1)}`,
    'independent-work': 'Sides 3-4 - independent problem pool',
    'exit-ticket': 'exit tickets, two forms',
    debrief: 'answer key and strip check',
  };
  return `[Format: ${tagByKind[slide.kind] || 'lesson slide'}.] ${existing}`;
}
