"use client";

import type {
  CurrentHouseholdResponse,
  HouseholdSummary,
} from "@jangoing/contracts";
import {
  Check,
  ChevronLeft,
  KeyRound,
  PackageOpen,
  UsersRound,
  X,
} from "lucide-react";
import type { Session } from "next-auth";
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createHousehold,
  getCurrentHousehold,
  joinHousehold,
} from "../lib/api";
import { HouseholdProvider } from "./HouseholdContext";
import { LoadingSkeleton } from "./LoadingSkeleton";

type OnboardingStep = "choice" | "join" | "create" | "complete";
type HouseholdChoice = "join" | "create";
type HouseholdAccessState = "checking" | "needs_setup" | "ready";

function formatJoinCode(value: string): string {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, 10);
  return [normalized.slice(0, 4), normalized.slice(4, 8), normalized.slice(8)]
    .filter(Boolean)
    .join("-");
}

function LoadingScreen(): ReactNode {
  return (
    <main className="auth-onboarding-shell is-loading" aria-busy="true">
      <section className="auth-onboarding-loading">
        <LoadingSkeleton
          variant="page"
          rows={4}
          label="Opening your kitchen"
        />
      </section>
    </main>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [accessState, setAccessState] =
    useState<HouseholdAccessState>("checking");
  const [householdAccess, setHouseholdAccess] =
    useState<CurrentHouseholdResponse | null>(null);
  const [step, setStep] = useState<OnboardingStep>("choice");
  const [choice, setChoice] = useState<HouseholdChoice | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [completedHousehold, setCompletedHousehold] =
    useState<HouseholdSummary | null>(null);
  const [createdJoinCode, setCreatedJoinCode] = useState<string | null>(null);
  const [createdCodeCopied, setCreatedCodeCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sharedJoinCode = formatJoinCode(searchParams.get("joinCode") ?? "");
  const returnTo = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  useEffect(() => {
    if (status !== "authenticated") {
      setAccessState("checking");
      setHouseholdAccess(null);
      return;
    }

    setAccessState("checking");
    let cancelled = false;
    void getCurrentHousehold()
      .then((result) => {
        if (cancelled) return;
        setHouseholdAccess(result);
        if (result.household) {
          setAccessState("ready");
        } else {
          setAccessState("needs_setup");
          setStep("choice");
        }
      })
      .catch((caught) => {
        if (cancelled) return;
        setAccessState("needs_setup");
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not check your household.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status === "authenticated" && accessState === "needs_setup") {
      titleRef.current?.focus();
    }
  }, [accessState, status, step]);

  useEffect(() => {
    if (accessState !== "needs_setup" || !sharedJoinCode) return;
    setChoice("join");
    setJoinCode(sharedJoinCode);
    setStep("join");
    setError(null);
  }, [accessState, sharedJoinCode]);

  if (
    status === "loading" ||
    (status === "authenticated" && accessState === "checking")
  ) {
    return <LoadingScreen />;
  }

  if (status === "unauthenticated") {
    return (
      <main className="auth-onboarding-shell">
        <section className="auth-onboarding-sheet auth-onboarding-intro">
          <div className="auth-onboarding-art" aria-hidden="true">
            <span><PackageOpen size={44} strokeWidth={1.55} /></span>
            <i />
            <i />
          </div>
          <div className="auth-onboarding-copy">
            <p className="auth-onboarding-eyebrow">JANGOING</p>
            <h1>Your kitchen, shared</h1>
            <p>
              Keep inventory, shopping, and household updates together in one
              private kitchen.
            </p>
            <p className="auth-onboarding-signin-note">
              Sign-in is required to use Jangoing.
            </p>
          </div>
          <footer className="auth-onboarding-footer">
            <button
              type="button"
              onClick={() => void signIn("google", { redirectTo: returnTo })}
            >
              Continue with Google
            </button>
          </footer>
        </section>
      </main>
    );
  }

  if (accessState === "ready" && householdAccess?.household) {
    return (
      <HouseholdProvider value={householdAccess}>
        {children}
      </HouseholdProvider>
    );
  }

  async function submitJoin(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const result = await joinHousehold(joinCode);
      setCompletedHousehold(result.household);
      setHouseholdAccess((current) =>
        current ? { ...current, household: result.household } : current,
      );
      setCreatedJoinCode(null);
      setStep("complete");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not join household.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCreate(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const result = await createHousehold(householdName);
      setCompletedHousehold(result.household);
      setHouseholdAccess((current) =>
        current ? { ...current, household: result.household } : current,
      );
      setCreatedJoinCode(result.join_code.code);
      setCreatedCodeCopied(false);
      setStep("complete");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create household.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function goBack(): void {
    setError(null);
    setStep("choice");
  }

  async function copyCreatedJoinCode(): Promise<void> {
    if (!createdJoinCode) return;
    try {
      await navigator.clipboard.writeText(createdJoinCode);
      setCreatedCodeCopied(true);
      setError(null);
    } catch {
      setError("Could not copy the household code.");
    }
  }

  const title =
    step === "choice"
      ? "Set up your household"
      : step === "join"
        ? "Enter household code"
        : step === "create"
          ? "Create your household"
          : completedHousehold?.role === "owner"
            ? "Your household is ready"
            : `You joined ${completedHousehold?.name ?? "your household"}`;

  return (
    <main className="auth-onboarding-shell">
      <section className="auth-onboarding-sheet">
        <header className="auth-onboarding-header">
          {step === "choice" ? (
            <span />
          ) : step === "complete" ? (
            <span />
          ) : (
            <button
              className="auth-onboarding-back"
              type="button"
              aria-label="Back to household choice"
              onClick={goBack}
              disabled={submitting}
            >
              <ChevronLeft size={25} />
              <span>Back</span>
            </button>
          )}
          <span>HOUSEHOLD SETUP</span>
          <button
            className="auth-onboarding-close"
            type="button"
            aria-label="Close household setup and sign out"
            onClick={() => void signOut({ redirectTo: "/" })}
            disabled={submitting}
          >
            <X size={22} strokeWidth={3} />
          </button>
        </header>

        <div className="auth-onboarding-body">
          <div className="auth-onboarding-heading">
            <h1 ref={titleRef} tabIndex={-1}>{title}</h1>
            {step === "choice" && (
              <p>Join the kitchen you share, or start a new one.</p>
            )}
            {step === "join" && (
              <p>
                {sharedJoinCode
                  ? "Your invite code is ready below."
                  : "Ask someone at home for their current household code."}
              </p>
            )}
            {step === "create" && (
              <p>This name will be visible to everyone who joins.</p>
            )}
          </div>

          {step === "choice" && (
            <div className="auth-onboarding-options">
              <button
                type="button"
                className={choice === "join" ? "is-selected" : ""}
                aria-pressed={choice === "join"}
                onClick={() => setChoice("join")}
              >
                <span className="auth-onboarding-option-icon">
                  <KeyRound size={22} />
                </span>
                <span>
                  <strong>Join an existing household</strong>
                  <small>Use a code shared by someone at home</small>
                </span>
                <i>{choice === "join" && <Check size={16} />}</i>
              </button>
              <button
                type="button"
                className={choice === "create" ? "is-selected" : ""}
                aria-pressed={choice === "create"}
                onClick={() => setChoice("create")}
              >
                <span className="auth-onboarding-option-icon">
                  <UsersRound size={22} />
                </span>
                <span>
                  <strong>Create a new household</strong>
                  <small>Start a new inventory and shopping list</small>
                </span>
                <i>{choice === "create" && <Check size={16} />}</i>
              </button>
            </div>
          )}

          {step === "join" && (
            <div className="auth-onboarding-form-group">
              <label htmlFor="household-code">Household Code</label>
              <input
                id="household-code"
                value={joinCode}
                onChange={(event) => setJoinCode(formatJoinCode(event.target.value))}
                placeholder="ABCD-EFGH-JK"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                autoFocus
              />
              <small>Codes contain ten letters or numbers.</small>
            </div>
          )}

          {step === "create" && (
            <div className="auth-onboarding-form-group">
              <label htmlFor="household-name">Household Name</label>
              <input
                id="household-name"
                value={householdName}
                onChange={(event) => setHouseholdName(event.target.value)}
                placeholder="My Home"
                maxLength={80}
                autoComplete="organization"
                autoFocus
              />
              <small>You can manage sharing from your profile later.</small>
            </div>
          )}

          {step === "complete" && completedHousehold && (
            <div className="auth-onboarding-complete">
              <span><Check size={34} strokeWidth={2} /></span>
              <strong>{completedHousehold.name}</strong>
              <p>
                {createdJoinCode
                  ? "Share this code with people in your household."
                  : "Your shared inventory is ready."}
              </p>
              {createdJoinCode && (
                <button
                  type="button"
                  onClick={() => void copyCreatedJoinCode()}
                >
                  <small>HOUSEHOLD CODE</small>
                  <b>{createdJoinCode}</b>
                  <em>{createdCodeCopied ? "Copied" : "Tap to copy"}</em>
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="auth-onboarding-error" role="alert">{error}</p>
          )}
        </div>

        <footer className="auth-onboarding-footer">
          {step === "choice" && (
            <button
              type="button"
              disabled={!choice}
              onClick={() => {
                setError(null);
                if (choice) setStep(choice);
              }}
            >
              {choice === "join"
                ? "Enter Household Code"
                : choice === "create"
                  ? "Create Household"
                  : "Continue"}
            </button>
          )}
          {step === "join" && (
            <button
              type="button"
              disabled={joinCode.replaceAll("-", "").length !== 10 || submitting}
              onClick={() => void submitJoin()}
            >
              {submitting ? "Joining…" : "Join Household"}
            </button>
          )}
          {step === "create" && (
            <button
              type="button"
              disabled={!householdName.trim() || submitting}
              onClick={() => void submitCreate()}
            >
              {submitting ? "Creating…" : "Create Household"}
            </button>
          )}
          {step === "complete" && (
            <button type="button" onClick={() => setAccessState("ready")}>
              Open My Kitchen
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}

export function AppAuthGate({
  initialSession,
  children,
}: {
  initialSession: Session | null;
  children: ReactNode;
}) {
  return (
    <SessionProvider session={initialSession}>
      <Gate>{children}</Gate>
    </SessionProvider>
  );
}
