export interface BankAccount {
  bank_name: string;
  account_name: string;
  account_number: string;
  routing_number: string;
  branch: string;
  swift_code: string;
}

export function emptyBankAccount(): BankAccount {
  return {
    bank_name: "",
    account_name: "",
    account_number: "",
    routing_number: "",
    branch: "",
    swift_code: "",
  };
}

/** Migrate legacy single account fields into bank_accounts array */
export function normalizeBankAccounts(method: {
  category?: string;
  account_name?: string;
  account_number?: string;
  bank_accounts?: BankAccount[];
}): BankAccount[] {
  if (method.category !== "bank") return [];

  if (Array.isArray(method.bank_accounts) && method.bank_accounts.length > 0) {
    return method.bank_accounts.map((a) => ({ ...emptyBankAccount(), ...a }));
  }

  if (method.account_name || method.account_number) {
    return [
      {
        ...emptyBankAccount(),
        account_name: method.account_name || "",
        account_number: method.account_number || "",
      },
    ];
  }

  return [{ ...emptyBankAccount() }];
}

export function bankAccountSummary(account: BankAccount): string {
  const parts = [account.bank_name, account.account_number].filter(Boolean);
  return parts.join(" — ") || account.account_name || "";
}
