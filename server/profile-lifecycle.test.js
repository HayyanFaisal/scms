import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateChildMissingFields, calculateParentMissingFields, normalizeIdentifier } from './profile-lifecycle.js';

test('identity normalization makes formatted CNIC and PN values stable', () => {
  assert.equal(normalizeIdentifier(' 35202-1234567-1 '), '3520212345671');
  assert.equal(normalizeIdentifier('pn 12/34'), 'PN1234');
});

test('parent completeness excludes optional authority and contact fields', () => {
  const complete = { Parent_Name: 'Test', Rank_Rate: 'CAP', Unit: 'HQ', Service_Status: 'Serving', Parent_CNIC: '123' };
  assert.deepEqual(calculateParentMissingFields(complete), []);
  assert.deepEqual(calculateParentMissingFields({ ...complete, Unit: null }), ['unit']);
});

test('child completeness is independent of skipped medical fields', () => {
  const child = { Child_Name: 'Child', Age: 7, CNIC_BForm_No: '123', School: 'School', Parent_Selected_Category: 'A' };
  assert.deepEqual(calculateChildMissingFields(child), []);
  assert.deepEqual(calculateChildMissingFields({ ...child, School: '' }), ['school']);
});
