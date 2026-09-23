export const H = '<!doctype html><html><head><meta charset="utf-8">' +
  '<link rel="stylesheet" href="hillcrest-print.css"></head><body>';
export const E = '</body></html>';

/** A blank answer line. '' normal (96px), 's' short (44px), 'l' long (176px). */
export const F = (c: '' | 's' | 'l' = '') => `<span class="fill ${c}"></span>`;

/** Subscripted term: a(4) -> a<sub>4</sub> */
export const a  = (i: number | string) => `a<sub>${i}</sub>`;
export const AN  = 'a<sub>n</sub>';
export const AN1 = 'a<sub>n&minus;1</sub>';

/** Black banner at the top of every printable.
 *  meta = the small uppercase line, title = the big line. */
export const head = (meta: string, title: string) =>
  `<div class="head"><div class="m">${meta}</div><div class="t">${title}</div></div>`;

/** The two-row n / term table used for every sequence. */
export function sq(heads: (string|number)[], vals: (string|number)[],
                   hl = 'n', vl = 'term') {
  const r1 = heads.map(h => `<th>${h}</th>`).join('');
  const r2 = vals .map(v => `<td>${v}</td>`).join('');
  return `<table class="sq"><tr><th>${hl}</th>${r1}</tr><tr><th>${vl}</th>${r2}</tr></table>`;
}

/** A numbered worksheet item. tag is the small grey label on the right. */
export function item(n: number, body: string, tag = '') {
  const t = tag ? `<span class="tag">${tag}</span>` : '';
  return `<div class="item"><span class="n">${n}.</span>${t} ${body}</div>`;
}

/** The answer strip that closes the last side of every worksheet. */
export function strip(count = 14) {
  const cells = Array.from({length: count}, (_, i) =>
    `<div><b>${i + 1}</b> &nbsp;</div>`).join('');
  return '<div class="stripbox" style="margin-top:8px"><div class="sans">' +
    `<b>ANSWER STRIP</b> &nbsp;&nbsp; Name ${F('l')} &nbsp; Period ${F('s')}</div>` +
    '<p class="sans" style="font-size:8.4pt;margin-top:3px">Numbers only, on the lines of the 8 items on your list.</p>' +
    `<div class="stripgrid">${cells}</div>` +
    `<p class="sans" style="margin-top:7px;font-size:9pt">My total: ${F()} &nbsp; Compare with the check total on the board.</p></div>`;
}

/** Teacher-facing placement table. rows = [name, set, why, flag]. */
export function settable(rows: [string, number, string, string][],
                         defaultSet: number,
                         SETS: Record<string, number[]>,
                         TOT: Record<string, number>) {
  const h = ['<table><tr><th style="width:21%">Student</th><th style="width:5%">Set</th>' +
             '<th style="width:20%">Items to work</th><th style="width:7%">Check</th>' +
             '<th>Why this set</th></tr>'];
  for (const [nm, s, why, note] of rows) {
    const n = note ? ` <span class="red">&#9873; ${note}</span>` : '';
    h.push(`<tr><td><b>${nm}</b>${n}</td><td>${s}</td><td>${SETS[s].join(', ')}</td>` +
           `<td><b>${TOT[s]}</b></td><td>${why}</td></tr>`);
  }
  h.push(`<tr><td><i>No ticket handed in</i></td><td>${defaultSet}</td>` +
         `<td>${SETS[defaultSet].join(', ')}</td><td><b>${TOT[defaultSet]}</b></td>` +
         '<td>Absent or no paper &rarr; Set 2, no discussion.</td></tr></table>');
  return h.join('');
}

/** Board version: names grouped by set, with the set numbers and the reasons
 *  stripped out. This is what goes on the screen in front of students. */
export function board(title: string, groups: Record<string, string[]>,
                      SETS: Record<string, number[]>, TOT: Record<string, number>,
                      defaultSet = 2) {
  const h = [`<h2 class="pb" style="font-size:16pt">${title}</h2>`];
  for (const s of ['1', '2', '3', '4']) {
    if (!groups[s]?.length) continue;
    h.push(`<div class="gbox k" style="font-size:12pt;margin:8px 0">` +
      `<b>Items ${SETS[s].join(', ')}</b> &nbsp;&nbsp; check total <b>${TOT[s]}</b><br>` +
      groups[s].join(' &nbsp;&middot;&nbsp; ') + '</div>');
  }
  h.push(`<p style="font-size:12pt">Name not here? &nbsp;Do items <b>${SETS[defaultSet].join(', ')}</b>` +
         ` &nbsp;(check total <b>${TOT[defaultSet]}</b>).</p>`);
  h.push('<p class="sans" style="font-size:8pt;color:#666">Board version: no set numbers, no reasons. Copy exactly this.</p>');
  return h.join('');
}
