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
