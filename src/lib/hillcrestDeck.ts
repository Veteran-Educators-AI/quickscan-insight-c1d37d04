import PptxGenJS from 'pptxgenjs';

export const INK='1A1A1A', MUTE='6B6B6B', LINE='D8D8D8',
      RED='A00000', GOLD='8A5A12', SOFT='F3F1EC';

/** Turns a_{n} into a real subscript run. Never write subscripts as
 *  plain text, and never pass an empty string to addText - pptxgenjs
 *  produces no runs and throws. */
export function R(str: string, o: any = {}) {
  const source = str === '' ? ' ' : str;
  const out: any[] = []; const re = /_\{([^}]*)\}/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m.index > last) out.push({ text: source.slice(last, m.index), options: { ...o } });
    out.push({ text: m[1], options: { ...o, subscript: true } });
    last = re.lastIndex;
  }
  if (last < source.length) out.push({ text: source.slice(last), options: { ...o } });
  return out.length ? out : [{ text: ' ', options: { ...o } }];
}

/** Multi-line body text. Guards the empty-string case. */
export function lines(arr: string[], o: any = {}) {
  const out: any[] = [];
  arr.forEach((s, i) => {
    const r = R(s === '' ? ' ' : s, o);
    if (i < arr.length - 1)
      r[r.length - 1].options = { ...r[r.length - 1].options, breakLine: true };
    out.push(...r);
  });
  return out;
}

export function mk() {
  const d = new PptxGenJS();
  d.defineLayout({ name: 'W', width: 13.333, height: 7.5 });
  d.layout = 'W';
  return d;
}

/** Every content slide. Black rule across the top, grey kicker, gold tag
 *  on the right, Georgia title, hairline under it. */
export function base(d: any, title: string, kicker?: string, tag?: string) {
  const S = d.ShapeType;
  const s = d.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addShape(S.rect, { x: 0, y: 0, w: 13.333, h: 0.13, fill: { color: INK } });
  if (kicker) s.addText(kicker, { x: 0.6, y: 0.28, w: 8.5, h: 0.3, fontSize: 12,
    color: MUTE, fontFace: 'Arial', bold: true, charSpacing: 1.5 });
  if (tag) {
    s.addShape(S.rect, { x: 9.35, y: 0.25, w: 3.4, h: 0.38, fill: { color: GOLD } });
    s.addText(tag, { x: 9.35, y: 0.25, w: 3.4, h: 0.38, fontSize: 12, bold: true,
      color: 'FFFFFF', fontFace: 'Arial', align: 'center', valign: 'middle' });
  }
  s.addText(R(title), { x: 0.6, y: 0.62, w: 12.1, h: 0.7, fontSize: 30, bold: true,
    color: INK, fontFace: 'Georgia' });
  s.addShape(S.rect, { x: 0.6, y: 1.36, w: 12.1, h: 0.02, fill: { color: LINE } });
  return s;
}

export const T = (s: any, txt: string | string[], o: any) =>
  s.addText(Array.isArray(txt) ? lines(txt, { fontFace: 'Arial',
      fontSize: o.fontSize || 24, color: o.color || INK, bold: o.bold }) : R(txt, {}),
    { fontFace: 'Arial', fontSize: 24, color: INK, valign: 'top', paraSpaceAfter: 8, ...o });

export const foot = (s: any, t: string) =>
  s.addText(t, { x: 0.6, y: 6.95, w: 12.1, h: 0.3, fontSize: 10, color: MUTE, fontFace: 'Arial' });
