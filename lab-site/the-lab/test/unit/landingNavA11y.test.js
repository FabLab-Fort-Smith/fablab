/**
 * @jest-environment jsdom
 *
 * Landing top-nav accessibility (#124) + Sign In visibility (#123).
 * Runs in a per-file jsdom env so the repo's default node test env is untouched. Guards the
 * landing's own responsive nav: a real <button> hamburger toggle with aria-expanded/
 * aria-controls, keyboard (Esc) close with focus return, focus moved into the panel on open,
 * a discoverable Sign In action, and axe-clean markup — against regression.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import "@testing-library/jest-dom";

expect.extend(toHaveNoViolations);

// next/link → plain anchor so PublicNav renders in jsdom.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, onClick, className, style, ...rest }) => (
    <a href={href} onClick={onClick} className={className} style={style} {...rest}>{children}</a>
  ),
}));
// MatrixRain is only used by the hero, but the page module imports it — stub to a no-op so the
// module loads without a canvas.
jest.mock("@/app/components/effects/MatrixRain", () => ({ __esModule: true, default: () => null }));

import { PublicNav } from "@/app/page";

test("landing nav exposes a discoverable Sign In action (#123)", () => {
  const { getAllByRole } = render(<PublicNav />);
  const signIn = getAllByRole("link", { name: /sign-in/i });
  // Present in both the desktop row and the mobile panel.
  expect(signIn.length).toBeGreaterThanOrEqual(1);
  signIn.forEach(el => expect(el).toHaveAttribute("href", "/auth/login"));
});

test("hamburger toggle is a labelled button wired with aria-expanded/aria-controls (#124)", () => {
  const { getByRole } = render(<PublicNav />);
  const toggle = getByRole("button", { name: /open navigation menu/i });
  expect(toggle.tagName).toBe("BUTTON");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveAttribute("aria-controls", "landing-mobile-menu");
});

test("toggle opens the menu, moves focus into it, and Esc closes + restores focus (#124)", async () => {
  const { getByRole } = render(<PublicNav />);
  const toggle = getByRole("button", { name: /open navigation menu/i });

  fireEvent.click(toggle);
  const openToggle = getByRole("button", { name: /close navigation menu/i });
  expect(openToggle).toHaveAttribute("aria-expanded", "true");

  // Focus moved to the first item inside the panel (WCAG 2.4.3).
  const panel = document.getElementById("landing-mobile-menu");
  await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));

  // Escape closes and returns focus to the toggle (WCAG 2.1.2 no keyboard trap).
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() =>
    expect(getByRole("button", { name: /open navigation menu/i })).toHaveAttribute("aria-expanded", "false"),
  );
  expect(document.activeElement).toBe(toggle);
});

test("landing nav is axe-clean when closed and when open", async () => {
  const { container, getByRole } = render(<PublicNav />);
  expect(await axe(container)).toHaveNoViolations();

  fireEvent.click(getByRole("button", { name: /open navigation menu/i }));
  expect(await axe(container)).toHaveNoViolations();
});
