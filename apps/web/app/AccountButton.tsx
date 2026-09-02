"use client";

import { CircleUserRound, X } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

export function AccountButton() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

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

      {open && (
        <div className="account-sheet-layer">
          <button
            className="account-sheet-backdrop"
            type="button"
            aria-label="Close account"
            onClick={() => setOpen(false)}
          />
          <section
            className="account-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-sheet-title"
          >
            <header>
              <span />
              <h2 id="account-sheet-title">Account</h2>
              <button
                type="button"
                aria-label="Close account"
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="account-sheet-profile">
              <span aria-hidden="true">
                {(session?.user?.name ?? session?.user?.email ?? "J")
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <div>
                <strong>{session?.user?.name ?? "Jangoing user"}</strong>
                <small>{session?.user?.email}</small>
              </div>
            </div>
            <button
              className="account-sheet-signout"
              type="button"
              onClick={() => void signOut({ redirectTo: "/" })}
            >
              Sign Out
            </button>
          </section>
        </div>
      )}
    </>
  );
}
