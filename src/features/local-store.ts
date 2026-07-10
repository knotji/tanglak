"use client";

import { useState } from "react";
import { demoDebts, demoTransactions } from "@/data/demo";
import type { Debt, Transaction } from "@/types/domain";

const TRANSACTIONS_KEY = "tanglak.transactions";
const DEBTS_KEY = "tanglak.debts";

export function useLocalTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (typeof window === "undefined") return demoTransactions;
    const saved = window.localStorage.getItem(TRANSACTIONS_KEY);
    return saved ? (JSON.parse(saved) as Transaction[]) : demoTransactions;
  });

  function persist(next: Transaction[]) {
    setTransactions(next);
    window.localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(next));
  }

  return {
    transactions,
    addTransaction: (transaction: Transaction) =>
      persist([transaction, ...transactions]),
  };
}

export function useLocalDebts() {
  const [debts, setDebts] = useState<Debt[]>(() => {
    if (typeof window === "undefined") return demoDebts;
    const saved = window.localStorage.getItem(DEBTS_KEY);
    return saved ? (JSON.parse(saved) as Debt[]) : demoDebts;
  });

  function persist(next: Debt[]) {
    setDebts(next);
    window.localStorage.setItem(DEBTS_KEY, JSON.stringify(next));
  }

  return {
    debts,
    addDebt: (debt: Debt) => persist([debt, ...debts]),
  };
}
