#!/usr/bin/env node
/**
 * PreToolUse hook — refuse to let an agent read or write a secret-bearing file.
 *
 * ── SCOPE, HONESTLY ───────────────────────────────────────────────────────────────────────────
 * This protects CLAUDE CODE sessions only. It is a Claude Code hook, so it does nothing for
 * Copilot, Cursor, or a human with an editor. It is a seatbelt, not a security control: the real
 * controls are `.gitignore` (these files are never committed) and the fact that CI reads secrets
 * from the platform's secret store rather than from the repo.
 *
 * It earns its place anyway, because the failure it prevents is silent and permanent: an agent
 * reading `env/.env.dev` to "check the base URL" pulls a live password into the transcript, and
 * from there into a commit message, a PR body, or a bug report.
 *
 * ── WHAT IT INSPECTS ──────────────────────────────────────────────────────────────────────────
 * PATH-LIKE fields of the tool input only (`file_path`, `path`, `notebook_path`) — never file
 * CONTENT and never a command string. Reading content to decide would mean loading the secret to
 * find out whether it is a secret.
 *
 * `*.example` files are explicitly allowed: they are the tracked templates, they hold no real
 * values, and they are the thing an agent legitimately needs to read.
 */

const DENIED = [
  { pattern: /(^|\/)\.env($|\.)/, what: 'an environment file' },
  { pattern: /(^|\/)env\/\.env/, what: 'an environment file' },
  { pattern: /(^|\/)\.auth\//, what: 'a saved authentication state' },
  { pattern: /\.(key|pem|p12|pfx|jks)$/, what: 'a private key or keystore' },
  { pattern: /(^|\/)server\.crt$/, what: 'a server certificate' },
];

/** Tracked templates carry no real values and are safe — and useful — to read. */
const ALLOWED = [/\.example$/, /\.sample$/, /\.template$/];

const PATH_FIELDS = ['file_path', 'path', 'notebook_path'];

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // A hook that cannot parse its input must not block the session.
    process.exit(0);
  }

  const toolInput = input?.tool_input ?? {};
  const candidates = PATH_FIELDS.map((f) => toolInput[f]).filter(
    (v) => typeof v === 'string' && v.length > 0,
  );

  for (const candidate of candidates) {
    if (ALLOWED.some((re) => re.test(candidate))) continue;
    const hit = DENIED.find((d) => d.pattern.test(candidate));
    if (hit === undefined) continue;

    const reason =
      `Refused: ${candidate} is ${hit.what}. Reading it would pull live credentials into the ` +
      `transcript, and from there into a commit message or PR body. Read the tracked ` +
      `\`*.example\` template instead — it documents every variable with no real values. If you ` +
      `need to know whether a variable is SET, check \`process.env\` at runtime rather than ` +
      `opening the file.`;

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }),
    );
    process.exit(2);
  }

  process.exit(0);
});
