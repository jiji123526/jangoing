"use client";

import type { CurrentHouseholdResponse } from "@jangoing/contracts";
import { createContext, useContext, type ReactNode } from "react";

const HouseholdContext = createContext<CurrentHouseholdResponse | null>(null);

export function HouseholdProvider({
  value,
  children,
}: {
  value: CurrentHouseholdResponse;
  children: ReactNode;
}) {
  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useCurrentHousehold(): CurrentHouseholdResponse {
  const value = useContext(HouseholdContext);
  if (!value) throw new Error("Household context is unavailable");
  return value;
}
