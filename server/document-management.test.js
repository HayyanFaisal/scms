import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createConfigurationPackage,
  detectFileType,
  missingRequiredUploads,
  readConfigurationPackage,
  validateFormResponse,
  validateFormSchema
} from './document-management.js';

test('document signatures are detected from bytes rather than browser MIME claims', () => {
  assert.equal(detectFileType(Buffer.from('%PDF-1.7')).mime, 'application/pdf');
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).mime, 'image/jpeg');
  assert.equal(detectFileType(Buffer.from('not a supported file')), null);
});

test('form schemas accept bounded safe fields and reject executable field types', () => {
  const schema = validateFormSchema({
    title: 'Child details',
    sections: [{ title: 'Details', fields: [{ key: 'school_year', label: 'School year', type: 'number', required: true }] }]
  });
  assert.equal(schema.sections[0].fields[0].key, 'school_year');
  assert.throws(() => validateFormSchema({ sections: [{ fields: [{ key: 'unsafe', type: 'javascript' }] }] }), /Unsupported/);
});

test('form responses enforce required fields, numbers, and configured choices', () => {
  const schema = validateFormSchema({ sections: [{ fields: [
    { key: 'amount', label: 'Amount', type: 'number', required: true },
    { key: 'term', label: 'Term', type: 'select', options: ['One', 'Two'], required: true }
  ] }] });
  assert.deepEqual(validateFormResponse(schema, { amount: '12', term: 'One' }), { amount: 12, term: 'One' });
  assert.throws(() => validateFormResponse(schema, { amount: 'invalid', term: 'Three' }), /must be a number/);
});

test('form validation rejects empty sections, invalid dates, and out-of-range values', () => {
  assert.throws(() => validateFormSchema({ sections: [{ title: 'Empty', fields: [] }] }), /between 1 and 100 fields/);
  const schema = validateFormSchema({ sections: [{ fields: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'score', label: 'Score', type: 'number', validation: { minimum: 1, maximum: 5 } }
  ] }] });
  assert.throws(() => validateFormResponse(schema, { date: 'tomorrow', score: 8 }), /valid date/);
  assert.throws(() => validateFormResponse(schema, { date: '2026-09-25', score: 8 }), /above the maximum/);
});

test('configuration packages round-trip as validated unpublished definitions', () => {
  const exported = createConfigurationPackage('form_template', {
    code: 'child_profile', name: 'Child profile', entity_scope: 'child',
    draft_schema: { sections: [{ id: 'details', fields: [{ key: 'grade', label: 'Grade', type: 'text' }] }] }
  });
  assert.equal(exported.formatVersion, 1);
  const imported = readConfigurationPackage(exported, 'form_template');
  assert.equal(imported.code, 'child_profile');
  assert.equal(imported.schema.sections[0].fields[0].key, 'grade');
  assert.equal('status' in imported, false);
});

test('configuration imports reject mismatched or executable packages', () => {
  const documentPackage = createConfigurationPackage('document_type', {
    code: 'birth_certificate', name: 'Birth certificate', entity_scope: 'child', fulfillment_mode: 'upload', draft_definition: {}
  });
  assert.throws(() => readConfigurationPackage(documentPackage, 'form_template'), /different definition type/);
  assert.throws(() => readConfigurationPackage({
    format: 'scms-configuration', formatVersion: 1, kind: 'form_template',
    definition: { code: 'bad', name: 'Bad', entityScope: 'child', schema: { sections: [{ fields: [{ key: 'x', type: 'javascript' }] }] } }
  }, 'form_template'), /Unsupported/);
});

test('final child submission detects only missing active required uploads', () => {
  const workspace = {
    requirements: [
      { document_type_id: 1, name: 'Required upload', is_required: true, fulfillment_mode: 'upload' },
      { document_type_id: 2, name: 'Optional upload', is_required: false, fulfillment_mode: 'upload' },
      { document_type_id: 3, name: 'Digital form', is_required: true, fulfillment_mode: 'form' }
    ],
    files: [{ document_type_id: 1, status: 'superseded' }]
  };
  assert.deepEqual(missingRequiredUploads(workspace).map(item => item.document_type_id), [1]);
  workspace.files.push({ document_type_id: 1, status: 'pending_review' });
  assert.deepEqual(missingRequiredUploads(workspace), []);
});
