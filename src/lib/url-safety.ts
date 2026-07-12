/**
 * Basic SSRF protection for user-supplied webhook URLs. Blocks non-HTTP(S)
 * schemes and requests aimed at loopback / private / link-local / cloud-metadata
 * addresses. Set WEBHOOK_ALLOW_LOCAL=true to permit local targets in dev (e.g.
 * a localhost receiver).
 *
 * Note: literal-IP and hostname checks only. A hardened production guard would
 * also resolve DNS and re-check the resolved IP (and pin it for the request) to
 * defeat DNS-rebinding — out of scope here, but flagged.
 */
export function isSafeWebhookUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "only http(s) URLs are allowed" };
  }

  if (process.env.WEBHOOK_ALLOW_LOCAL === "true") return { ok: true };

  const host = u.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return { ok: false, reason: "local hostnames are not allowed" };
  }

  if (isPrivateIp(host)) {
    return { ok: false, reason: "private/loopback addresses are not allowed" };
  }

  return { ok: true };
}

function isPrivateIp(host: string): boolean {
  // IPv6 loopback / unique-local / link-local
  if (host === "::1" || host === "[::1]") return true;
  const v6 = host.replace(/^\[|\]$/g, "");
  if (/^f[cd][0-9a-f]{2}:/i.test(v6)) return true; // fc00::/7
  if (/^fe80:/i.test(v6)) return true; // link-local

  // IPv4
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 0) return true;
  return false;
}
