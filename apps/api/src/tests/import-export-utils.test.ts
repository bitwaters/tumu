import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import { createStore } from "../data.js";
import { buildCloseoutPdf, buildExportFileName, csvRowsToObjects, parseCsv, safeFileName, toCsv } from "../services/import-export/index.js";

test("CSV utility escapes Excel-compatible values and parses them back", () => {
  const csv = toCsv(["name", "note"], [{ name: "A,1", note: 'line "quoted"\nnext' }]);

  ok(csv.startsWith("\uFEFF"));
  const rows = parseCsv(csv);
  deepEqual(rows, [["name", "note"], ["A,1", 'line "quoted"\nnext']]);
  deepEqual(csvRowsToObjects(rows), [{ name: "A,1", note: 'line "quoted"\nnext' }]);
});

test("file naming helpers remove unsafe path characters", () => {
  equal(safeFileName("  ITEM/2026:0001  "), "ITEM-2026-0001");
  equal(safeFileName("../hidden"), "hidden");
  equal(buildExportFileName(["site items"], "csv", new Date("2026-06-26T08:20:30Z")), "site-items-20260626T082030Z.csv");
});

test("CSV export neutralizes spreadsheet formulas in string fields", () => {
  const rows = parseCsv(toCsv(["title", "count"], [{ title: "=cmd", count: -1 }]));

  deepEqual(rows, [["title", "count"], ["'=cmd", "-1"]]);
});

test("closeout PDF utility includes item, workflow and photo manifest text", () => {
  const store = createStore();
  const item = store.siteItems[0]!;
  const pdf = buildCloseoutPdf({
    item,
    workflowLogs: store.workflowLogs.filter((log) => log.siteItemId === item.id),
    photos: store.photos.filter((photo) => photo.siteItemId === item.id),
    generatedAt: new Date("2026-06-26T08:20:30Z")
  });
  const text = Buffer.from(pdf).toString("utf8");

  ok(text.startsWith("%PDF-1.4"));
  ok(text.includes("ITEM-2026-0001"));
  ok(text.includes("Workflow Logs"));
  ok(text.includes("Photo Manifest"));
});
