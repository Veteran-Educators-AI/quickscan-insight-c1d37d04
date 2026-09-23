// =============================================================================
// DAY 7 — Algebra II "Explicit Formulas — The nth Term" (Wed 23 Sep 2026)
// Built around a pre-printed 10-item worksheet (Worksheet 7).
// Placements from Day 6 exit ticket ALG2-SEQ-D6-ET item marks.
// All answers verified independently before this file was written.
// =============================================================================

import type { NextDayDraft, WorksheetItemDraft, SlideDraft, StudentGroup } from './types';

const STANDARDS = ['AII-F.BF.2', 'AII-F.LE.2', 'AII-F.IF.3'];

// — Worksheet items (10, pre-printed with shapes ▲ ● ■ ◆) ——————

const W = (
  n: number, prompt: string, answer: string, answerNumeric: number,
  verify: string, skillTag: string, errorTagIfWrong: string, workedSolution: string,
  isRepair = false,
): WorksheetItemDraft => ({
  itemNumber: n,
  prompt,
  answer,
  answerNumeric,
  verify,
  verifyExpected: answerNumeric,
  skillTag,
  isRepair,
  errorTagIfWrong,
  workedSolution,
  verified: true,
  verifyNote: verify,
});

const worksheetItems: WorksheetItemDraft[] = [
  W(1, 'Write the explicit formula for 20, 17, 14, \u2026 and find a\u2081\u2085.',
    '\u221222', -22,
    'a\u2099 = 23 \u2212 3n; a\u2081\u2085 = 23 \u2212 3(15) = \u221222',
    '\u25B2 core', 'drops-negative-sign \u2014 student writes 22 instead of \u221222',
    'a\u2099 = 20 + (\u22123)(n\u22121) = 23 \u2212 3n. a\u2081\u2085 = 23 \u2212 45 = \u221222.'),
  W(2, 'Compute a\u2082\u2085 for a\u2099 = 4n + 2.',
    '102', 102,
    '4(25) + 2 = 102',
    '\u25CF foundation', 'arithmetic-error \u2014 student computes 4(25) + 2 wrong',
    'a\u2082\u2085 = 4(25) + 2 = 100 + 2 = 102.'),
  W(3, 'a\u2084 = 19 and a\u2089 = 39 \u2014 find a\u2085\u2080 and justify.',
    '203', 203,
    'd = (39\u221219)/(9\u22124) = 4; a\u2081 = 7; a\u2085\u2080 = 7 + 49(4) = 203',
    '\u25A0 extension', 'wrong-d \u2014 student uses d = 5',
    'd = (39\u221219)/(9\u22124) = 4. a\u2081 = 19\u22123(4) = 7. a\u2085\u2080 = 7 + 49(4) = 203.'),
  W(4, 'Compute a\u2087 for a\u2099 = 3 \u00B7 4\u207F\u207B\u00B9.',
    '12288', 12288,
    '3 \u00B7 4\u2076 = 3 \u00B7 4096 = 12288',
    '\u25CF foundation', 'off-by-one \u2014 student uses 3 \u00B7 4\u2077',
    'a\u2087 = 3 \u00B7 4\u207D\u2077\u2212\u00B9\u207E = 3 \u00B7 4\u2076 = 3 \u00B7 4096 = 12288.'),
  W(5, 'Test a\u2099 = 3 \u00B7 2\u207F at n = 1, fix it, find a\u2081\u2080.',
    '1536', 1536,
    '3 \u00B7 2\u00B9 = 6 \u2260 3; fix: a\u2099 = 3 \u00B7 2\u207F\u207B\u00B9; a\u2081\u2080 = 3 \u00B7 2\u2079 = 1536',
    '\u25C6 depth', 'n-vs-n-minus-1 \u2014 student keeps 3 \u00B7 2\u207F and gets 3072',
    'Test n = 1: 3 \u00B7 2\u00B9 = 6 \u2260 3. Fix: a\u2099 = 3 \u00B7 2\u207F\u207B\u00B9. Check: 3 \u00B7 2\u2070 = 3 \u2713. a\u2081\u2080 = 3 \u00B7 2\u2079 = 3 \u00B7 512 = 1536.'),
  W(6, 'Which term of 7, 11, 15, \u2026 equals 131?',
    '32', 32,
    'a\u2099 = 4n + 3; 4n + 3 = 131; n = 32',
    '\u25B2 core', 'wrong-formula \u2014 student uses 4n + 3 = 131 wrong',
    'a\u2099 = 7 + 4(n\u22121) = 4n + 3. 4n + 3 = 131 \u2192 4n = 128 \u2192 n = 32.'),
  W(7, 'State the common difference of a\u2099 = 47 \u2212 7n.',
    '\u22127', -7,
    'a\u2081 = 40, a\u2082 = 33; d = 33 \u2212 40 = \u22127',
    '\u25CF foundation', 'sign-error \u2014 student says d = 7',
    'a\u2081 = 47 \u2212 7(1) = 40. a\u2082 = 47 \u2212 7(2) = 33. d = 33 \u2212 40 = \u22127.'),
  W(8, 'Why 200 is not a term of 7, 11, 15, \u2026 and the term closest to it.',
    '199', 199,
    '4n + 3 = 200 \u2192 n = 49.25 (not integer); nearest: n = 49, a\u2084\u2089 = 199',
    '\u25A0 extension', 'rounds-up \u2014 student says 200 is a term',
    'a\u2099 = 4n + 3. 4n + 3 = 200 \u2192 n = 49.25. Not an integer. Nearest: n = 49, a\u2084\u2089 = 4(49) + 3 = 199.'),
  W(9, 'Regents style: the formula for 2, 6, 18, 54, \u2026 (choice number).',
    '2', 2,
    'r = 3; a\u2099 = 2 \u00B7 3\u207F\u207B\u00B9; check n=1: 2, n=2: 6 \u2713; choice 2',
    '\u25B2 core \u00B7 Regents style', 'wrong-choice \u2014 student picks choice 1 or 3',
    '2, 6, 18, 54: r = 3. a\u2099 = 2 \u00B7 3\u207F\u207B\u00B9. Check n=1: 2 \u2713, n=2: 6 \u2713. This is choice 2.'),
  W(10, 'Show 6 + 4(n \u2212 1) = 4n + 2; compare with y = 4x + 2; find a\u2082\u2085.',
    '102', 102,
    '6 + 4(24) = 102; 4(25) + 2 = 102 \u2713',
    '\u25C6 depth', 'no-comparison \u2014 student does not connect to y = 4x + 2',
    '6 + 4(n\u22121) = 6 + 4n \u2212 4 = 4n + 2. Matches y = 4x + 2 with x = n. a\u2082\u2085 = 4(25) + 2 = 102.'),
];

