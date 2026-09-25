import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionForRequest } from './route-policy.js';

test('core routes map reads and mutations to distinct permissions', () => {
  assert.equal(permissionForRequest({ path: '/parents', method: 'GET' }), 'parents.read');
  assert.equal(permissionForRequest({ path: '/parents', method: 'POST' }), 'parents.create');
  assert.equal(permissionForRequest({ path: '/parents/123', method: 'PUT' }), 'parents.update');
  assert.equal(permissionForRequest({ path: '/parents/123', method: 'DELETE' }), 'parents.archive');
  assert.equal(permissionForRequest({ path: '/banking/1', method: 'PUT' }), 'banking.update');
  assert.equal(permissionForRequest({ path: '/parents/PN-1/scanned-documents', method: 'POST' }), 'documents.upload');
});

test('approval and security endpoints require high-risk permissions', () => {
  assert.equal(permissionForRequest({ path: '/admin/approve-request', method: 'POST' }), 'applications.approve');
  assert.equal(permissionForRequest({ path: '/auth/reset-authority-password', method: 'POST' }), 'authority_accounts.reset_password');
  assert.equal(permissionForRequest({ path: '/admin/reset-parent-password', method: 'POST' }), 'accounts.issue_one_time_password');
});

test('access-control routes separate reading, assignment, and credential powers', () => {
  assert.equal(permissionForRequest({ path: '/access-control/catalog', method: 'GET' }), 'roles.read');
  assert.equal(permissionForRequest({ path: '/access-control/users', method: 'GET' }), 'users.read');
  assert.equal(permissionForRequest({ path: '/access-control/users', method: 'POST' }), 'users.manage');
  assert.equal(permissionForRequest({ path: '/access-control/users/7/reset-password', method: 'POST' }), 'users.manage');
  assert.equal(permissionForRequest({ path: '/access-control/users/7/unlock', method: 'POST' }), 'users.manage');
  assert.equal(permissionForRequest({ path: '/access-control/roles/2', method: 'PATCH' }), 'roles.manage');
  assert.equal(permissionForRequest({ path: '/access-control/scopes', method: 'POST' }), 'assignments.manage');
});

test('configuration routes separate operational reads from management and rate publication', () => {
  assert.equal(permissionForRequest({ path: '/config/reference-data', method: 'GET' }), 'organizations.read');
  assert.equal(permissionForRequest({ path: '/config/master-data', method: 'GET' }), 'organizations.read');
  assert.equal(permissionForRequest({ path: '/config/master-data', method: 'POST' }), 'organizations.manage');
  assert.equal(permissionForRequest({ path: '/config/master-data/4', method: 'PATCH' }), 'organizations.manage');
  assert.equal(permissionForRequest({ path: '/config/rates', method: 'GET' }), 'rates.read');
  assert.equal(permissionForRequest({ path: '/config/rates', method: 'POST' }), 'rates.manage');
  assert.equal(permissionForRequest({ path: '/config/parent-field-policies', method: 'GET' }), 'settings.read');
  assert.equal(permissionForRequest({ path: '/config/parent-field-policies/rankRate', method: 'PATCH' }), 'settings.manage');
  assert.equal(permissionForRequest({ path: '/imports/provisional-record', method: 'POST' }), 'imports.execute');
});

test('unknown routes fail closed', () => {
  assert.equal(permissionForRequest({ path: '/new-unregistered-module', method: 'GET' }), null);
  assert.equal(permissionForRequest({ path: '/auth/update-authority-password', method: 'POST' }), null);
});
