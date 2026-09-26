import test from "node:test";
import assert from "node:assert/strict";
import {
  importValuesEqual,
  mapImportRow,
  parseCsv,
  suggestMapping,
  validateMappedRow,
} from "./import-platform.js";

test("CSV parser preserves quoted commas and escaped quotes", () => {
  const rows = parseCsv(
    'PN,Parent Name,Address\r\nP-1,"Ali, Ahmed","House ""A"""\r\n',
  );
  assert.deepEqual(rows, [
    ["PN", "Parent Name", "Address"],
    ["P-1", "Ali, Ahmed", 'House "A"'],
  ]);
});

test("header suggestions understand common parent and child aliases", () => {
  assert.deepEqual(
    suggestMapping(
      ["P No", "Parent CNIC", "Student Name", "B Form No"],
      "mixed",
    ),
    {
      "parent.pNoONo": "P No",
      "parent.cnic": "Parent CNIC",
      "child.name": "Student Name",
      "child.cnicBformNo": "B Form No",
    },
  );
});

test("header suggestions support configured multilingual aliases", () => {
  assert.deepEqual(
    suggestMapping(["ملازم نمبر", "نام"], "parent", {
      "parent.pNoONo": ["ملازم نمبر"],
      "parent.name": ["نام"],
    }),
    {
      "parent.pNoONo": "ملازم نمبر",
      "parent.name": "نام",
    },
  );
});

test("row mapping normalizes identifiers and blanks without inventing values", () => {
  const mapped = mapImportRow(
    {
      "P No": " pn- 101 ",
      CNIC: "35201-1234567-8",
      Name: "  Parent One  ",
      Empty: "   ",
    },
    {
      "parent.pNoONo": "P No",
      "parent.cnic": "CNIC",
      "parent.name": "Name",
      "parent.unit": "Empty",
    },
  );
  assert.equal(mapped["parent.pNoONo"], "PN101");
  assert.equal(mapped["parent.cnic"], "3520112345678");
  assert.equal(mapped["parent.name"], "Parent One");
  assert.equal(mapped["parent.unit"], null);
});

test("dry-run validation rejects rows without parent identity and malformed child identifiers", () => {
  const result = validateMappedRow(
    { "child.name": "Child", "child.cnicBformNo": "123" },
    "child",
  );
  assert.deepEqual(
    result.errors.map((error) => error.code),
    ["PARENT_IDENTIFIER_REQUIRED", "INVALID_CHILD_IDENTIFIER"],
  );
});

test("rollback snapshot comparison is stable for JSON key order and dates", () => {
  assert.equal(importValuesEqual({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
  assert.equal(
    importValuesEqual(
      new Date("2026-01-01T00:00:00.000Z"),
      "2026-01-01T00:00:00.000Z",
    ),
    true,
  );
  assert.equal(
    importValuesEqual({ status: "pending" }, { status: "approved" }),
    false,
  );
});