// — Exit tickets — two forms with different questions ——————

const exitTicketFormA = {
  title: 'Exit Ticket \u2014 Explicit Formulas',
  items: [
    W(1, '5, 9, 13, 17: (a) write a\u2081 and a\u2099 = a\u2099\u208B\u2081 + d (recursive); (b) write a\u2099 = \u2026 (explicit); (c) find a\u2082\u2080.',
      '81', 81, 'd = 4; a\u2099 = 4n + 1; a\u2082\u2080 = 81', 'arithmetic recursive + explicit', 'wrong-d or wrong-formula', 'd = 4; a\u2081 = 5; recursive: a\u2081 = 5, a\u2099 = a\u2099\u208B\u2081 + 4; explicit: a\u2099 = 4n + 1; a\u2082\u2080 = 4(20) + 1 = 81.'),
    W(2, '5, 10, 20, 40: (a) write a\u2081 and a\u2099 = r \u00B7 a\u2099\u208B\u2081 (recursive); (b) write a\u2099 = \u2026 (explicit); (c) find a\u2086.',
      '160', 160, 'r = 2; a\u2099 = 5 \u00B7 2\u207F\u207B\u00B9; a\u2086 = 160', 'geometric recursive + explicit', 'n-vs-n-minus-1', 'r = 2; a\u2081 = 5; recursive: a\u2081 = 5, a\u2099 = 2 \u00B7 a\u2099\u208B\u2081; explicit: a\u2099 = 5 \u00B7 2\u207F\u207B\u00B9; a\u2086 = 5 \u00B7 2\u2075 = 5 \u00B7 32 = 160.'),
    W(3, 'Which term of 30, 26, 22, \u2026 equals 2?',
      '8', 8, 'd = \u22124; a\u2099 = 34 \u2212 4n; 34 \u2212 4n = 2 \u2192 n = 8', 'arithmetic find-the-term', 'wrong-formula', 'd = \u22124; a\u2099 = 30 \u2212 4(n\u22121) = 34 \u2212 4n; 34 \u2212 4n = 2 \u2192 n = 8.'),
  ],
};

