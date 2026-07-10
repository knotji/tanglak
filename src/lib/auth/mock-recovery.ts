export const MOCK_RECOVERY_TOKEN_PREFIX = "valid-mock-recovery";
export const MOCK_RECOVERY_COOKIE = "tl_mock_recovery";
export const MOCK_RECOVERY_CONSUMED_COOKIE = "tl_mock_recovery_consumed";

export function isValidMockRecoveryToken(token: string | null | undefined): token is string {
  return Boolean(
    token &&
      (token === MOCK_RECOVERY_TOKEN_PREFIX ||
        token.startsWith(`${MOCK_RECOVERY_TOKEN_PREFIX}-`)),
  );
}

export function parseConsumedMockRecoveryTokens(cookieValue: string | undefined): Set<string> {
  if (!cookieValue) return new Set();

  return new Set(
    cookieValue
      .split("|")
      .map((value) => {
        try {
          return decodeURIComponent(value);
        } catch {
          return "";
        }
      })
      .filter(isValidMockRecoveryToken),
  );
}

export function isConsumedMockRecoveryToken(
  token: string,
  cookieValue: string | undefined,
): boolean {
  return parseConsumedMockRecoveryTokens(cookieValue).has(token);
}

export function appendConsumedMockRecoveryToken(
  cookieValue: string | undefined,
  token: string,
): string {
  const consumedTokens = parseConsumedMockRecoveryTokens(cookieValue);
  consumedTokens.add(token);
  return [...consumedTokens].sort().map(encodeURIComponent).join("|");
}
