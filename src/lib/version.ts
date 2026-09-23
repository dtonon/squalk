import { MODE, RELAY_URL, SSR_ENABLED } from "$lib/config";

export const VERSION = __SQUALK_VERSION__;
export const COMMIT = __SQUALK_COMMIT__;

const REPO = "https://github.com/dtonon/squalk";
// A release build links to its GitHub release, anything else to its commit
export const VERSION_URL = VERSION.includes("+")
  ? `${REPO}/commit/${COMMIT}`
  : `${REPO}/releases/tag/v${VERSION}`;

// Plain-text block to paste in a bug report
export function diagnostics(loginMethod: string | null): string {
  return [
    `Squalk ${VERSION}`,
    `Commit: ${COMMIT || "unknown"}`,
    `Mode: ${MODE}`,
    `SSR: ${SSR_ENABLED ? "yes" : "no"}`,
    `Relay: ${RELAY_URL}`,
    `Login: ${loginMethod ?? "none"}`,
    `Browser: ${navigator.userAgent}`,
  ].join("\n");
}
