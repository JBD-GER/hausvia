import assert from "node:assert/strict";
import test from "node:test";
import { paginateItems, parseListPage } from "./portal/listing.ts";

test("paginierte Portallisten begrenzen und normalisieren Seiten", () => {
  assert.equal(parseListPage("2"), 2);
  assert.equal(parseListPage("-1"), 1);
  assert.deepEqual(paginateItems([1, 2, 3, 4, 5], "2", 2), {
    items: [3, 4],
    page: 2,
    totalPages: 3,
    totalItems: 5,
  });
  assert.deepEqual(paginateItems([1, 2, 3], "99", 2).items, [3]);
});
