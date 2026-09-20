/**
 * Preflight checks for evaluation targets.
 *
 * A suite whose target is not running must report BLOCKED, not a wall of
 * `invalid` cases. `invalid` should mean "the target ran but produced an
 * unusable result", never "I could not reach the target".
 */

/** Thrown when a suite cannot run because its target is unavailable. */
export class EvalBlockedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "EvalBlockedError";
    this.reason = reason;
  }
}

export type CoachHealth = {
  ok?: boolean;
  llm_ok?: boolean;
  provider?: string;
  model?: string | null;
  base_url?: string;
};

/**
 * Caddy serves a locally generated certificate in the Docker setup. Relax TLS
 * verification only for loopback HTTPS targets.
 */
export function relaxTlsForLocalHttps(baseUrl: string): void {
  if (
    baseUrl.startsWith("https://") &&
    /(localhost|127\.0\.0\.1)/.test(baseUrl)
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}

/** Confirm the Lab is reachable and its LLM is configured before evaluating. */
export async function checkCoachReachable(
  baseUrl: string,
  timeoutMs = 5000,
): Promise<CoachHealth> {
  relaxTlsForLocalHttps(baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new EvalBlockedError(
        `Lab health returned HTTP ${res.status} at ${baseUrl}`,
      );
    }
    const data = (await res.json()) as CoachHealth;
    if (!data.llm_ok) {
      throw new EvalBlockedError(
        `Lab is running at ${baseUrl} but the LLM is not configured (llm_ok=false).`,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof EvalBlockedError) throw error;
    throw new EvalBlockedError(
      `Lab not reachable at ${baseUrl}. Start it with "pnpm lab:dev:clean" (or set EVAL_COACH_URL).`,
    );
  } finally {
    clearTimeout(timer);
  }
}