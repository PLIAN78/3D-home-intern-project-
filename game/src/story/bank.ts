/**
 * Ridge Savings Bank: a savings account that earns interest while you play,
 * and a simple loan. Pure functions over a small account record, so the rules
 * are easy to test.
 */

export interface Account {
  /** Money in savings. */
  savings: number;
  /** What you still owe (loan plus its fee). */
  owed: number;
  /** Simulation time (s) of the last interest payment. */
  lastInterest: number;
}

export const BANK = {
  /** Interest on savings, paid every `period` seconds of play. */
  rate: 0.02,
  period: 120,
  /** Loan fee, added once when you borrow. */
  fee: 0.1,
  /** Share of everything you earn that goes to repaying the loan. */
  autoRepay: 0.3,
  /** Credit limit: a base amount plus a share of what you've earned so far. */
  baseLimit: 2000,
  earnedShare: 0.25,
  maxLimit: 10000,
};

export const OPEN_ACCOUNT: Account = { savings: 0, owed: 0, lastInterest: 0 };

export function deposit(cash: number, a: Account, amount: number) {
  const n = Math.max(0, Math.min(cash, Math.floor(amount)));
  return { cash: cash - n, account: { ...a, savings: a.savings + n } };
}

export function withdraw(cash: number, a: Account, amount: number) {
  const n = Math.max(0, Math.min(a.savings, Math.floor(amount)));
  return { cash: cash + n, account: { ...a, savings: a.savings - n } };
}

/** How much more you could borrow now. */
export function creditLeft(a: Account, earned: number) {
  const limit = Math.min(BANK.maxLimit, BANK.baseLimit + earned * BANK.earnedShare);
  return Math.max(0, Math.floor(limit - a.owed));
}

/** Borrow `amount` (capped at your credit). You receive it all; you owe it plus the fee. */
export function borrow(cash: number, a: Account, earned: number, amount: number) {
  const n = Math.max(0, Math.min(creditLeft(a, earned), Math.floor(amount)));
  return { cash: cash + n, account: { ...a, owed: a.owed + Math.round(n * (1 + BANK.fee)) }, borrowed: n };
}

export function repay(cash: number, a: Account, amount: number) {
  const n = Math.max(0, Math.min(cash, a.owed, Math.floor(amount)));
  return { cash: cash - n, account: { ...a, owed: a.owed - n } };
}

/** Splits incoming pay: part goes to the loan automatically, the rest to your wallet. */
export function splitPay(a: Account, amount: number) {
  const toLoan = a.owed > 0 ? Math.min(a.owed, Math.round(amount * BANK.autoRepay)) : 0;
  return { toWallet: amount - toLoan, toLoan, account: { ...a, owed: a.owed - toLoan } };
}

/** Pays any interest due by simulation time `now`. */
export function accrue(a: Account, now: number) {
  if (now - a.lastInterest < BANK.period) return { account: a, interest: 0 };
  const periods = Math.floor((now - a.lastInterest) / BANK.period);
  let savings = a.savings;
  for (let i = 0; i < periods; i++) savings += Math.floor(savings * BANK.rate);
  return { account: { ...a, savings, lastInterest: a.lastInterest + periods * BANK.period }, interest: savings - a.savings };
}
