/**
 * One-time mint of OWNER_REFRESH_TOKEN for rarity.erc@gmail.com.
 *
 * PREP (Google Cloud console, one time):
 *  1. APIs & Services > Credentials > your Web OAuth client >
 *     add Authorized redirect URI: http://localhost:53682/callback
 *  2. OAuth consent screen > set Publishing status to Production
 *     (avoids 7-day refresh-token expiry; end users only grant
 *     drive.file which is non-sensitive, so no warning for them)
 *
 * RUN:  set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (env or .env),
 *  then:  node mint-owner-token.js
 *  Sign in as rarity.erc@gmail.com, click through the warning
 *  (Lanjutan), paste nothing — code is captured automatically.
 *  Copy printed OWNER_REFRESH_TOKEN into Render env vars.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { google } = require('googleapis');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT = 'http://localhost:53682/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (env or rarity/.env).');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('No code. Retry.');
    return;
  }
  res.end('OK. Kembali ke terminal.');
  server.close();
  try {
    const { tokens } = await oauth2.getToken(code);
    console.log('\n=== COPY KE RENDER ENV ===');
    console.log('GOOGLE_CLIENT_ID=' + CLIENT_ID);
    console.log('GOOGLE_CLIENT_SECRET=' + CLIENT_SECRET);
    console.log('OWNER_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('OWNER_EMAIL=rarity.erc@gmail.com');
  } catch (e) {
    console.error('Token exchange gagal:', e.message);
  }
});

server.listen(53682, () => {
  console.log('Buka URL ini sebagai rarity.erc@gmail.com:\n');
  console.log(url + '\n');
});