const exitTicketFormB = {
  title: 'Exit Ticket \u2014 Explicit Formulas',
  items: [
    W(1, '7, 10, 13, 16: (a) write a\u2081 and a\u2099 = a\u2099\u208B\u2081 + d (recursive); (b) write a\u2099 = \u2026 (explicit); (c) find a\u2082\u2080.',
      '64', 64, 'd = 3; a\u2099 = 3n + 4; a\u2082\u2080 = 64', 'arithmetic recursive + explicit', 'wrong-d or wrong-formula', 'd = 3; a\u2081 = 7; recursive: a\u2081 = 7, a\u2099 = a\u2099\u208B\u2081 + 3; explicit: a\u2099 = 3n + 4; a\u2082\u2080 = 3(20) + 4 = 64.'),
    W(2, '3, 12, 48, 192: (a) write a\u2081 and a\u2099 = r \u00B7 a\u2099\u208B\u2081 (recursive); (b) write a\u2099 = \u2026 (explicit); (c) find a\u2086.',
      '3072', 3072, 'r = 4; a\u2099 = 3 \u00B7 4\u207F\u207B\u00B9; a\u2086 = 3072', 'geometric recursive + explicit', 'n-vs-n-minus-1', 'r = 4; a\u2081 = 3; recursive: a\u2081 = 3, a\u2099 = 4 \u00B7 a\u2099\u208B\u2081; explicit: a\u2099 = 3 \u00B7 4\u207F\u207B\u00B9; a\u2086 = 3 \u00B7 4\u2075 = 3 \u00B7 1024 = 3072.'),
    W(3, 'Which term of 40, 35, 30, \u2026 equals 0?',
      '9', 9, 'd = \u22125; a\u2099 = 45 \u2212 5n; 45 \u2212 5n = 0 \u2192 n = 9', 'arithmetic find-the-term', 'wrong-formula', 'd = \u22125; a\u2099 = 40 \u2212 5(n\u22121) = 45 \u2212 5n; 45 \u2212 5n = 0 \u2192 n = 9.'),
  ],
};

// — Sets (6 items each, all check totals different) ——————

const SET_1_ITEMS = [1, 2, 4, 6, 7, 9];   // total 12395
const SET_2_ITEMS = [1, 2, 3, 6, 7, 9];   // total 310
const SET_3_ITEMS = [1, 3, 5, 6, 8, 9];   // total 1950
const SET_4_ITEMS = [3, 5, 6, 8, 9, 10];  // total 2074

const SET_1_TOTAL = 12395;
const SET_2_TOTAL = 310;
const SET_3_TOTAL = 1950;
const SET_4_TOTAL = 2074;

// — Slides (15 in array; lessonDeckEntries inserts vocabulary → 15; + 2 TIP = 17) —

