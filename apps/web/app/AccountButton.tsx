"use client";

import type { HouseholdJoinCode } from "@jangoing/contracts";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Copy,
  Home,
  RotateCcw,
  Share2,
  UserPlus,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  createHouseholdJoinCode,
  revokeHouseholdJoinCode,
} from "../lib/api";
import { useCurrentHousehold } from "./HouseholdContext";

type AccountScreen = "overview" | "invite";

function formatExpiration(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function AccountButton() {
  const { user, household } = useCurrentHousehold();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<AccountScreen>("overview");
  const [joinCode, setJoinCode] = useState<HouseholdJoinCode | null>(null);
  const [busy, setBusy] = useState<"generate" | "revoke" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function resetDialog(): void {
    setOpen(false);
    setScreen("overview");
    setJoinCode(null);
    setBusy(null);
    setNotice(null);
    setError(null);
  }

  function closeDialog(): void {
    dialogRef.current?.close();
  }

  async function generateCode(): Promise<void> {
    if (
      joinCode &&
      !window.confirm(
        "Generate a new code? The current household code will stop working.",
      )
    ) {
      return;
    }

    setBusy("generate");
    setNotice(null);
    setError(null);
    try {
      setJoinCode(await createHouseholdJoinCode());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not generate an invite code.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function copyCode(): Promise<void> {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode.code);
      setNotice("Household code copied.");
      setError(null);
    } catch {
      setError("Could not copy the household code.");
    }
  }

  async function shareCode(): Promise<void> {
    if (!joinCode || !household) return;
    const text = [
      `Join ${household.name} on Jangoing.`,
      `Household code: ${joinCode.code}`,
      `Expires: ${formatExpiration(joinCode.expires_at)}`,
    ].join("\n");

    if (!navigator.share) {
      await copyCode();
      return;
    }

    try {
      await navigator.share({
        title: `Join ${household.name}`,
        text,
      });
      setNotice("Household invitation shared.");
      setError(null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("Could not share the household invitation.");
    }
  }

  async function revokeCode(): Promise<void> {
    if (
      !window.confirm(
        "Stop sharing? The current household code will no longer work.",
      )
    ) {
      return;
    }

    setBusy("revoke");
    setNotice(null);
    setError(null);
    try {
      await revokeHouseholdJoinCode();
      setJoinCode(null);
      setNotice("Household sharing stopped.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not stop household sharing.",
      );
    } finally {
      setBusy(null);
    }
  }

  const displayName = user.display_name ?? "Jangoing user";
  const initial = (user.display_name ?? user.email).slice(0, 1).toUpperCase();
  const isOwner = household?.role === "owner";

  return (
    <>
      <button
        className="home-profile-placeholder"
        type="button"
        aria-label="Open account"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <CircleUserRound size={30} strokeWidth={1.75} />
      </button>

      <dialog
        className="account-modal"
        ref={dialogRef}
        aria-labelledby="account-modal-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={resetDialog}
      >
        <div className="account-modal-page">
          <header className="account-modal-header">
            {screen === "invite" ? (
              <button
                className="account-modal-back"
                type="button"
                aria-label="Back to account"
                disabled={busy !== null}
                onClick={() => {
                  setScreen("overview");
                  setNotice(null);
                  setError(null);
                }}
              >
                <ChevronLeft size={28} />
              </button>
            ) : (
              <span className="account-modal-brand" aria-hidden="true">
                <Home size={20} strokeWidth={2.2} />
              </span>
            )}
            <h2 id="account-modal-title">
              {screen === "overview" ? "Jangoing Account" : "Household Invite"}
            </h2>
            <button
              className="account-modal-close"
              type="button"
              aria-label="Close account"
              disabled={busy !== null}
              onClick={closeDialog}
            >
              <X size={28} strokeWidth={2} />
            </button>
          </header>

          {screen === "overview" ? (
            <div className="account-modal-content">
              <section className="account-group account-identity-group">
                <div className="account-profile-row">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span aria-hidden="true">{initial}</span>
                  )}
                  <div>
                    <strong>{displayName}</strong>
                    <small>{user.email}</small>
                  </div>
                </div>
                <div className="account-household-row">
                  <span className="account-row-icon" aria-hidden="true">
                    <Home size={20} />
                  </span>
                  <div>
                    <strong>{household?.name}</strong>
                    <small>{isOwner ? "Owner" : "Member"}</small>
                  </div>
                </div>
              </section>

              <p className="account-group-note">
                Inventory and shopping data are shared with members of{" "}
                {household?.name}.
              </p>

              {isOwner && (
                <section className="account-group">
                  <button
                    className="account-settings-row"
                    type="button"
                    onClick={() => {
                      setScreen("invite");
                      setNotice(null);
                      setError(null);
                    }}
                  >
                    <span className="account-row-icon" aria-hidden="true">
                      <UserPlus size={20} />
                    </span>
                    <span>
                      <strong>Invite Household Member</strong>
                      <small>Create a 7-day household code</small>
                    </span>
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                </section>
              )}

              <section className="account-group account-destructive-group">
                <button
                  className="account-signout-row"
                  type="button"
                  onClick={() => void signOut({ redirectTo: "/" })}
                >
                  Sign Out
                </button>
              </section>
            </div>
          ) : (
            <div className="account-modal-content account-invite-content">
              <div className="account-invite-heading">
                <span aria-hidden="true">
                  <UserPlus size={28} />
                </span>
                <h3>Invite someone to {household?.name}</h3>
                <p>
                  Generate a temporary code for people who should share this
                  inventory and shopping list.
                </p>
              </div>

              {joinCode ? (
                <>
                  <section className="account-code-card">
                    <small>HOUSEHOLD CODE</small>
                    <strong>{joinCode.code}</strong>
                    <p>Expires {formatExpiration(joinCode.expires_at)}</p>
                  </section>

                  <div className="account-code-actions">
                    <button type="button" onClick={() => void copyCode()}>
                      <Copy size={20} />
                      Copy Code
                    </button>
                    <button type="button" onClick={() => void shareCode()}>
                      <Share2 size={20} />
                      Share
                    </button>
                  </div>

                  <section className="account-group">
                    <button
                      className="account-settings-row"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void generateCode()}
                    >
                      <span className="account-row-icon" aria-hidden="true">
                        <RotateCcw size={20} />
                      </span>
                      <span>
                        <strong>
                          {busy === "generate"
                            ? "Generating…"
                            : "Generate New Code"}
                        </strong>
                        <small>Replaces the code shown above</small>
                      </span>
                    </button>
                    <button
                      className="account-settings-row is-destructive"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void revokeCode()}
                    >
                      <span className="account-row-icon" aria-hidden="true">
                        <Ban size={20} />
                      </span>
                      <span>
                        <strong>
                          {busy === "revoke" ? "Stopping…" : "Stop Sharing"}
                        </strong>
                        <small>Invalidates the current code</small>
                      </span>
                    </button>
                  </section>
                </>
              ) : (
                <section className="account-invite-empty">
                  <strong>No code is displayed yet</strong>
                  <p>
                    Creating a code invalidates any previous household code.
                    The new code expires after seven days.
                  </p>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void generateCode()}
                  >
                    {busy === "generate"
                      ? "Generating Code…"
                      : "Generate Invite Code"}
                  </button>
                  <button
                    className="account-stop-existing"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void revokeCode()}
                  >
                    {busy === "revoke"
                      ? "Stopping Existing Invites…"
                      : "Stop Existing Invites"}
                  </button>
                </section>
              )}

              {notice && (
                <p className="account-feedback" role="status">{notice}</p>
              )}
              {error && (
                <p className="account-feedback is-error" role="alert">{error}</p>
              )}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
