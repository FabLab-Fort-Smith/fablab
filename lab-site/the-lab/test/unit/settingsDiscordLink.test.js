/**
 * @jest-environment jsdom
 *
 * Settings → Integrations, Discord link-intent guard (#83 items 3 & 4).
 * Runs in a per-file jsdom env so the repo's default node test env is untouched.
 *
 * Guards two low-severity findings deferred from the #82 review:
 *  - Item 4: the "Connect Discord" flow must check res.ok on POST /api/v1/auth/link-intent
 *    before starting the OAuth round-trip. `fetch` only rejects on a network error, so a
 *    401/500 would otherwise sail through and Discord sign-in could create a duplicate account
 *    or trigger a merge instead of a link. On a non-ok response it must ABORT (no signIn) and
 *    surface an error.
 *  - Item 3: "Connected" must be reconciled on discordId (what auth.js matches sign-ins on),
 *    not discordHandle — a handle-without-id record must not read as connected.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const signIn = jest.fn();
jest.mock("next-auth/react", () => ({ __esModule: true, signIn: (...a) => signIn(...a) }));

import SettingsTab from "@/app/components/profile/tabs/settings";

const baseUser = {
    userID: "u-1",
    email: "member@example.org",
    privacy: { showDiscord: true, showPhone: false },
    notificationPreferences: { email: true, discord: false },
    googleId: "",
};

afterEach(() => {
    jest.clearAllMocks();
    delete global.fetch;
});

test("Item 4: a non-ok link-intent aborts the OAuth round-trip and surfaces an error", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const { getByText, findByText } = render(<SettingsTab user={baseUser} />);

    fireEvent.click(getByText("Connect Discord"));

    // Error surfaced to the user...
    await findByText(/Could not start Discord linking/i);
    // ...and the OAuth round-trip was NOT started (would otherwise dupe/merge the account).
    expect(signIn).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/auth/link-intent", { method: "POST" });
});

test("Item 4: an ok link-intent marks intent, then starts Discord sign-in", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const { getByText } = render(<SettingsTab user={baseUser} />);

    fireEvent.click(getByText("Connect Discord"));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledWith("discord", expect.objectContaining({ callbackUrl: expect.stringContaining("/profile?tab=3") }));
});

test("Item 3: connected state is reconciled on discordId, not discordHandle", () => {
    // A stale handle with no id must NOT read as connected.
    const handleOnly = render(<SettingsTab user={{ ...baseUser, discordId: "", discordHandle: "ghost#0001" }} />);
    expect(handleOnly.getByText("Connect Discord")).toBeInTheDocument();
    expect(handleOnly.queryByText("Reconnect Discord")).not.toBeInTheDocument();
    handleOnly.unmount();

    // A real linked account (discordId present) reads as connected.
    const linked = render(<SettingsTab user={{ ...baseUser, discordId: "1234567890", discordHandle: "real#0002" }} />);
    expect(linked.getByText("Reconnect Discord")).toBeInTheDocument();
    expect(linked.getByText(/Connected as: real#0002/)).toBeInTheDocument();
});