const slides: SlideDraft[] = [
  {
    slideNumber: 1, kind: 'title',
    title: 'Explicit Formulas \u2014 The nth Term',
    bullets: ['Day 7 \u00B7 Algebra II \u00B7 Unit 1 Sequences and Functions', 'Wednesday September 23, 2026', 'Regents: Thursday 17 June 2027'],
    speakerNotes: '[Format: pacing calendar and evidence source.] Today is Day 7. We are building on Day 6 exit tickets \u2014 13 papers from this class. The repair work comes from those papers. Only 4 of 16 students wrote a complete recursive rule on Day 6.',
  },
  {
    slideNumber: 2, kind: 'do-now',
    title: 'Do Now \u2014 Repair Box (R1\u2013R3 on your worksheet)',
    bullets: ['Open to the repair box on your printed worksheet', 'R1, R2, R3 \u2014 everyone does these, they are not on the strip', 'Write both parts of each recursive rule: the first term AND the step', 'You have 8 minutes'],
    speakerNotes: '[Format: Side 1, section 1 \u2014 do now.] R1\u2013R3 are on the printed sheet. Walk around and check that students write a\u2081 as well as the step. Say: "A recursive rule always has two parts \u2014 the first term and what you do to get the next term."',
  },
  {
    slideNumber: 3, kind: 'reteach-worked',
    title: 'What Day 6 showed',
    bullets: ['13 papers from ALG2-SEQ-D6-ET', 'Only 4 of 16 wrote a complete recursive rule', 'Most common errors: step only (no first term), verbal answer where a formula belongs', 'Today we fix that and move to explicit formulas'],
    speakerNotes: '[Format: the real-paper item.] These results come from this room \u2014 nobody is being named. The three patterns on the slide are what the papers showed. Say each one out loud.',
  },
  {
    slideNumber: 4, kind: 'reteach-worked',
    title: 'Repair \u2014 a recursive rule has two parts',
    bullets: ['Wrong: "keep subtracting 3" \u2014 that is a step, not a rule', 'Right: a\u2081 = 20, a\u2099 = a\u2099\u208B\u2081 + (\u22123)', 'Wrong: a\u2099 = a\u2099\u208B\u2081 + 4 \u2014 where is the first term?', 'Right: a\u2081 = 5, a\u2099 = a\u2099\u208B\u2081 + 4', 'Check: put n = 1 in and you must get the first term back'],
    speakerNotes: '[Format: Side 1, section 2 \u2014 fix one item together.] These are the actual wrong answers from Day 6 papers, names removed. Say: "The first term is ___ and each term is ___ the one before." A sentence like "keep subtracting 3" is not a rule.',
  },
  {
    slideNumber: 5, kind: 'reteach-worked',
    title: 'Repair \u2014 formula, not words',
    bullets: ['Wrong: "keep doubling" \u2014 that is words, not a formula', 'Right: a\u2081 = 3, a\u2099 = 2 \u00B7 a\u2099\u208B\u2081', 'A formula uses a\u2081, a\u2099, n, d, or r \u2014 not words', 'If asked for explicit, give a\u2099 = \u2026 not "keep adding"'],
    speakerNotes: '[Format: Side 1, section 3 \u2014 check the rule.] Students wrote verbal descriptions where formulas were required. Say: "If the question says write a formula, your answer must have a\u2099 and n in it."',
  },
  {
    slideNumber: 6, kind: 'teaching',
    title: 'The four rules',
    bullets: ['Arithmetic \u00B7 recursive: a\u2081 = first term, a\u2099 = a\u2099\u208B\u2081 + d', 'Arithmetic \u00B7 explicit: a\u2099 = a\u2081 + d(n \u2212 1)', 'Geometric \u00B7 recursive: a\u2081 = first term, a\u2099 = r \u00B7 a\u2099\u208B\u2081', 'Geometric \u00B7 explicit: a\u2099 = a\u2081 \u00B7 r\u207F\u207B\u00B9', 'Recursive always has two parts. Explicit always has n \u2212 1: count the jumps, not the terms.'],
    speakerNotes: '[Format: the four rules \u2014 two-by-two table.] This is the core of the lesson. Read each cell. Point to the two-by-two: arithmetic/geometric down the side, recursive/explicit across the top. Say "count the jumps, not the terms" \u2014 four terms, three arrows.',
  },
  {
    slideNumber: 7, kind: 'teaching',
    title: 'Arithmetic or geometric?',
    bullets: ['20, 17, 14, \u2026 \u2192 subtract: 17\u221220 = \u22123, 14\u221217 = \u22123 \u2192 same \u2192 arithmetic, d = \u22123', '3, 6, 12, 24, \u2026 \u2192 divide: 6/3 = 2, 12/6 = 2 \u2192 same \u2192 geometric, r = 2', 'Subtract \u2192 same every time \u2192 arithmetic. Divide \u2192 same every time \u2192 geometric.'],
    speakerNotes: '[Format: the four rules \u2014 subtract or divide.] Two examples on the board. Subtract neighbouring terms for arithmetic, divide for geometric. Say each verdict out loud.',
  },
  {
    slideNumber: 8, kind: 'teaching',
    title: 'Worked \u2014 arithmetic [item 1]',
    bullets: ['20, 17, 14, \u2026: d = \u22123, a\u2081 = 20', 'Recursive: a\u2081 = 20, a\u2099 = a\u2099\u208B\u2081 + (\u22123)', 'Explicit: a\u2099 = 20 + (\u22123)(n\u22121) = 23 \u2212 3n', 'a\u2081\u2085 = 23 \u2212 3(15) = 23 \u2212 45 = \u221222', 'Check n = 1: 23 \u2212 3(1) = 20 \u2713'],
    speakerNotes: '[Format: Side 1, section \u2014 worked arithmetic.] Item 1 from today\u2019s worksheet. A negative term is a correct answer \u2014 the class dropped signs on Day 6, so say it. Check n = 1 gives the first term back.',
  },
  {
    slideNumber: 9, kind: 'teaching',
    title: 'Worked \u2014 geometric [item 5]',
    bullets: ['3, 6, 12, 24, \u2026: r = 2, a\u2081 = 3', 'Recursive: a\u2081 = 3, a\u2099 = 2 \u00B7 a\u2099\u208B\u2081', 'Explicit: a\u2099 = 3 \u00B7 2\u207F\u207B\u00B9', 'a\u2081\u2080 = 3 \u00B7 2\u2079 = 3 \u00B7 512 = 1536'],
    speakerNotes: '[Format: Side 1, section \u2014 worked geometric.] Item 5 from today\u2019s worksheet. The explicit formula has n \u2212 1, not n. Check n = 1: 3 \u00B7 2\u2070 = 3 \u2713.',
  },
  {
    slideNumber: 10, kind: 'teaching',
    title: 'The slip to avoid: 3 \u00B7 2\u207F',
    bullets: ['3 \u00B7 2\u207F at n = 1 gives 6, not 3 \u2014 wrong first term', 'Fix: a\u2099 = 3 \u00B7 2\u207F\u207B\u00B9 \u2014 the n \u2212 1 makes n = 1 give 3', 'This is the same slip as forgetting n \u2212 1 in arithmetic', 'Always check n = 1 \u2014 you must get the first term back'],
    speakerNotes: '[Format: the four rules \u2014 the n versus n\u22121 slip.] This is the most common geometric mistake. Put n = 1 in and you must get the first term. 3 \u00B7 2\u00B9 = 6 \u2260 3 \u2014 the formula is wrong. Fix it to 3 \u00B7 2\u207F\u207B\u00B9.',
  },
  {
    slideNumber: 11, kind: 'independent-work',
    title: 'Now on your own',
    bullets: ['Do only the 6 item numbers next to your name on the board', 'Everyone uses the same printed sheet \u2014 nothing on it says which set you are', 'Put your final answers on the strip and check the total', 'Leave SET blank on the strip \u2014 the board does not show set numbers', 'Finished early? Do items 5 then 10'],
    speakerNotes: '[Format: Sides 3\u20134 \u2014 independent problem pool.] No set numbers on the board, no reasons, no scores \u2014 only names, item numbers, and the check total. The strip on the printed sheet asks you to circle SET \u2014 leave it blank.',
  },
  {
    slideNumber: 12, kind: 'independent-work',
    title: 'Check totals',
    bullets: ['Your 6 answers add up to a total \u2014 find it on the board next to your name', 'If your total does not match, recheck your arithmetic \u2014 do not change answers to fit', 'The total tells you which set you did \u2014 that is why every set has a different total'],
    speakerNotes: '[Format: Side 4 \u2014 answer strip and check total.] The check total is the sum of the numeric answers for your 6 items. Every set has a different total so the total identifies the set. Say the four totals: 12395, 310, 1950, 2074.',
  },
  {
    slideNumber: 13, kind: 'exit-ticket',
    title: 'Exit ticket',
    bullets: ['2 questions, each isolating one skill', 'Form A and Form B \u2014 different questions, same skills', 'Write the class period as a digit in the box', 'A blank answer tells me something different from a wrong answer \u2014 do not leave it blank'],
    speakerNotes: '[Format: exit tickets, two forms.] Form A: arithmetic 5,9,13,17 and geometric 5,10,20,40. Form B: arithmetic 7,10,13,16 and geometric 3,12,48,192. No sequence on the ticket appears on today\u2019s worksheet. Forms A and B do not share a final answer.',
  },
  {
    slideNumber: 14, kind: 'debrief',
    title: 'Debrief \u2014 all answers',
    bullets: ['Item 1: \u221222 (watch the sign)', 'Item 2: 102', 'Item 3: 203', 'Item 4: 12288', 'Item 5: 1536 (after fixing n \u2212 1)', 'Item 6: 32', 'Item 7: \u22127', 'Item 8: 199 (200 is not a term)', 'Item 9: choice 2', 'Item 10: 102'],
    speakerNotes: '[Format: answer key and strip check.] Read the answers out loud. For items 1 and 7, say the negative sign explicitly \u2014 the class dropped signs on Day 6. For item 5, remind them about the n \u2212 1 fix.',
  },
];

