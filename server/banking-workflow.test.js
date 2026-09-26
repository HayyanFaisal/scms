import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBankingPayload } from './banking-workflow.js';

test('banking payload normalization accepts and canonicalizes Pakistan banking values', () => {
  const result = normalizeBankingPayload({
    bank_name: 'Meezan Bank',
    account_title: 'Ahmed Raza',
    account_number: '0010 000001',
    iban: 'pk36 mezn 0000 0000 1000 0001',
    cnic_of_account_holder: '42101-1234567-1',
  }, { parentPNo: 'PN-1' });
  assert.equal(result.P_No_O_No, 'PN-1');
  assert.equal(result.Account_Number, '0010000001');
  assert.equal(result.IBAN, 'PK36MEZN0000000010000001');
  assert.equal(result.CNIC_of_Account_Holder, '4210112345671');
});

test('banking payload normalization rejects incomplete and malformed records', () => {
  assert.throws(() => normalizeBankingPayload({ bank_name: 'Bank' }), /required/);
  assert.throws(() => normalizeBankingPayload({
    bank_name: 'Bank', account_title: 'Account', account_number: '1234', iban: 'PK00BAD',
  }), /24 characters/);
});
