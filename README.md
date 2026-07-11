# Discogs to Spotify Sync

A web app that copies your Discogs vinyl collection to a Spotify playlist. It reads every album and every track from your Discogs collection, finds each track on Spotify, and builds a playlist called **"record collection"**.

**Works for anyone** -- each user pastes their own Discogs token and logs into their own Spotify account. No data is shared between users.

![](https://img.shields.io/badge/node-%3E%3D18-green) ![](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)

---

## What You Need

1. A computer with **Node.js** installed ([download here](https://nodejs.org/))
2. A **Discogs account** with a Personal Access Token
3. A **Spotify account** (free or premium) with a Developer App

> **You do NOT need** a server, domain name, or paid services. Everything runs on your computer.

---

## Step-by-Step Setup (First Time Only)

### 1. Install Node.js

Go to [https://nodejs.org](https://nodejs.org) and download the **LTS version**. Install it like any other program.

To verify it worked, open **Terminal** (Mac/Linux) or **Command Prompt** (Windows) and type:

```bash
node --version
```

You should see something like `v18.x.x` or higher.

---

### 2. Get Your Discogs Personal Access Token

This token lets the app read your collection.

1. Go to [https://www.discogs.com/settings/developers](https://www.discogs.com/settings/developers)
2. If you're not logged in, log into your Discogs account
3. Click the **"Generate new token"** button
4. Copy the long string of letters and numbers that appears
   > It looks something like: `AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKl`
5. Save this token somewhere safe -- you'll paste it into the app later

> **Important:** Never share this token with anyone. It gives access to your Discogs account.

---

### 3. Create a Spotify Developer App

This gives the app permission to create playlists in your Spotify account.

1. Go to [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create app"**
4. Fill in the form:
   - **App name**: `Discogs Sync` (or anything you like)
   - **App description**: `Syncs my Discogs collection to Spotify`
   - **Redirect URI**: Leave this blank for now (we'll add it in Step 4)
   - Check the terms box
5. Click **"Save"**
6. You'll now see your app's page. Click **"Settings"**
7. Copy your **Client ID** (you'll need it later)
8. Click **"View client secret"** and copy your **Client Secret**

---

### 4. Create the `env.txt` File

In the `discogs-to-spotify` folder, create a file called `env.txt` with this content:

```
spotify_client_id:YOUR_CLIENT_ID_HERE
spotify_client_secret:YOUR_CLIENT_SECRET_HERE
```

Replace `YOUR_CLIENT_ID_HERE` and `YOUR_CLIENT_SECRET_HERE` with the values you copied from the Spotify dashboard.

> **Important:** Never commit `env.txt` to GitHub or share it publicly. It is already in `.gitignore`.

---

### 5. Download This Project

**Option A: Download as ZIP**
1. Click the green **"Code"** button at the top of this page
2. Click **"Download ZIP"**
3. Unzip it to a folder on your computer

**Option B: Use Git**
```bash
git clone https://github.com/ctmjson/discogs-to-spotify.git
cd discogs-to-spotify
```

---

### 6. Run the App

Open **Terminal** (Mac/Linux) or **Command Prompt** (Windows), navigate to the `discogs-to-spotify` folder, and run:

```bash
npm install
./start.sh
```

The first command installs dependencies (only needed once). The second starts the app.

You'll see output like:

```
Public URL: https://red-snail-walk.loca.lt

============================================
  App URL: https://red-snail-walk.loca.lt

  Before using, add this to your
  Spotify Developer Dashboard:

  https://red-snail-walk.loca.lt/api/callback

  Local URL: http://127.0.0.1:3456
============================================
```

---

### 7. Add the Redirect URI to Spotify

1. Copy the URL shown in the terminal (e.g. `https://red-snail-walk.loca.lt/api/callback`)
2. Go back to your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
3. Click your app, then click **"Settings"**
4. Scroll to **"Redirect URIs"**
5. Paste the URL and click **"Add"**
6. Click **"Save"** at the bottom

---

### 8. Open the App

Open the **App URL** shown in the terminal (e.g. `https://red-snail-walk.loca.lt`) in your web browser.

> You may see a "friendly error" page from localtunnel. Click **"Click to Continue"** to proceed.

---

## Using the App

The app has three simple steps:

| Step | What to do |
|------|------------|
| **1. Discogs** | Paste your Discogs personal access token and click **Connect Discogs**. If valid, it shows your username. |
| **2. Spotify** | Click **Login with Spotify** and authorize the app on the Spotify page. |
| **3. Sync** | Click **Sync Discogs to Spotify**. The app will process your collection and build the playlist. |

**How long does it take?** About 30-60 seconds per album. If you have 500 albums, expect 15-30 minutes. You can watch the progress and log in real time.

When finished, click **Open Playlist on Spotify** to see your new playlist.

---

## How It Works

```
Your Discogs Collection
        │
        ▼
  [Read every album] ──► [Get tracklist for each album]
        │
        ▼
  [Search Spotify for each track] ──► [Found!] or [Skipped]
        │
        ▼
  [Create "record collection" playlist] ──► [Add all tracks]
```

- The app uses the **Discogs API** to read your collection and get tracklists
- It uses **Spotify's search** to find each track (artist + title match)
- It uses **Spotify's playlist API** to create the playlist and add tracks
- **Client credentials** (from your `env.txt`) handle Spotify searches -- no user login needed for search
- **User authorization** (via Spotify login) is only used to create the playlist in your account
- Everything runs locally on your computer. The `localtunnel` service provides a temporary HTTPS address so Spotify's login system can redirect back to your computer

---

## Troubleshooting

### "This redirect URI is not secure" in Spotify Dashboard

Spotify requires HTTPS for redirect URIs. Make sure the URL starts with `https://` and uses the localtunnel URL (not `http://127.0.0.1` or `http://localhost`).

### "redirect_uri: Insecure" when logging in

The redirect URI in your Spotify dashboard doesn't match. Check that:
- The URL in your Spotify dashboard exactly matches the one shown in the terminal
- You clicked **Save** after adding it
- The localtunnel URL hasn't changed (it changes each time you restart `start.sh`)

### "localhost refused to connect"

The server isn't running. Run `./start.sh` again.

### "Invalid Discogs token"

- Make sure you copied the entire token (no extra spaces)
- Generate a new token from [Discogs Developer Settings](https://www.discogs.com/settings/developers) if needed

### "Spotify not authorized"

Click **Login with Spotify** to authorize the app before syncing.

### The sync is taking forever

Discogs rate-limits API requests to 60 per minute. With a large collection, the sync intentionally runs slowly to stay within limits. You can watch the progress in real time.

### "friendly error" page from localtunnel

This is normal. Click **"Click to Continue"** at the bottom of the page to access the app.

### My playlist is missing tracks

Not all tracks exist on Spotify. The app searches by track title + artist. Some tracks may not be found (especially rare/obscure releases). These are counted as "Skipped" in the progress display.

---

## Running Again Later

Each time you want to sync (e.g. after adding new records to Discogs):

```bash
cd discogs-to-spotify
./start.sh
```

The public URL changes each time, so you'll need to update the Redirect URI in your Spotify dashboard with the new URL shown in the terminal.

> **Tip:** If the playlist already exists from a previous sync, Spotify will create a new one. You can delete old playlists manually.

---

## Privacy & Security

- **Your Discogs token** is stored only in your browser session, never on disk
- **Your Spotify login** uses the official Spotify OAuth flow
- **No data** is sent anywhere except directly to the Discogs and Spotify APIs
- **The `env.txt` file** with your Spotify Client ID/Secret stays on your computer and is in `.gitignore`
- **LocalTunnel** provides an encrypted HTTPS connection between Spotify's servers and your computer

---

## Requirements

- **Node.js** v18 or higher
- **macOS**, **Linux**, or **Windows** (with WSL or Git Bash for the `start.sh` script)
- Internet connection

---

## License

MIT