// — Timeline (45 min, badges add to 45) —

const timeline = [
  { minutes: 8, label: 'Repair', detail: 'Do Now repair box R1\u2013R3 on the printed sheet; reteach of Day 6 weaknesses.' },
  { minutes: 0, label: 'Key vocabulary', detail: 'Five words from the Side 2 help card, read quickly.' },
  { minutes: 5, label: 'Four rules', detail: 'The two-by-two table: arithmetic/geometric \u00D7 recursive/explicit.' },
  { minutes: 2, label: 'Subtract or divide', detail: 'Two examples: 20,17,14 and 3,6,12,24.' },
  { minutes: 3, label: 'Worked arithmetic', detail: 'Item 1: explicit formula for 20,17,14 and a\u2081\u2085.' },
  { minutes: 3, label: 'Worked geometric', detail: 'Item 5: fix 3\u00B72\u207F, find a\u2081\u2080.' },
  { minutes: 19, label: 'Independent work', detail: 'Six assigned items from the 10-item pool; check totals.' },
  { minutes: 5, label: 'Exit ticket', detail: 'Two forms, two questions each, no overlap with worksheet.' },
];

// — Reteach items (from Day 6 results) —

const reteach = {
  summary: 'Day 6 exit ticket (ALG2-SEQ-D6-ET) showed that only 4 of 16 students wrote a complete recursive rule. The most common errors were: writing only the step without the first term, writing a verbal description instead of a formula, and using an explicit formula where a recursive rule was asked for.',
  items: [
    {
      itemNumber: 1,
      percentCorrect: 25,
      skillTag: 'write-recursive-rule',
      wrongAnswersQuoted: ['keep subtracting 3'],
      whatWentWrong: 'Students wrote only the step, not the first term. "Keep subtracting 3" is a step, not a rule.',
      howToRepair: 'A recursive rule always has two parts: a\u2081 and the step. Say: "The first term is ___ and each term is ___ the one before."',
    },
    {
      itemNumber: 2,
      percentCorrect: 40,
      skillTag: 'recursive-missing-initial-term',
      wrongAnswersQuoted: ['a\u2099 = a\u2099\u208B\u2081 + 4'],
      whatWentWrong: 'Students wrote the step but omitted the first term.',
      howToRepair: 'Always start with "The first term is ___." Then give the step.',
    },
    {
      itemNumber: 3,
      percentCorrect: 50,
      skillTag: 'verbal-answer-where-a-formula-belongs',
      wrongAnswersQuoted: ['keep doubling'],
      whatWentWrong: 'Students wrote a verbal description where a formula was required.',
      howToRepair: 'A formula uses a\u2081, a\u2099, n, d, or r \u2014 not words. If asked for a formula, the answer must have variables in it.',
    },
  ],
  script: [
    'Only 4 of 16 students wrote a complete recursive rule on Day 6.',
    'The most common mistake was writing the step without the first term.',
    'A recursive rule always has two parts \u2014 say that out loud.',
    'If the question asks for a formula, do not write words.',
  ],
};

