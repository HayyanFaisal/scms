const BANKING_FIELDS = [
  'P_No_O_No',
  'Bank_Name',
  'Account_Title',
  'Account_Number',
  'Branch_Code',
  'Branch_Address',
  'IBAN',
  'Routing_Number',
  'CNIC_of_Account_Holder',
  'Bank_Name_Branch',
];

function clean(value, maximum) {
  const normalized = String(value ?? '').trim();
  if (normalized.length > maximum) throw bankingError('A banking field is longer than allowed.');
  return normalized || null;
}

export function bankingError(message, status = 400, code = 'BANKING_VALIDATION_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.publicCode = code;
  return error;
}

export function normalizeBankingPayload(payload, { parentPNo = null } = {}) {
  const bankName = clean(payload.Bank_Name ?? payload.bank_name, 100);
  const accountTitle = clean(payload.Account_Title ?? payload.account_title, 100);
  const accountNumber = clean(payload.Account_Number ?? payload.account_number, 50);
  if (!bankName || !accountTitle || !accountNumber) {
    throw bankingError('Bank name, account title, and account number are required.');
  }
  if (!/^[A-Za-z0-9 .()&'/-]{2,100}$/.test(bankName)) throw bankingError('Enter a valid bank name.');
  if (!/^[A-Za-z0-9 .()&'/-]{2,100}$/.test(accountTitle)) throw bankingError('Enter a valid account title.');
  if (!/^[A-Za-z0-9-]{4,50}$/.test(accountNumber.replaceAll(' ', ''))) {
    throw bankingError('Enter a valid account number using letters, numbers, spaces, or hyphens.');
  }

  const rawIban = clean(payload.IBAN ?? payload.iban, 50);
  const iban = rawIban ? rawIban.replace(/\s+/g, '').toUpperCase() : null;
  if (iban && !/^PK\d{2}[A-Z0-9]{20}$/.test(iban)) {
    throw bankingError('Pakistan IBAN must contain 24 characters and start with PK followed by two digits.');
  }
  const rawCnic = clean(payload.CNIC_of_Account_Holder ?? payload.cnic_of_account_holder, 20);
  const cnic = rawCnic ? rawCnic.replace(/\D/g, '') : null;
  if (cnic && !/^\d{13}$/.test(cnic)) throw bankingError('Account-holder CNIC must contain exactly 13 digits.');

  const branchAddress = clean(payload.Branch_Address ?? payload.branch_address, 255);
  return {
    P_No_O_No: parentPNo || clean(payload.P_No_O_No, 50),
    Bank_Name: bankName,
    Account_Title: accountTitle,
    Account_Number: accountNumber.replaceAll(' ', ''),
    Branch_Code: clean(payload.Branch_Code ?? payload.branch_code, 20),
    Branch_Address: branchAddress,
    IBAN: iban,
    Routing_Number: clean(payload.Routing_Number ?? payload.routing_number, 20),
    CNIC_of_Account_Holder: cnic,
    Bank_Name_Branch: branchAddress ? `${bankName}, ${branchAddress}` : bankName,
  };
}

export function bankingSnapshot(row) {
  return Object.fromEntries(BANKING_FIELDS.map(field => [field, row?.[field] ?? null]));
}

export async function appendBankingHistory(connection, record, {
  action,
  reason = null,
  actorType,
  actorId,
} = {}) {
  await connection.query(
    `INSERT INTO scms_banking_history
      (account_id, version_number, action, verification_status, snapshot, reason, actor_type, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.Account_ID, Number(record.Row_Version || 1), action,
      record.Verification_Status || 'pending_evidence', JSON.stringify(bankingSnapshot(record)),
      reason || null, actorType, String(actorId)],
  );
}
