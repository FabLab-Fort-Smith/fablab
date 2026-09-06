/**
 * @jest-environment jsdom
 *
 * AC-8b: automated a11y smoke test (axe-core) for the shared admin shell navigation. Runs in a
 * per-file jsdom env so the repo's default node test env is untouched. Guards the Sidebar landmark +
 * aria-current + axe-clean markup against regression.
 */
import React from "react";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import "@testing-library/jest-dom";

expect.extend(toHaveNoViolations);

// Mock Next primitives so the real Sidebar renders in jsdom.
jest.mock("next/navigation", () => ({ __esModule: true, usePathname: () => "/dashboard/admin" }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }));
jest.mock("next/image", () => ({ __esModule: true, default: ({ alt = "", ...rest }) => <img alt={alt} {...rest} /> }));
jest.mock("next-auth/react", () => ({ __esModule: true, signOut: jest.fn() }));

import Sidebar from "@/app/components/layout/Sidebar";

const ADMIN = { user: { role: "admin", userID: "admin-1", username: "ada", name: "Ada Lovelace" } };

test("admin Sidebar has a named nav landmark, marks the active link, and is axe-clean", async () => {
  const { container, getByRole } = render(<Sidebar session={ADMIN} open onClose={() => {}} isMobile={false} />);

  // Named navigation landmark (WCAG 1.3.1 / 2.4.1).
  const nav = getByRole("navigation", { name: /primary/i });
  expect(nav).toBeInTheDocument();

  // Active route is programmatically indicated (WCAG 4.1.2), not by color alone.
  const current = container.querySelector('a[aria-current="page"]');
  expect(current).toBeTruthy();
  expect(current.getAttribute("href")).toBe("/dashboard/admin");

  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
