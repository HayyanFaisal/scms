import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceCode, REFERENCE_TYPE_CODES } from './configuration.js';

test('reference codes are stable, normalized, and bounded', () => {
  assert.equal(referenceCode('HQ COMKAR'), 'HQ_COMKAR');
  assert.equal(referenceCode('  Naval School / Karachi  '), 'NAVAL_SCHOOL_KARACHI');
  assert.ok(referenceCode('x'.repeat(200)).length <= 80);
});

test('phase-one reference types include every configurable registry choice', () => {
  assert.deepEqual(REFERENCE_TYPE_CODES, [
    'authority', 'school', 'rank', 'unit', 'service_status', 'category'
  ]);
});
