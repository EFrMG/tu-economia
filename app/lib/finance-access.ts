/**
 * What the current visitor may do with Mi economía. Everyone can browse the tabs; only a current trial or paid period edits, and a lapsed account keeps read, export and delete access to its own records.
 */
export type FinanceAccess = "unavailable" | "signed-out" | "read-only" | "edit";

export interface AccountState {
  access: FinanceAccess;
  userId: string | null;
  email: string | null;
  billingEnabled: boolean;
  /** ISO date when a lapsed account's records will be deleted, if any are stored. */
  deletionDate: string | null;
  /** Whether subscribing would still start with the free month. */
  trialEligible: boolean;
  googleEnabled: boolean;
  emailEnabled: boolean;
  /** Whether the signed-in account already has Google linked. */
  googleLinked: boolean;
}
