import { LensClient } from "@anvia/lens";

/**
 * Shared Lens client for local scripts.
 *
 * `optional: true` returns a disabled, no-op observer when the `ANVIA_LENS_*`
 * connection variables are absent, so every script can attach it safely.
 */
export const lens = new LensClient({
  optional: true,
  serviceName: process.env.ANVIA_LENS_SERVICE_NAME || "stridelab-agent",
  environment: process.env.ANVIA_LENS_ENVIRONMENT || "local",
  release: process.env.ANVIA_LENS_RELEASE,
  captureMode: "safe",
});

export const tracing = lens.observer({ captureMode: "safe" });
