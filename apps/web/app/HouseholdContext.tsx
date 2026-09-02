"use client";

import type {
  CurrentHouseholdResponse,
  HouseholdSummary,
} from "@jangoing/contracts";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface HouseholdContextValue extends CurrentHouseholdResponse {
  setHousehold: (household: HouseholdSummary) => void;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({
  value,
  children,
}: {
  value: CurrentHouseholdResponse;
  children: ReactNode;
}) {
  const [household, setHousehold] = useState(value.household);

  return (
    <HouseholdContext.Provider value={{ ...value, household, setHousehold }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useCurrentHousehold(): HouseholdContextValue {
  const value = useContext(HouseholdContext);
  if (!value) throw new Error("Household context is unavailable");
  return value;
}
