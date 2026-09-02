export const legacySearchHistoryStorageKey = "jangoing-recent-searches";

export function searchHistoryStorageKey(userId: string): string {
  return `${legacySearchHistoryStorageKey}:${userId}`;
}
