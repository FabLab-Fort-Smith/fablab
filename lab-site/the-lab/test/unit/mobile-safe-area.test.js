// Regression guard for the mobile PWA "main-menu heading cut off" fix.
// The app is display:standalone (src/app/manifest.js); without safe-area handling
// the top chrome renders under the status bar/notch. A safe-area CSS fix can't be
// behaviourally unit-tested in this node harness, so we assert the fix is present
// (cheap guard against a silent revert). Branch: fix/mobile-menu-heading-cutoff.
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("mobile safe-area insets (PWA standalone heading cutoff)", () => {
  test("viewport opts into safe-area insets (viewport-fit: cover)", () => {
    expect(read("src/app/layout.js")).toMatch(/viewportFit:\s*["']cover["']/);
  });

  test("sidebar (main menu) reserves the top safe-area inset", () => {
    const css = read("src/app/globals.css");
    const sidebar = css.match(/\.lab-sidebar\s*\{[^}]*\}/s)?.[0] || "";
    expect(sidebar).toMatch(/env\(safe-area-inset-top/);
  });

  test("topbar reserves the top safe-area inset", () => {
    const css = read("src/app/globals.css");
    const topbar = css.match(/\.lab-topbar\s*\{[^}]*\}/s)?.[0] || "";
    expect(topbar).toMatch(/env\(safe-area-inset-top/);
  });
});
