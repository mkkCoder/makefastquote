import { describe, expect, it } from 'vitest';
import { cleanPastedKey, fitFontSize, measureText, truncateToWidth, wrapText } from '../pdf/text';

describe('measureText', () => {
  it('scales linearly with point size', () => {
    const a = measureText('Invoice', 10);
    const b = measureText('Invoice', 20);
    expect(b / a).toBeCloseTo(2, 6);
  });

  it('gives bold a wider advance than regular', () => {
    expect(measureText('Total due', 10, 'bold')).toBeGreaterThan(measureText('Total due', 10));
  });

  it('returns zero for an empty string', () => {
    expect(measureText('', 12)).toBe(0);
  });
});

describe('wrapText', () => {
  it('never returns a line wider than the limit', () => {
    const text =
      'Payment is due within thirty days of the invoice date. Late payments accrue interest at 2% per month.';
    const width = 60;
    for (const line of wrapText(text, width, 9)) {
      expect(measureText(line, 9)).toBeLessThanOrEqual(width);
    }
  });

  it('breaks a single word that cannot fit rather than letting it run off the page', () => {
    const url = 'https://example.com/a-very-long-path-segment-that-will-not-fit-on-one-line';
    const lines = wrapText(url, 30, 9);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(line, 9)).toBeLessThanOrEqual(30);
  });

  it('preserves deliberate blank lines between paragraphs', () => {
    expect(wrapText('one\n\ntwo', 100, 9)).toEqual(['one', '', 'two']);
  });
});

describe('fitFontSize', () => {
  it('leaves text that already fits at full size', () => {
    expect(fitFontSize('short', 100, 12)).toBe(12);
  });

  it('shrinks text so it fits, and the result actually fits', () => {
    // The real case: the footer credit embeds a domain. The day the domain
    // gets longer, a hardcoded size would silently overrun the page.
    const long = 'Made with an-extremely-long-domain-name-for-testing.example.com';
    const size = fitFontSize(long, 60, 7.5);
    expect(size).toBeLessThan(7.5);
    expect(measureText(long, size)).toBeLessThanOrEqual(60);
  });

  it('never returns below the floor', () => {
    const huge = 'x'.repeat(4000);
    expect(fitFontSize(huge, 10, 8, 4)).toBe(4);
  });
});

describe('truncateToWidth', () => {
  it('leaves short text alone', () => {
    expect(truncateToWidth('Acme Ltd', 100, 9)).toBe('Acme Ltd');
  });

  it('truncates with an ellipsis and the result fits', () => {
    const long = 'A Very Long Client Company Name Limited Incorporated Worldwide';
    const out = truncateToWidth(long, 40, 9);
    expect(out.endsWith('...')).toBe(true);
    expect(measureText(out, 9)).toBeLessThanOrEqual(40);
  });
});

describe('cleanPastedKey', () => {
  const KEY = '38b1460a-5104-4067-a91d-77b872934d51';

  it('extracts a key from a whole pasted line', () => {
    expect(cleanPastedKey(`Your license key: ${KEY}  `)).toBe(KEY);
  });

  it('strips zero-width characters that mail clients inject', () => {
    // Written as escapes on purpose: real zero-width characters in a source
    // file trip eslint's no-irregular-whitespace, which is exactly the trap
    // this test is about.
    const zwsp = '\u200B';
    const bom = '\uFEFF';
    const zwj = '\u200D';
    const dirty = `${bom}38b1460a-5104${zwsp}-4067-a91d-${zwj}77b872934d51`;
    expect(cleanPastedKey(dirty)).toBe(KEY);
  });

  it('replaces non-breaking spaces before matching', () => {
    expect(cleanPastedKey(`\u00A0${KEY}\u2007`)).toBe(KEY);
  });

  it('pulls the key out of a redirect URL', () => {
    expect(cleanPastedKey(`https://makefastquote.com/app/?key=${KEY}`)).toBe(KEY);
  });

  it('handles Gumroad-style grouped keys', () => {
    expect(cleanPastedKey('code: ABCD1234-EFGH5678-IJKL9012-MNOP3456')).toBe(
      'ABCD1234-EFGH5678-IJKL9012-MNOP3456',
    );
  });

  it('returns an empty string for empty input rather than throwing', () => {
    expect(cleanPastedKey('   ')).toBe('');
  });
});