// — Student placements ——————————————————

interface Placement { name: string; studentId: string; realName?: string; evidence: string; }

const P5_SET_1: Placement[] = [
  { name: 'Brianna Ramirez', studentId: 'c1cb9191-3f9b-4e7d-8a2c-5f6e7d8a9b01', realName: 'Brianna Ramirez', evidence: 'Day 6: struggled with recursive-rule writing \u2014 wrote step only, no first term.' },
  { name: 'Ma\u2019Kiah', studentId: '33688873-0cff-4d92-835f-e0c033d7aa0f', realName: 'Ma\u2019Kiah', evidence: 'Day 6: recursive-missing-initial-term \u2014 wrote a\u2099 = a\u2099\u208B\u2081 + d without a\u2081.' },
];

const P5_SET_2: Placement[] = [
  { name: 'Chloe G.', studentId: 'c1e034ed-7e2b-4a1c-9d3e-5f6a7b8c9d02', realName: 'Chloe G.', evidence: 'Day 6: verbal-answer-where-a-formula-belongs.' },
  { name: 'Jaylen C.', studentId: 'f84c9ab6-1d2e-4f3a-8b5c-6d7e8f9a0b03', realName: 'Jaylen C.', evidence: 'Day 6: explicit-where-recursive-asked.' },
  { name: 'Mohammad Rahman', studentId: '57570f45-2a3b-4c5d-9e1f-0a1b2c3d4e05', realName: 'Mohammad Rahman', evidence: 'Day 6: rule-to-terms \u2014 correct step, wrong term lookup.' },
  { name: 'Ryan Chaitram', studentId: '151c26e2-3b4c-5d6e-a0f1-2b3c4d5e6f07', realName: 'Ryan Chaitram', evidence: 'Day 6: drops-negative-sign.' },
  { name: 'Safreena I.', studentId: '5c97d837-4e5f-6a7b-8c9d-0e1f2a3b4c06', realName: 'Safreena I.', evidence: 'Day 6: misread-graph-jump.' },
  { name: 'Sitara Z.', studentId: 'unmatched-p5-sitara-z', realName: 'Sitara Z.', evidence: 'Name not matched to roster \u2014 near match: Gentle Fox (sitarak@nycstudents.net). Confirm with teacher.' },
];

