// =============================================================================
// MATH VERIFICATION
// =============================================================================
// Every generated item carries a self-check: `verify` is a pure arithmetic
// expression and `verifyExpected` is the number it must equal. We evaluate the
// expression ourselves (no eval of arbitrary code) and refuse to show any item
// whose answer has not been checked.
// =============================================================================

import type { WorksheetItemDraft } from './types.ts';

const ALLOWED = /^[0-9\s.+\-*/()^]+$/;

/** Tokenise + evaluate a plain arithmetic expression. Returns null if unusable. */
export function evalArithmetic(expression: string): number | null {
  if (!expression) return null;
  const cleaned = expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/,/g, '')
    .trim();
  if (!ALLOWED.test(cleaned)) return null;

  let pos = 0;
  const peek = () => cleaned[pos];
  const skip = () => {
    while (pos < cleaned.length && cleaned[pos] === ' ') pos += 1;
  };

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    skip();
    while (peek() === '+' || peek() === '-') {
      const op = peek();
      pos += 1;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
      skip();
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parsePower();
    if (left === null) return null;
    skip();
    while (peek() === '*' || peek() === '/') {
      const op = peek();
      pos += 1;
      const right = parsePower();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
      skip();
    }
    return left;
  }

  function parsePower(): number | null {
    const base = parseUnary();
    if (base === null) return null;
    skip();
    if (peek() === '^') {
      pos += 1;
      const exponent = parsePower();
      if (exponent === null) return null;
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parseUnary(): number | null {
    skip();
    if (peek() === '-') {
      pos += 1;
      const value = parseUnary();
      return value === null ? null : -value;
    }
    if (peek() === '+') {
      pos += 1;
      return parseUnary();
    }
    return parseAtom();
  }

  function parseAtom(): number | null {
    skip();
    if (peek() === '(') {
      pos += 1;
      const value = parseExpression();
      skip();
      if (peek() !== ')') return null;
      pos += 1;
      return value;
    }
    const start = pos;
    while (pos < cleaned.length && /[0-9.]/.test(cleaned[pos])) pos += 1;
    if (pos === start) return null;
    const value = Number(cleaned.slice(start, pos));
    return Number.isFinite(value) ? value : null;
  }

  const result = parseExpression();
  skip();
  if (pos !== cleaned.length) return null;
  return result === null || !Number.isFinite(result) ? null : result;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6 || Math.abs(a - b) < Math.abs(b) * 1e-6;

/** Verify one item. Sets `verified` and a human-readable note. */
export function verifyItem(item: WorksheetItemDraft): WorksheetItemDraft {
  const expected = typeof item.verifyExpected === 'number' ? item.verifyExpected : null;
  const answer = typeof item.answerNumeric === 'number' ? item.answerNumeric : null;

  if (answer === null) {
    return { ...item, verified: false, verifyNote: 'No numeric answer supplied, so no check total is possible.' };
  }
  if (expected === null) {
    return { ...item, verified: false, verifyNote: 'No self-check supplied.' };
  }
  const computed = evalArithmetic(item.verify);
  if (computed === null) {
    return { ...item, verified: false, verifyNote: `Could not compute the check "${item.verify}".` };
  }
  if (!close(computed, expected)) {
    return {
      ...item,
      verified: false,
      verifyNote: `Check "${item.verify}" gives ${computed}, not the stated ${expected}.`,
    };
  }
  if (!close(expected, answer)) {
    return {
      ...item,
      verified: false,
      verifyNote: `Check gives ${expected} but the answer says ${answer}.`,
    };
  }
  return { ...item, verified: true, verifyNote: `${item.verify} = ${answer}` };
}

export function verifyItems(items: WorksheetItemDraft[]): WorksheetItemDraft[] {
  return items.map(verifyItem);
}

export function unverified(items: WorksheetItemDraft[]): WorksheetItemDraft[] {
  return items.filter((i) => !i.verified);
}
