import { isMockAuthEnabled } from "@/lib/auth/session";
import { getMockState } from "@/lib/data/mock-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Account, AccountType } from "@/types/domain";

export type AccountInput = {
  name: string;
  institutionName?: string;
  accountType: AccountType;
  lastFour?: string;
  currency: "THB";
  isOwnedByUser: boolean;
  isDefault?: boolean;
  isActive?: boolean;
  notes?: string;
};

export type AccountDeleteSafety = {
  safe: boolean;
  transactionCount: number;
  debtCount: number;
  importBatchCount: number;
  documentCount: number;
  reasons: string[];
};

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  institution_name?: string | null;
  account_type?: AccountType | null;
  is_owned_by_user: boolean;
  account_last_four?: string | null;
  last_four?: string | null;
  currency?: "THB" | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    institutionName: row.institution_name ?? undefined,
    accountType: row.account_type ?? "other",
    isOwnedByUser: row.is_owned_by_user,
    lastFour: row.last_four ?? row.account_last_four ?? undefined,
    accountLastFour: row.account_last_four ?? undefined,
    currency: row.currency ?? "THB",
    isDefault: row.is_default ?? false,
    isActive: row.is_active ?? true,
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function assertOwner(userId: string, ownerId?: string) {
  if (ownerId && ownerId !== userId) throw new Error("Cannot access another user's data");
}

export async function listAccounts(userId: string): Promise<Account[]> {
  if (isMockAuthEnabled()) {
    return (getMockState().accounts ?? [])
      .filter((account) => account.userId === userId)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapAccount);
}

export async function getAccount(userId: string, id: string): Promise<Account | null> {
  const account = (await listAccounts(userId)).find((item) => item.id === id) ?? null;
  if (account) assertOwner(userId, account.userId);
  return account;
}

export async function saveAccount(userId: string, input: AccountInput, id?: string): Promise<Account> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.accounts ??= [];
    if (input.isDefault) {
      state.accounts.forEach((account) => {
        if (account.userId === userId) account.isDefault = false;
      });
    }
    if (id) {
      const index = state.accounts.findIndex((account) => account.id === id);
      if (index < 0) throw new Error("Account not found");
      assertOwner(userId, state.accounts[index].userId);
      state.accounts[index] = { ...state.accounts[index], ...input, id, userId, lastFour: input.lastFour };
      return state.accounts[index];
    }
    const account: Account = {
      id: crypto.randomUUID(),
      userId,
      ...input,
      isDefault: input.isDefault ?? !state.accounts.some((item) => item.userId === userId && item.isActive !== false),
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.accounts.unshift(account);
    return account;
  }

  const supabase = await createSupabaseServerClient();
  if (input.isDefault) {
    const { error } = await supabase.from("accounts").update({ is_default: false }).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  const payload = {
    user_id: userId,
    name: input.name,
    institution_name: input.institutionName,
    account_type: input.accountType,
    is_owned_by_user: input.isOwnedByUser,
    account_last_four: input.lastFour,
    last_four: input.lastFour,
    currency: input.currency,
    is_default: input.isDefault,
    is_active: input.isActive ?? true,
    notes: input.notes,
  };

  const query = id
    ? supabase.from("accounts").update(payload).eq("id", id).eq("user_id", userId)
    : supabase.from("accounts").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return mapAccount(data);
}

export async function setDefaultAccount(userId: string, id: string): Promise<void> {
  const account = await getAccount(userId, id);
  if (!account) throw new Error("Account not found");
  if (account.isActive === false) throw new Error("Cannot make inactive account default");

  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.accounts?.forEach((item) => {
      if (item.userId === userId) item.isDefault = item.id === id;
    });
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error: clearError } = await supabase.from("accounts").update({ is_default: false }).eq("user_id", userId);
  if (clearError) throw new Error(clearError.message);
  const { error } = await supabase.from("accounts").update({ is_default: true }).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setAccountActive(userId: string, id: string, isActive: boolean): Promise<void> {
  const account = await getAccount(userId, id);
  if (!account) throw new Error("Account not found");

  if (isMockAuthEnabled()) {
    account.isActive = isActive;
    if (!isActive) account.isDefault = false;
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("accounts")
    .update({ is_active: isActive, is_default: isActive ? account.isDefault : false })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function getAccountDeleteSafety(userId: string, id: string): Promise<AccountDeleteSafety> {
  if (isMockAuthEnabled()) {
    const state = getMockState();
    const transactionCount = state.transactions.filter(
      (transaction) =>
        transaction.userId === userId &&
        (transaction.sourceAccountId === id || transaction.destinationAccountId === id),
    ).length;
    return {
      safe: transactionCount === 0,
      transactionCount,
      debtCount: 0,
      importBatchCount: 0,
      documentCount: 0,
      reasons: transactionCount ? ["มีรายการที่ผูกกับบัญชีนี้"] : [],
    };
  }

  const supabase = await createSupabaseServerClient();
  const { count: sourceCount, error: sourceError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source_account_id", id);
  if (sourceError) throw new Error(sourceError.message);
  const { count: destinationCount, error: destinationError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("destination_account_id", id);
  if (destinationError) throw new Error(destinationError.message);

  const transactionCount = (sourceCount ?? 0) + (destinationCount ?? 0);
  const { count: batchCount, error: batchError } = await supabase
    .from("import_batches")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("account_id", id);
  if (batchError) throw new Error(batchError.message);
  const importBatchCount = batchCount ?? 0;
  const documentCount = 0;
  const debtCount = 0;
  const reasons = [
    transactionCount ? "มีรายการที่ผูกกับบัญชีนี้" : "",
    debtCount ? "มีหนี้ที่ผูกกับบัญชีนี้" : "",
    importBatchCount ? "มีประวัตินำเข้าที่ผูกกับบัญชีนี้" : "",
    documentCount ? "มีเอกสารที่ผูกกับบัญชีนี้" : "",
  ].filter(Boolean);
  return {
    safe: reasons.length === 0,
    transactionCount,
    debtCount,
    importBatchCount,
    documentCount,
    reasons,
  };
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const safety = await getAccountDeleteSafety(userId, id);
  if (!safety.safe) throw new Error("บัญชีนี้มีข้อมูลที่ผูกอยู่ แนะนำให้ปิดการใช้งานแทน");

  if (isMockAuthEnabled()) {
    const state = getMockState();
    state.accounts = (state.accounts ?? []).filter((account) => account.id !== id || account.userId !== userId);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
