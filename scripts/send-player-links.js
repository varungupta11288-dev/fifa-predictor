// Send each player a personalised email containing their private predictions page link.
// Opens one Outlook compose window per player — each window must be manually sent.
//
// Usage:
//   node scripts/send-player-links.js [--dry-run]
//
// --dry-run  Print emails to console and write HTML files to data/links/emails/ without
//            opening Outlook. Useful for previewing before sending.
//
// Requires Outlook Classic (COM) on Windows.

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT            = path.join(__dirname, '..');
const PREDICTIONS_DIR = path.join(ROOT, 'data', 'predictions');
const DEFAULT_SITE    = 'https://varungupta11288-dev.github.io/fifa-predictor';
const SUBJECT         = 'Your WC2026 Predictor &mdash; Personal Predictions Page';
const SUBJECT_PLAIN   = 'Your WC2026 Predictor — Personal Predictions Page';

// Embed ball.png as base64 so the logo works in local previews and email clients
// without any external image request.
const BALL_B64 = (() => {
  const p = path.join(ROOT, '_site', 'assets', 'ball.png');
  if (!fs.existsSync(p)) return null;
  return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
})();

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPlayerEmail({ name, handle, url, site }) {
  const firstName = name.split(' ')[0];
  // Pitch background: green base + mowing stripes (matches .pitch-bg in input.css) +
  // subtle horizontal pitch-line stripe overlay for the football feel.
  const pitchBg = [
    'linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.35) 100%)',
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 38px, rgba(0,0,0,0.06) 38px, rgba(0,0,0,0.06) 76px)',
  ].join(', ');

  const hdrStyle = `background-color:#0b6b3a;background-image:${pitchBg};color:#ffffff;padding:20px 24px;`;

  return `<!doctype html>
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta charset="utf-8">
<title>${SUBJECT}</title>
<style>
  body, table, td, p, a { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  p { margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #0f172a; }
</style>
</head>
<body style="background:#ffffff;margin:0;padding:0;color:#0f172a;">
  <table width="600" align="center" cellpadding="0" cellspacing="0" border="0"
         style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">

    <!-- Header -->
    <tr>
      <td bgcolor="#0b6b3a" style="${hdrStyle}">
        <div style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:0.04em;color:#fcd34d;">WC2026 Predictor</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;margin-top:4px;color:#ffffff;">Your personal predictions page</div>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:20px 24px;border-top:1px solid #e2e8f0;">
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Hi ${esc(firstName)},</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">
          Thank you for taking part in the WC2026 Predictor! The tournament has officially kicked off &mdash;
          your entry is locked in and scoring has begun.
        </p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">
          Below is your private predictions page. Bookmark it to follow your score, see how your
          picks are holding up, and track your position on the leaderboard as results come in.
        </p>
        <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
          <tr>
            <td align="center" bgcolor="#0b6b3a"
                style="background:#0b6b3a;border-radius:5px;padding:12px 32px;">
              <a href="${esc(url)}"
                 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.02em;display:block;"
              >View My Predictions &rarr;</a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 12px;font-size:12px;color:#64748b;word-break:break-all;text-align:center;">
          Or copy this link: ${esc(url)}
        </p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">
          Good luck &mdash; may your picks prove prophetic!
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:14px 24px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;">
        You are receiving this because you submitted a prediction sheet for the WC2026 Predictor game.
        Your page is private &mdash; this link was sent only to you.
      </td>
    </tr>

  </table>
</body></html>`;
}

function openInOutlook(to, subject, htmlPath) {
  if (process.platform !== 'win32') {
    console.warn('[skip] --outlook is Windows-only. Skipping Outlook open for', to);
    return Promise.resolve();
  }
  const psPath    = htmlPath.replace(/'/g, "''");
  const psSubject = subject.replace(/'/g, "''");
  const psTo      = to.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$html = Get-Content -Raw -LiteralPath '${psPath}'
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.To = '${psTo}'
$mail.Subject = '${psSubject}'
$mail.HTMLBody = $html
$mail.Display($false)
`;
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    child.on('error', (err) => {
      console.error(`  [err] Could not open Outlook for ${to}: ${err.message}`);
      resolve();
    });
    child.on('close', (code) => {
      if (code === 0) console.log(`  [OK] Opened Outlook compose window → ${to}`);
      else console.error(`  [err] Outlook exited with code ${code} for ${to}`);
      resolve();
    });
  });
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const site     = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/$/, '');

  if (!fs.existsSync(PREDICTIONS_DIR)) {
    console.error(`No predictions directory — run \`npm run ingest\` first.`);
    process.exit(1);
  }

  const files = fs.readdirSync(PREDICTIONS_DIR).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error('No predictions found — run `npm run ingest` first.');
    process.exit(1);
  }

  const players = files.map(f => {
    const p = JSON.parse(fs.readFileSync(path.join(PREDICTIONS_DIR, f), 'utf8'));
    return { name: p.name, handle: p.handle, email: p.email, url: `${site}/me/${p.token}/`, site };
  }).filter(p => p.email).sort((a, b) => a.name.localeCompare(b.name));

  const skipped = files.length - players.length;
  if (skipped > 0) console.warn(`[warn] ${skipped} prediction file(s) have no email — skipping.`);

  // Write HTML files to data/links/emails/ for preview and audit trail.
  const emailsDir = path.join(ROOT, 'data', 'links', 'emails');
  if (!fs.existsSync(emailsDir)) fs.mkdirSync(emailsDir, { recursive: true });

  console.log(`\nPreparing ${players.length} email(s) — subject: "${SUBJECT}"\n`);

  for (const p of players) {
    const html     = buildPlayerEmail(p);
    const safeName = p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const htmlPath = path.join(emailsDir, `${safeName}.html`);
    fs.writeFileSync(htmlPath, html);

    if (isDryRun) {
      console.log(`[dry-run] ${p.name} <${p.email}> → ${p.url}`);
      console.log(`          HTML preview: ${path.relative(ROOT, htmlPath)}`);
    } else {
      console.log(`Sending to ${p.name} <${p.email}>`);
      await openInOutlook(p.email, SUBJECT_PLAIN, htmlPath);
      // Brief pause so Outlook doesn't get overwhelmed opening many windows at once.
      await new Promise(r => setTimeout(r, 800));
    }
  }

  if (isDryRun) {
    console.log(`\n[dry-run] No Outlook windows opened. HTML previews written to data/links/emails/`);
    console.log(`Run without --dry-run to open Outlook compose windows.`);
  } else {
    console.log(`\nDone. ${players.length} Outlook compose window(s) opened — review and send each one.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