const P5_SET_3: Placement[] = [
  { name: 'A\u2019Siyah Rozell', studentId: '309f0bea-5a6b-4c7d-8e9f-0a1b2c3d4e08', realName: 'A\u2019Siyah Rozell', evidence: 'Day 6: strong work \u2014 correct recursive and explicit rules.' },
  { name: 'Diamond S.', studentId: 'a168035f-6b7c-4d8e-9f0a-1b2c3d4e5f09', realName: 'Diamond S.', evidence: 'Day 6: correct explicit formula, minor sign error.' },
  { name: 'Ibrahim Farooq', studentId: 'd5ca1dbe-7c8d-4e9f-0a1b-2c3d4e5f6a0a', realName: 'Ibrahim Farooq', evidence: 'Day 6: secure on recursive rules; ready for extension.' },
  { name: 'Jaden Wright', studentId: 'unmatched-p5-jaden-w', realName: 'Jaden Wright', evidence: 'Name not matched to roster \u2014 no near match found. Confirm with teacher.' },
  { name: 'Jassiah B.', studentId: 'b767cbb6-8d9e-4f0a-1b2c-3d4e5f6a7b0b', realName: 'Jassiah B.', evidence: 'Day 6: secure \u2014 correct recursive rule with both parts.' },
];

const P9_SET_1: Placement[] = [
  { name: 'Jabsia Batis', studentId: 'unmatched-p9-jabsia-b', realName: 'Jabsia Batis', evidence: 'Name not matched to roster \u2014 no Scholar record for Tuesday. Confirm with teacher.' },
  { name: 'Michael Bascom', studentId: 'ab727047-9e0f-4a1b-2c3d-4e5f6a7b8c0c', realName: 'Michael Bascom', evidence: 'Day 6: 3/3 correct but write-recursive-rule tag noted.' },
  { name: 'Saleh Farooq', studentId: 'd4288b73-0f1a-4b2c-3d4e-5f6a7b8c9d0d', realName: 'Saleh Farooq', evidence: 'Day 6: 2/3, 67% \u2014 rule-to-terms and write-recursive-rule.' },
];

const P9_SET_2: Placement[] = [
  { name: 'Anthony Flores', studentId: '8f09dc0a-1a2b-4c3d-5e6f-7a8b9c0d1e0e', realName: 'Anthony Flores', evidence: 'Day 6: 3/4, 88% \u2014 explicit-where-recursive-asked.' },
  { name: 'Anuradha Sooklall', studentId: '8b90b783-2b3c-4d5e-6f7a-8b9c0d1e2f0f', realName: 'Anuradha Sooklall', evidence: 'Day 6: 3/4, 88% \u2014 verbal-answer-where-a-formula-belongs.' },
  { name: 'Asiya Khan', studentId: '8b64561c-3c4d-4e5f-7a8b-9c0d1e2f3a10', realName: 'Asiya Khan', evidence: 'No paper received \u2014 Set 2 by default.' },
  { name: 'Colby Fleurisma', studentId: '9be11b29-4d5e-4f6a-8b9c-0d1e2f3a4b11', realName: 'Colby Fleurisma', evidence: 'No paper received \u2014 Set 2 by default.' },
  { name: 'Emily Walker', studentId: 'c5201778-5e6f-4a7b-9c0d-1e2f3a4b5c12', realName: 'Emily Walker', evidence: 'Day 6: 3/4, 88% \u2014 verbal-answer-where-a-formula-belongs.' },
  { name: 'Hanna Mikeyla Escudero Hernandez', studentId: 'unmatched-p9-hanna', realName: 'Hanna Mikeyla Escudero Hernandez', evidence: 'Name not matched \u2014 near: Hanna Escudero. Confirm with teacher.' },
  { name: 'Jaqwan Wilson', studentId: 'unmatched-p9-jaqwan', realName: 'Jaqwan Wilson', evidence: 'Name not matched \u2014 near: JayQuan W. Confirm with teacher.' },
  { name: 'Joyce Tapia', studentId: '505cc17e-6f7a-4b8c-0d1e-2f3a4b5c6d13', realName: 'Joyce Tapia', evidence: 'No paper received \u2014 Set 2 by default.' },
  { name: 'Keren Toc Perez', studentId: 'unmatched-p9-keren', realName: 'Keren Toc Perez', evidence: 'Name not matched \u2014 near: Keren Joe Perez. Confirm with teacher.' },
  { name: 'Lyan Cedeno Valdivieso', studentId: 'unmatched-p9-lyan', realName: 'Lyan Cedeno Valdivieso', evidence: 'Name not matched \u2014 near: Lyan Cedeno. Confirm with teacher.' },
  { name: 'Marin Aktar', studentId: '6ec551d7-7a8b-4c9d-1e2f-3a4b5c6d7e14', realName: 'Marin Aktar', evidence: 'Day 6: 3/4, 75% \u2014 verbal-answer-where-a-formula-belongs.' },
];

