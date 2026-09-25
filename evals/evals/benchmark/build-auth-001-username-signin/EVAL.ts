// Scorer draft for build-auth-001-username-signin.
//
// The runner contract (types package, harness context) lands in an
// upcoming PR; this file fixes the intended checks so scenario reviews
// can start now. Two layers, both against the real environment:
//
//   1. config check  — username+password sign-in is enabled on the env
//   2. runtime check — a fresh end-user session can actually sign up,
//      fail a sign-in with a wrong password, then sign in and read back
//      the display name
//
// Deterministic checks only; no LLM judge needed for this scenario.

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

interface EvalContext {
  envId: string;
  /** Fresh anonymous credentials minted per run, never reused. */
  anonymousSdkLogin: () => Promise<unknown>;
  /** Read current auth config via the management layer. */
  getAuthConfig: () => Promise<{ usernameLoginEnabled: boolean }>;
  /** Run the driver in the app directory, exactly like the app would. */
  runDriver: (args: string[]) => Promise<Record<string, DriverStep>>;
}

interface DriverStep {
  userId?: string;
  displayName?: string;
  threw?: string;
}

export const scorer = async (ctx: EvalContext): Promise<CheckResult[]> => {
  const checks: CheckResult[] = [];

  // 1. The login method is actually enabled on the environment.
  const config = await ctx.getAuthConfig();
  checks.push({
    name: 'username-signin-enabled',
    passed: config.usernameLoginEnabled,
  });

  // 2. End-to-end against the app's own auth module. The driver imports
  //    app/src/auth.js — pre-seeding users in the environment would mask
  //    a broken implementation, so sign-up runs as part of the check.
  const suffix = Date.now().toString(36);
  const username = `alex-${suffix}`;
  const password = 'correct-horse-battery';
  const displayName = 'Alex Doe';

  const out = await ctx.runDriver([username, password, 'wrong-horse-battery', displayName]);

  checks.push({
    name: 'signup-creates-user',
    passed: Boolean(out.signUp?.userId) && !out.signUp?.threw,
    detail: out.signUp?.threw,
  });
  checks.push({
    name: 'wrong-password-rejected',
    passed: Boolean(out.signInWrong?.threw),
    detail: 'signing in with a wrong password must fail',
  });
  checks.push({
    name: 'signin-returns-profile',
    passed: out.signIn?.displayName === displayName,
    detail: out.signIn?.threw ?? `displayName=${out.signIn?.displayName}`,
  });

  return checks;
};
