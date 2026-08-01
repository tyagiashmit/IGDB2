# GameVault — Game Review App

## Setup

### 1. Get IGDB API credentials (free, takes ~2 minutes)

1. Go to https://dev.twitch.tv/console/apps
2. Log in with (or create) a Twitch account
3. Click **Register Your Application**
   - Name: anything (e.g. `GameVault`)
   - OAuth Redirect URLs: `http://localhost`
   - Category: **Application Integration**
4. Click **Manage** on your new app
5. Copy the **Client ID**
6. Click **New Secret** → copy the **Client Secret**

### 2. Add credentials to the server

Edit `server/.env`:
```
TWITCH_CLIENT_ID=paste_your_client_id_here
TWITCH_CLIENT_SECRET=paste_your_client_secret_here
PORT=3001
```

### 3. Run the app

```bash
npm run dev
```

Open http://localhost:5173

## Structure

```
IGDB/
├── server/          Express API + IGDB proxy
│   ├── routes/
│   │   ├── games.js    GET /api/games/top, /trending, /search, /:id
│   │   └── reviews.js  GET/POST /api/reviews/:gameId
│   ├── igdb.js      OAuth token management
│   └── data/reviews.json   User reviews (local storage)
└── client/          Vite + React frontend
    └── src/
        ├── pages/   Home, Search, GameDetail
        └── components/  Navbar, GameCard, StarRating, ReviewForm, ReviewList
```
