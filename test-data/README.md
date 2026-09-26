# SCMS import test data

`SCMS_Parent_Import_Test_50_Rows.xlsx` contains exactly 50 clearly marked parent rows plus separate instructions and mapping-guide worksheets.

Use these import selections:

- Profile: **Parents only**
- Worksheet: **Parents 50**
- Header row: **1**

Expected automatic mapping:

| Source heading | SCMS field         | Canonical code     |
| -------------- | ------------------ | ------------------ |
| P No           | Parent PN/O number | `parent.pNoONo`    |
| Parent CNIC    | Parent CNIC        | `parent.cnic`      |
| Parent Name    | Parent name        | `parent.name`      |
| Address        | Address            | `parent.address`   |
| Email          | Email              | `parent.email`     |
| Contact No     | Contact number     | `parent.contactNo` |

Run dry validation first. It does not modify operational data. Executing the job creates 50 provisional test parents; use guarded rollback before editing them or adding linked records if you want the test records removed safely.

## Active-grant concurrency fixture

`SCMS_Active_Grant_Import_Edge_Cases.xlsx` is paired with the meaningful demo dataset created by `npm run reset:demo-data`.

- Profile: **Mixed parent and child rows**
- Worksheet: **Grant Edge Cases**
- Header row: **1**

Its first data row targets Ayesha Raza, who already has an active Category A grant. Dry validation must classify it as `financial_dependency`; resolving it as **Keep protected record; skip row** preserves the child, approved category, grant period, and captured rate. The other rows cover a new child for an existing parent, a new parent/child pair, and an existing child without a grant.