function makeGroup(id: string, label: string, items: number[], total: number, placements: Placement[]): StudentGroup {
  return {
    id,
    label,
    itemNumbers: items,
    checkTotal: total,
    students: placements.map((p) => ({
      studentId: p.studentId,
      realName: p.realName,
      name: p.name,
      evidence: p.evidence,
      score: null,
    })),
  };
}

const P5_GROUPS: StudentGroup[] = [
  makeGroup('p5-s1', 'Group 1', SET_1_ITEMS, SET_1_TOTAL, P5_SET_1),
  makeGroup('p5-s2', 'Group 2', SET_2_ITEMS, SET_2_TOTAL, P5_SET_2),
  makeGroup('p5-s3', 'Group 3', SET_3_ITEMS, SET_3_TOTAL, P5_SET_3),
  makeGroup('p5-s4', 'Group 4', SET_4_ITEMS, SET_4_TOTAL, []),
];

const P9_GROUPS: StudentGroup[] = [
  makeGroup('p9-s1', 'Group 1', SET_1_ITEMS, SET_1_TOTAL, P9_SET_1),
  makeGroup('p9-s2', 'Group 2', SET_2_ITEMS, SET_2_TOTAL, P9_SET_2),
  makeGroup('p9-s3', 'Group 3', SET_3_ITEMS, SET_3_TOTAL, []),
  makeGroup('p9-s4', 'Group 4', SET_4_ITEMS, SET_4_TOTAL, []),
];

// — Drafts ——————————————————

const baseDraft = {
  lessonPlan: {
    title: 'Explicit Formulas \u2014 The nth Term',
    aim: 'Write and use explicit formulas for arithmetic and geometric sequences.',
    objective: 'Write an explicit formula from a sequence, check it at n = 1, and use it to find any term.',
    standards: STANDARDS,
    durationMinutes: 45,
    builtFrom: 'Day 6 exit ticket ALG2-SEQ-D6-ET \u2014 13 papers, scored item by item.',
    timeline,
    reteach,
    materials: ['Printed Worksheet 7: Explicit Formulas \u2014 The nth Term (pre-printed, 10 items + R1\u2013R3 repair box)'],
    differentiationNotes: ['Four sets of 6 items from a 10-item pool; worksheet is identical for everyone; only the item numbers on the board differ.'],
    assessmentNote: 'Exit ticket: two forms, two questions each, no sequence shared with the worksheet, forms do not share a final answer.',
  },
  slides,
  worksheet: {
    title: 'Worksheet 7: Explicit Formulas \u2014 The nth Term',
    instructions: 'Do only the 6 item numbers next to your name on the board. Put final answers on the strip and check the total.',
    items: worksheetItems,
  },
  exitTicket: exitTicketFormA,
  exitTicketFormB: exitTicketFormB,
  nextLessonTitle: 'Explicit Formulas \u2014 The nth Term',
  nextLessonDate: 'Wed Sep 23, 2026',
  dayNumber: 7,
};

export const day7P5Draft: NextDayDraft = {
  ...baseDraft,
  classId: '25befcc6-722d-463d-b5f1-fca468177989',
  className: 'Algebra II Period 5',
  builtFrom: {
    className: 'Algebra II Period 5',
    worksheetCode: 'ALG2-SEQ-D6-ET',
    worksheetTitle: 'Day 6 Exit Ticket \u2014 Representing Sequences',
    worksheetDate: '2026-09-22',
    papers: 13,
    studentCount: 16,
    generatedAt: new Date().toISOString(),
  },
  grouping: {
    groups: P5_GROUPS,
    noResultsYet: [],
    itemsPerStudent: 6,
  },
};

export const day7P9Draft: NextDayDraft = {
  ...baseDraft,
  classId: '18d810c7-ab55-4089-a3c6-dab278e3a091',
  className: 'Algebra II Period 9',
  builtFrom: {
    className: 'Algebra II Period 9',
    worksheetCode: 'ALG2-SEQ-D6-ET',
    worksheetTitle: 'Day 6 Exit Ticket \u2014 Representing Sequences',
    worksheetDate: '2026-09-22',
    papers: 13,
    studentCount: 14,
    generatedAt: new Date().toISOString(),
  },
  grouping: {
    groups: P9_GROUPS,
    noResultsYet: [],
    itemsPerStudent: 6,
  },
};

export const day7Drafts = [day7P5Draft, day7P9Draft];
