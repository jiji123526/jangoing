"use client";

import type { HouseholdSummary } from "@jangoing/contracts";
import {
  Check,
  ChevronLeft,
  KeyRound,
  LoaderCircle,
  PackageOpen,
  UsersRound,
} from "lucide-react";
import type { Session } from "next-auth";
import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createHousehold,
  getCurrentHousehold,
  joinHousehold,
} from "../lib/api";

type OnboardingStep = "choice" | "join" | "create" | "complete";
type HouseholdChoice = "join" | "create";

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
    <main className="auth-onboarding-shell" aria-busy="true">
      <section className="auth-onboarding-loading" aria-live="polite">
        <span className="auth-onboarding-mark" aria-hidden="true">
          <PackageOpen size={34} strokeWidth={1.7} />
        </span>
        <LoaderCircle className="auth-onboarding-spinner" size={24} />
        <p>Opening your kitchen…</p>
      </section>
    </main>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [accessReady, setAccessReady] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("choice");
  const [choice, setChoice] = useState<HouseholdChoice | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [completedHousehold, setCompletedHousehold] =
    useState<HouseholdSummary | null>(null);
  const [createdJoinCode, setCreatedJoinCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setAccessReady(false);
      return;
    }

    let cancelled = false;
    void getCurrentHousehold()
      .then((result) => {
        if (cancelled) return;
        if (result.household) {
          setAccessReady(true);
        } else {
          setAccessReady(false);
          setStep("choice");
        }
      })
      .catch((caught) => {
        if (cancelled) return;
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
    if (status === "authenticated" && !accessReady) {
      titleRef.current?.focus();
    }
  }, [accessReady, status, step]);

  if (status === "loading") return <LoadingScreen />;

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
          </div>
          <footer className="auth-onboarding-footer">
            <button
              type="button"
              onClick={() => void signIn("google", { redirectTo: "/" })}
            >
              Continue with Google
            </button>
            <small>Sign-in is required to use Jangoing.</small>
          </footer>
        </section>
      </main>
    );
  }

  if (accessReady) return children;

  async function submitJoin(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const result = await joinHousehold(joinCode);
      setCompletedHousehold(result.household);
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
      setCreatedJoinCode(result.join_code.code);
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
            <button
              className="auth-onboarding-text-action"
              type="button"
              onClick={() => void signOut({ redirectTo: "/" })}
            >
              Sign Out
            </button>
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
            </button>
          )}
          <span>HOUSEHOLD SETUP</span>
          <span />
        </header>

        <div className="auth-onboarding-body">
          <div className="auth-onboarding-heading">
            <h1 ref={titleRef} tabIndex={-1}>{title}</h1>
            {step === "choice" && (
              <p>Join the kitchen you share, or start a new one.</p>
            )}
            {step === "join" && (
              <p>Ask someone at home for their current household code.</p>
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
                  onClick={() => void navigator.clipboard.writeText(createdJoinCode)}
                >
                  <small>HOUSEHOLD CODE</small>
                  <b>{createdJoinCode}</b>
                  <em>Tap to copy</em>
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
            <button type="button" onClick={() => setAccessReady(true)}>
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
