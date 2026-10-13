import { describe, expect, it } from 'vitest';
import { addDays, amountInWords, daysBetween, fmtDate, fmtPct, fmtQty, money } from '../../src/format.js';
import { merge, parseNum } from '../../src/util.js';

describe('money', () => {
  it('uses Indian grouping with two decimals', () => {
    expect(money(125000)).toBe('₹ 1,25,000.00');
    expect(money(12345678.5)).toBe('₹ 1,23,45,678.50');
    expect(money(0)).toBe('₹ 0.00');
  });
  it('formats quantities and percentages without noise', () => {
    expect(fmtQty(1.5)).toBe('1.5');
    expect(fmtQty(1200)).toBe('1,200');
    expect(fmtPct(9)).toBe('9');
    expect(fmtPct(2.5)).toBe('2.5');
  });
});

describe('amount in words (Indian system)', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [45, 'Rupees Forty-Five Only'],
    [1_25_000, 'Rupees One Lakh Twenty-Five Thousand Only'],
    [2_15_940, 'Rupees Two Lakh Fifteen Thousand Nine Hundred Forty Only'],
    [1_00_00_000, 'Rupees One Crore Only'],
    [1_85_851.06, 'Rupees One Lakh Eighty-Five Thousand Eight Hundred Fifty-One and Six Paise Only'],
  ])('%s', (n, words) => expect(amountInWords(n)).toBe(words));
});

describe('dates', () => {
  it('adds days across months', () => expect(addDays('2026-10-20', 15)).toBe('2026-11-04'));
  it('counts days between', () => expect(daysBetween('2026-10-12', '2026-10-27')).toBe(15));
  it('formats long and short', () => {
    expect(fmtDate('2026-10-12')).toBe('12 October 2026');
    expect(fmtDate('2026-10-12', 'mid')).toBe('12 Oct 2026');
  });
});

describe('helpers', () => {
  it('parses typed numbers', () => {
    expect(parseNum('₹ 1,25,000.50')).toBe(125000.5);
    expect(parseNum('abc')).toBe(0);
  });
  it('merges nested settings without losing defaults', () => {
    expect(merge({ a: 1, bank: { upi: '', ifsc: 'X' } }, { bank: { upi: 'me@ybl' } })).toEqual({ a: 1, bank: { upi: 'me@ybl', ifsc: 'X' } });
  });
});
