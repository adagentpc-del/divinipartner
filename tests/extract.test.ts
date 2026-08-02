/**
 * Pure-logic tests for the AI profile extraction pipeline (server/src/lib/
 * extract.ts, server/src/lib/extractDocument.ts). Covers only the
 * dependency-free bits (HTML stripping, document-type classification); the
 * actual LLM call and PDF parsing are exercised by the live smoke test since
 * they need a real model / real PDF bytes.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText } from "../server/src/lib/htmlText.ts";
import { classifyDocument } from "../server/src/lib/extractDocument.ts";

test("htmlToText strips scripts, styles, and tags, keeping readable text", () => {
  const html = "<html><head><style>.x{color:red}</style><script>alert(1)</script></head>" +
    "<body><h1>Acme Events</h1><p>We cater weddings and galas.</p></body></html>";
  const text = htmlToText(html);
  assert.ok(text.includes("Acme Events"));
  assert.ok(text.includes("We cater weddings and galas."));
  assert.equal(text.includes("alert(1)"), false);
  assert.equal(text.includes("color:red"), false);
});

test("htmlToText decodes common HTML entities", () => {
  const text = htmlToText("<p>Tables &amp; chairs &mdash; &quot;premium&quot; &#39;rentals&#39;</p>".replace("&mdash;", "-"));
  assert.ok(text.includes("Tables & chairs"));
  assert.ok(text.includes('"premium"'));
  assert.ok(text.includes("'rentals'"));
});

test("htmlToText collapses excessive blank lines and whitespace", () => {
  const text = htmlToText("<p>One</p><p></p><p></p><p></p><p>Two</p>");
  assert.equal(/\n{3,}/.test(text), false);
});

test("classifyDocument recognizes PDF by content-type", () => {
  assert.equal(classifyDocument("application/pdf", "ratesheet"), "pdf");
});

test("classifyDocument recognizes PDF by extension when content-type is generic", () => {
  assert.equal(classifyDocument("application/octet-stream", "floorplan.PDF"), "pdf");
});

test("classifyDocument recognizes plain text", () => {
  assert.equal(classifyDocument("text/plain", "notes.txt"), "text");
  assert.equal(classifyDocument(null, "notes.txt"), "text");
});

test("classifyDocument returns null for unsupported types", () => {
  assert.equal(classifyDocument("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "menu.docx"), null);
  assert.equal(classifyDocument("image/jpeg", "photo.jpg"), null);
  assert.equal(classifyDocument(null, null), null);
});
