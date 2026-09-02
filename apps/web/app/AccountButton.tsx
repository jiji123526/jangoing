"use client";

import {
  UpdateHouseholdProfileRequestSchema,
  type HouseholdJoinCode,
  type HouseholdMember,
} from "@jangoing/contracts";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Copy,
  RotateCcw,
  Share2,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  createHouseholdJoinCode,
  getHouseholdMembers,
  removeHouseholdMember,
  revokeHouseholdJoinCode,
  updateHouseholdProfile,
} from "../lib/api";
import { useCurrentHousehold } from "./HouseholdContext";
import { LoadingSkeleton } from "./LoadingSkeleton";

type AccountScreen = "overview" | "invite" | "members" | "edit";
const accountModalTransitionMs = 420;
const householdColorPresets = [
  "#5ED6A7",
  "#64B5F6",
  "#FF8A65",
  "#F47FB0",
  "#FFD45C",
];

function formatExpiration(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function AccountButton() {
  const { user, household, setHousehold } = useCurrentHousehold();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const membersRequestRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [screen, setScreen] = useState<AccountScreen>("overview");
  const [joinCode, setJoinCode] = useState<HouseholdJoinCode | null>(null);
  const [busy, setBusy] = useState<"generate" | "revoke" | null>(null);
  const [members, setMembers] = useState<HouseholdMember[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileEmoji, setProfileEmoji] = useState("");
  const [profileColor, setProfileColor] = useState("#1F6B45");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open || dialog.open) return;

    dialog.showModal();
    void dialog.offsetHeight;
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open && members === null && !membersLoading) {
      void loadMembers();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function resetDialog(): void {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(false);
    setVisible(false);
    membersRequestRef.current += 1;
    setScreen("overview");
    setJoinCode(null);
    setBusy(null);
    setMembers(null);
    setMembersLoading(false);
    setRemovingMemberId(null);
    setMembersError(null);
    setProfileName("");
    setProfileEmoji("");
    setProfileColor("#1F6B45");
    setProfileSaving(false);
    setProfileError(null);
    setNotice(null);
    setError(null);
  }

  function closeDialog(): void {
    const dialog = dialogRef.current;
    if (!dialog?.open || closeTimerRef.current !== null) return;

    setVisible(false);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    closeTimerRef.current = window.setTimeout(
      () => dialog.close(),
      reduceMotion ? 0 : accountModalTransitionMs,
    );
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

  async function loadMembers(): Promise<void> {
    const requestId = membersRequestRef.current + 1;
    membersRequestRef.current = requestId;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const nextMembers = await getHouseholdMembers();
      if (membersRequestRef.current === requestId) {
        setMembers(nextMembers);
      }
    } catch (caught) {
      if (membersRequestRef.current === requestId) {
        setMembersError(
          caught instanceof Error
            ? caught.message
            : "Could not load household members.",
        );
      }
    } finally {
      if (membersRequestRef.current === requestId) {
        setMembersLoading(false);
      }
    }
  }

  async function removeMember(member: HouseholdMember): Promise<void> {
    const name = member.display_name ?? member.email;
    if (
      !window.confirm(
        `Remove ${name} from ${household?.name}? They will lose access to this household.`,
      )
    ) {
      return;
    }

    setRemovingMemberId(member.id);
    setMembersError(null);
    try {
      await removeHouseholdMember(member.id);
      setMembers((current) =>
        current?.filter((candidate) => candidate.id !== member.id) ?? null,
      );
    } catch (caught) {
      setMembersError(
        caught instanceof Error
          ? caught.message
          : "Could not remove the household member.",
      );
    } finally {
      setRemovingMemberId(null);
    }
  }

  function openHouseholdEditor(): void {
    if (!household || household.role !== "owner") return;
    setProfileName(household.name);
    setProfileEmoji(household.profile_emoji);
    setProfileColor(household.icon_color);
    setProfileError(null);
    setScreen("edit");
  }

  async function saveHouseholdProfile(): Promise<void> {
    setProfileError(null);
    const parsed = UpdateHouseholdProfileRequestSchema.safeParse({
      name: profileName,
      profile_emoji: profileEmoji,
      icon_color: profileColor,
    });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setProfileError(
        fields.profile_emoji?.[0] ??
          fields.name?.[0] ??
          fields.icon_color?.[0] ??
          "Check the household profile values.",
      );
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await updateHouseholdProfile(parsed.data);
      setHousehold(updated);
      setScreen("overview");
    } catch (caught) {
      setProfileError(
        caught instanceof Error
          ? caught.message
          : "Could not update the household profile.",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  const displayName = user.display_name ?? "Jangoing user";
  const initial = (user.display_name ?? user.email).slice(0, 1).toUpperCase();
  const isOwner = household?.role === "owner";
  const usesCustomProfileColor = !householdColorPresets.includes(
    profileColor.toUpperCase(),
  );
  const modalBusy =
    busy !== null || removingMemberId !== null || profileSaving;

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
        className={`account-modal${visible ? " is-visible" : ""}`}
        ref={dialogRef}
        aria-labelledby="account-modal-title"
        onClick={(event) => {
          if (event.target === event.currentTarget && !modalBusy) {
            closeDialog();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={resetDialog}
      >
        <div className="account-modal-page">
          <header className="account-modal-header">
            {screen !== "overview" ? (
              <button
                className="account-modal-back"
                type="button"
                aria-label="Back to account"
                disabled={modalBusy}
                onClick={() => {
                  setScreen("overview");
                  setNotice(null);
                  setError(null);
                }}
              >
                <ChevronLeft size={28} />
              </button>
            ) : (
              <span
                className="account-modal-brand"
                style={{ backgroundColor: household?.icon_color }}
                aria-hidden="true"
              >
                {household?.profile_emoji ?? "🏠"}
              </span>
            )}
            <h2 id="account-modal-title">
              {screen === "overview"
                ? household?.name ?? "Household"
                : screen === "invite"
                  ? "Household Invite"
                  : screen === "members"
                    ? "Household Members"
                    : "Edit Household"}
            </h2>
            <button
              className="account-modal-close"
              type="button"
              aria-label="Close account"
              disabled={modalBusy}
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
                {isOwner ? (
                  <button
                    className="account-household-row is-actionable"
                    type="button"
                    onClick={openHouseholdEditor}
                  >
                    <span
                      className="account-household-emoji"
                      style={{ backgroundColor: household?.icon_color }}
                      aria-hidden="true"
                    >
                      {household?.profile_emoji ?? "🏠"}
                    </span>
                    <span>
                      <strong>{household?.name}</strong>
                      <small>Owner · Edit household</small>
                    </span>
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="account-household-row">
                    <span
                      className="account-household-emoji"
                      style={{ backgroundColor: household?.icon_color }}
                      aria-hidden="true"
                    >
                      {household?.profile_emoji ?? "🏠"}
                    </span>
                    <div>
                      <strong>{household?.name}</strong>
                      <small>Member</small>
                    </div>
                  </div>
                )}
              </section>

              <p className="account-group-note">
                Inventory and shopping data are shared with members of{" "}
                {household?.name}.
              </p>

              <section className="account-group">
                <button
                  className="account-settings-row"
                  type="button"
                  onClick={() => {
                    setScreen("members");
                    setNotice(null);
                    setError(null);
                    if (members === null && !membersLoading) {
                      void loadMembers();
                    }
                  }}
                >
                  <span className="account-row-icon" aria-hidden="true">
                    <UsersRound size={20} />
                  </span>
                  <span>
                    <strong>Household Members</strong>
                    <small>
                      {members
                        ? `${members.length} member${members.length === 1 ? "" : "s"}`
                        : membersLoading
                          ? "Loading members…"
                          : "View shared access"}
                    </small>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
                {isOwner && (
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
                )}
              </section>

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
          ) : screen === "invite" ? (
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
          ) : screen === "members" ? (
            <div className="account-modal-content account-members-content">
              <div className="account-members-heading">
                <h3>People in {household?.name}</h3>
                <p>
                  Everyone listed here shares this household&apos;s inventory
                  and shopping list.
                </p>
              </div>

              {membersLoading && members === null ? (
                <LoadingSkeleton
                  variant="rows"
                  rows={3}
                  label="Loading household members"
                />
              ) : membersError && members === null ? (
                <section className="account-members-message">
                  <p role="alert">{membersError}</p>
                  <button type="button" onClick={() => void loadMembers()}>
                    Try Again
                  </button>
                </section>
              ) : (
                <section className="account-group account-member-list">
                  {members?.map((member) => {
                    const memberName = member.display_name ?? member.email;
                    const memberInitial = memberName.slice(0, 1).toUpperCase();
                    const isCurrentUser = member.id === user.id;
                    const canRemove = isOwner && member.role === "member";
                    return (
                      <div className="account-member-row" key={member.id}>
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="account-member-avatar" aria-hidden="true">
                            {memberInitial}
                          </span>
                        )}
                        <span className="account-member-copy">
                          <strong>
                            {memberName}
                            {isCurrentUser ? " (You)" : ""}
                          </strong>
                          <small>{member.email}</small>
                        </span>
                        <span className="account-member-role">
                          {member.role === "owner" ? "Owner" : "Member"}
                        </span>
                        {canRemove && (
                          <button
                            type="button"
                            aria-label={`Remove ${memberName}`}
                            disabled={removingMemberId !== null}
                            onClick={() => void removeMember(member)}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {membersError && members !== null && (
                <p className="account-feedback is-error" role="alert">
                  {membersError}
                </p>
              )}
              {!isOwner && (
                <p className="account-group-note">
                  Only the household owner can remove members.
                </p>
              )}
            </div>
          ) : (
            <div className="account-modal-content account-edit-content">
              <div className="account-profile-preview">
                <span
                  style={{ backgroundColor: profileColor }}
                  aria-hidden="true"
                >
                  {profileEmoji || "🏠"}
                </span>
                <strong>{profileName.trim() || "Household Name"}</strong>
                <small>Visible to everyone in this household</small>
              </div>

              <section className="account-edit-group">
                <label>
                  <span>Household Name</span>
                  <input
                    type="text"
                    value={profileName}
                    maxLength={80}
                    autoComplete="organization"
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                </label>
                <label>
                  <span>Emoji</span>
                  <input
                    className="account-emoji-input"
                    type="text"
                    value={profileEmoji}
                    maxLength={32}
                    autoComplete="off"
                    aria-describedby="account-emoji-help"
                    onChange={(event) => setProfileEmoji(event.target.value)}
                  />
                </label>
              </section>
              <p className="account-edit-help" id="account-emoji-help">
                Enter one emoji. It replaces the default house icon.
              </p>

              <section className="account-color-group">
                <div>
                  <strong>Icon Color</strong>
                </div>
                <div className="account-color-presets" aria-label="Icon colors">
                  {householdColorPresets.map((color) => (
                    <button
                      className={
                        profileColor.toUpperCase() === color
                          ? "is-selected"
                          : undefined
                      }
                      type="button"
                      key={color}
                      aria-label={`Use ${color}`}
                      aria-pressed={profileColor.toUpperCase() === color}
                      style={{ backgroundColor: color }}
                      onClick={() => setProfileColor(color)}
                    />
                  ))}
                  <label
                    className={`account-color-picker${
                      usesCustomProfileColor ? " is-selected" : ""
                    }`}
                    title="Choose a custom color"
                  >
                    <span aria-hidden="true">+</span>
                    <input
                      type="color"
                      value={profileColor}
                      aria-label="Choose a custom icon color"
                      onChange={(event) => setProfileColor(event.target.value)}
                    />
                  </label>
                </div>
              </section>

              {profileError && (
                <p className="account-feedback is-error" role="alert">
                  {profileError}
                </p>
              )}

              <button
                className="account-profile-save"
                type="button"
                disabled={
                  profileSaving ||
                  !profileName.trim() ||
                  !profileEmoji.trim()
                }
                onClick={() => void saveHouseholdProfile()}
              >
                {profileSaving ? "Saving…" : "Save Household"}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
