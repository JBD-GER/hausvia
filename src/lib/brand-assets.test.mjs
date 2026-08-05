import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const { ASSETS } = await import("./site.ts");

test("verwendet ausschließlich die neuen cache-sicheren Hausvia Markenassets", () => {
  assert.deepEqual(
    {
      logo: ASSETS.logo,
      mark: ASSETS.mark,
      favicon: ASSETS.favicon,
      appleIcon: ASSETS.appleIcon,
    },
    {
      logo: "/hausvia-logo-2026.png",
      mark: "/hausvia-icon-2026.png",
      favicon: "/hausvia-favicon-2026.png",
      appleIcon: "/hausvia-apple-touch-icon-2026.png",
    },
  );

  for (const asset of [
    ASSETS.logo,
    ASSETS.emailLogo,
    ASSETS.mark,
    ASSETS.favicon,
    ASSETS.appleIcon,
    "/hausvia-logo-pdf.jpg",
  ]) {
    assert.equal(existsSync(path.join(process.cwd(), "public", asset)), true, asset);
  }

  for (const removedAsset of ["favicon.svg", "hausvia-logo.svg", "hausvia-mark.svg"]) {
    assert.equal(existsSync(path.join(process.cwd(), "public", removedAsset)), false, removedAsset);
  }
});
