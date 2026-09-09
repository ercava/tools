/** Usage: node check-owner.js — prints which Google account OWNER_REFRESH_TOKEN belongs to. */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}

(async () => {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.OWNER_REFRESH_TOKEN });
  try {
    await auth.getAccessToken();
    const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${auth.credentials.access_token}` },
    }).then((r) => r.json());
    console.log('Owner token email:', me.email);
    const drive = google.drive({ version: 'v3', auth });
    try {
      const f = await drive.files.get({
        fileId: process.env.TEMPLATE_SHEET_ID || '1HEGvMhnwjhvcnoZOvamLgJVmNU5iy2hiYRMFXQgsmkU',
        fields: 'id,name,owners',
      });
      console.log('Template visible. Name:', f.data.name, '| Owners:', (f.data.owners || []).map((o) => o.emailAddress).join(','));
    } catch (e) {
      console.log('Template NOT visible to this token:', e.message);
    }
  } catch (e) {
    console.log('Token invalid/revoked:', e.message);
  }
})();
