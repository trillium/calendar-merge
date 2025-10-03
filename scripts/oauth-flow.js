const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const open = require('open');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

async function getToken() {
  const credentials = JSON.parse(fs.readFileSync('credentials.json'));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  
  console.log('🌐 Opening authorization URL in browser...\n');
  
  await open(authUrl);
  
  const server = http.createServer(async (req, res) => {
    if (req.url.indexOf('/oauth2callback') > -1) {
      const qs = new url.URL(req.url, 'http://localhost:8080').searchParams;
      const code = qs.get('code');
      
      res.end('Authentication successful! You can close this window.');
      server.close();
      
      const { tokens } = await oauth2Client.getToken(code);
      fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
      
      console.log('\n✅ Token saved to token.json');
      process.exit(0);
    }
  }).listen(8080, () => {
    console.log('Waiting for authorization...');
  });
}

getToken().catch(console.error);
