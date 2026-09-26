import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentInternals } from './payment-operations.js';

test('payment month produces calendar and Pakistan fiscal-year boundaries', () => {
  assert.deepEqual(paymentInternals.paymentPeriod('2026-09'), {
    key: '2026-09',
    start: '2026-09-01',
    end: '2026-09-30',
    fiscalYear: '2026-2027',
  });
  assert.equal(paymentInternals.paymentPeriod('2027-02').end, '2027-02-28');
  assert.equal(paymentInternals.paymentPeriod('2027-02').fiscalYear, '2026-2027');
  assert.throws(() => paymentInternals.paymentPeriod('2026-13'), /valid payment month/i);
});

test('payment exports mask accounts and neutralize spreadsheet formulas', () => {
  assert.equal(paymentInternals.maskAccount('123456789012'), '********9012');
  assert.equal(paymentInternals.csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(paymentInternals.dateOnly(new Date(2026, 8, 1)), '2026-09-01');
});
