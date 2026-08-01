import axios from 'axios';

let cachedToken = null;
let tokenExpiry = 0;

export async function getIgdbHeaders() {
  if (!cachedToken || Date.now() >= tokenExpiry) {
    const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      },
    });
    cachedToken = res.data.access_token;
    // Refresh 1 hour before actual expiry
    tokenExpiry = Date.now() + (res.data.expires_in - 3600) * 1000;
  }

  return {
    'Client-ID': process.env.TWITCH_CLIENT_ID,
    Authorization: `Bearer ${cachedToken}`,
    'Content-Type': 'text/plain',
  };
}
