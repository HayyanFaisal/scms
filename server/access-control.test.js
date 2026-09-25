import assert from 'node:assert/strict';
import test from 'node:test';
import { DATA_SCOPE_MODULES, normalizedIds } from './access-control.js';
import { dataModuleForPath, scopeAllowsAuthority, scopePredicate } from './data-scope.js';

test('identifier normalization removes invalid and duplicate values', () => {
  assert.deepEqual(normalizedIds([1, '2', 2, 0, -1, 'bad', null]), [1, 2]);
  assert.deepEqual(normalizedIds('not-an-array'), []);
});

test('protected data modules are unique and stable', () => {
  const codes = DATA_SCOPE_MODULES.map(module => module.code);
  assert.equal(codes.length, new Set(codes).size);
  assert.deepEqual(codes, ['parents', 'children', 'documents', 'banking', 'grants', 'gadgets']);
});

test('document routes are classified before their parent route prefix', () => {
  assert.equal(dataModuleForPath('/parents/PN-1/scanned-documents'), 'documents');
  assert.equal(dataModuleForPath('/scanned-documents/8'), 'documents');
  assert.equal(dataModuleForPath('/parents/PN-1'), 'parents');
});

test('scope predicates deny by default and parameterize selected authorities', () => {
  assert.deepEqual(scopePredicate({ all: false, authorities: [], allowNoAuthority: false }, 'pb.Admin_Authority'), {
    sql: '1 = 0',
    params: []
  });
  const selected = { all: false, authorities: ['A', 'B'], allowNoAuthority: false };
  assert.deepEqual(scopePredicate(selected, 'pb.Admin_Authority'), {
    sql: '(pb.Admin_Authority IN (?, ?))',
    params: ['A', 'B']
  });
  assert.equal(scopeAllowsAuthority(selected, 'A'), true);
  assert.equal(scopeAllowsAuthority(selected, 'C'), false);
});
