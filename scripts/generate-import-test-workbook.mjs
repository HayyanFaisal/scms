import fs from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";

const outputDirectory = path.resolve("test-data");
const outputPath = path.join(
  outputDirectory,
  "SCMS_Parent_Import_Test_50_Rows.xlsx",
);

const workbook = new ExcelJS.Workbook();
workbook.creator = "SCMS Development Team";
workbook.created = new Date("2026-09-26T00:00:00.000Z");
workbook.subject = "Safe 50-row parent import test workbook";

const instructions = workbook.addWorksheet("Read Me", {
  views: [{ state: "frozen", ySplit: 1 }],
});
instructions.columns = [
  { header: "Item", key: "item", width: 28 },
  { header: "Guidance", key: "guidance", width: 100 },
];
instructions.addRows([
  {
    item: "Import profile",
    guidance: "Choose Parents only.",
  },
  {
    item: "Worksheet",
    guidance: "Choose Parents 50.",
  },
  {
    item: "Header row",
    guidance: "Use row 1.",
  },
  {
    item: "Safe first test",
    guidance:
      "Run dry validation first. It does not change operational records. Execute only in a test database or when you intend to create these 50 clearly marked provisional parents.",
  },
  {
    item: "Cleanup",
    guidance:
      "If you execute the workbook, use the guarded rollback on the completed import before adding linked records or editing the imported parents.",
  },
  {
    item: "Identifiers",
    guidance:
      "Every PN/O number starts SCMS-TEST-50- and every name starts Import Test Parent, making test records easy to identify.",
  },
]);

const data = workbook.addWorksheet("Parents 50", {
  views: [{ state: "frozen", ySplit: 1 }],
  autoFilter: { from: "A1", to: "F51" },
});
data.columns = [
  { header: "P No", key: "pno", width: 22 },
  { header: "Parent CNIC", key: "cnic", width: 20 },
  { header: "Parent Name", key: "name", width: 30 },
  { header: "Address", key: "address", width: 42 },
  { header: "Email", key: "email", width: 34 },
  { header: "Contact No", key: "contact", width: 18 },
];

for (let index = 1; index <= 50; index += 1) {
  const suffix = String(index).padStart(4, "0");
  data.addRow({
    pno: `SCMS-TEST-50-${suffix}`,
    cnic: `99999000${String(index).padStart(5, "0")}`,
    name: `Import Test Parent ${String(index).padStart(2, "0")}`,
    address: `Test House ${index}, Air-Gapped Verification Colony`,
    email: `import.test.${index}@example.invalid`,
    contact: `0300${String(index).padStart(7, "0")}`,
  });
}

const mapping = workbook.addWorksheet("Mapping Guide", {
  views: [{ state: "frozen", ySplit: 1 }],
});
mapping.columns = [
  { header: "Source heading", key: "source", width: 24 },
  { header: "SCMS destination", key: "label", width: 30 },
  { header: "Canonical field code", key: "field", width: 30 },
  { header: "Suggested transform", key: "transform", width: 34 },
];
mapping.addRows([
  {
    source: "P No",
    label: "Parent PN/O number",
    field: "parent.pNoONo",
    transform: "trim → normalize_identifier",
  },
  {
    source: "Parent CNIC",
    label: "Parent CNIC",
    field: "parent.cnic",
    transform: "trim → normalize_identifier",
  },
  {
    source: "Parent Name",
    label: "Parent name",
    field: "parent.name",
    transform: "trim",
  },
  {
    source: "Address",
    label: "Address",
    field: "parent.address",
    transform: "trim",
  },
  {
    source: "Email",
    label: "Email",
    field: "parent.email",
    transform: "trim",
  },
  {
    source: "Contact No",
    label: "Contact number",
    field: "parent.contactNo",
    transform: "trim",
  },
]);

for (const worksheet of workbook.worksheets) {
  const header = worksheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17365D" },
  };
  header.alignment = { vertical: "middle" };
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "top", wrapText: true };
      if (rowNumber % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F6FA" },
        };
      }
    }
  });
}

await fs.mkdir(outputDirectory, { recursive: true });
await workbook.xlsx.writeFile(outputPath);
console.log(outputPath);
