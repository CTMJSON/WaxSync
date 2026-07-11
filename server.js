const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

function loadEnv() {
  const envPath = path.join(__dirname, "..", "env.txt");
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const SPOTIFY_CLIENT_ID = env.spotify_client_id || "";
const SPOTIFY_CLIENT_SECRET = env.spotify_client_secret || "";

const PORT = process.env.PORT || 3456;
const REDIRECT_URI = process.env.REDIRECT_URL || `http://127.0.0.1:${PORT}/api/callback`;

const DISCOGS_BASE = "https://api.discogs.com";
const SPOTIFY_BASE = "https://api.spotify.com/v1";
const SPOTIFY_AUTH = "https://accounts.spotify.com/api/token";

let clientCredentialsToken = "";
let clientCredentialsExpiresAt = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureSession(req) {
  if (!req.session.spotifyTokens) {
    req.session.spotifyTokens = { access: "", refresh: "", expiresAt: 0 };
  }
  if (!req.session.syncState) {
    req.session.syncState = {
      running: false,
      currentStep: "",
      progress: { albums: 0, tracks: 0, found: 0, added: 0, skipped: 0 },
      log: [],
      playlistUrl: null,
    };
  }
}

function sessionLog(req, msg) {
  ensureSession(req);
  req.session.syncState.log.push(msg);
  console.log(msg);
}

async function getClientCredentialsToken() {
  if (clientCredentialsToken && Date.now() < clientCredentialsExpiresAt - 60000) {
    return clientCredentialsToken;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: SPOTIFY_CLIENT_ID,
    client_secret: SPOTIFY_CLIENT_SECRET,
  });
  const res = await fetch(SPOTIFY_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  clientCredentialsToken = data.access_token;
  clientCredentialsExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return clientCredentialsToken;
}

async function getSpotifyAccessToken(req) {
  const tokens = req.session.spotifyTokens;
  if (tokens.access && Date.now() < tokens.expiresAt - 60000) {
    return tokens.access;
  }
  if (tokens.refresh) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    });
    const res = await fetch(SPOTIFY_AUTH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (data.access_token) {
      tokens.access = data.access_token;
      tokens.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      if (data.refresh_token) tokens.refresh = data.refresh_token;
      return tokens.access;
    }
  }
  throw new Error("NO_SPOTIFY_AUTH");
}

async function discogsRequest(req, apiPath, params = {}) {
  const url = new URL(apiPath, DISCOGS_BASE);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "DiscogsToSpotifyApp/1.0",
      Authorization: `Discogs token=${req.session.discogsToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discogs ${res.status}: ${body}`);
  }
  return res.json();
}

async function spotifyUserRequest(req, apiPath, opts = {}) {
  const token = await getSpotifyAccessToken(req);
  const url = apiPath.startsWith("http") ? apiPath : `${SPOTIFY_BASE}${apiPath}`;
  const doFetch = async (t) => {
    return fetch(url, {
      ...opts,
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        ...opts.headers,
      },
    });
  };

  let res = await doFetch(token);
  if (res.status === 401) {
    req.session.spotifyTokens.access = "";
    req.session.spotifyTokens.expiresAt = 0;
    const newToken = await getSpotifyAccessToken(req);
    res = await doFetch(newToken);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function spotifyClientRequest(apiPath) {
  const token = await getClientCredentialsToken();
  const url = apiPath.startsWith("http") ? apiPath : `${SPOTIFY_BASE}${apiPath}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify ${res.status}: ${text}`);
  }
  return res.json();
}

async function searchSpotifyTrack(title, artist) {
  const query = `track:"${title}" artist:"${artist}"`;
  const url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=3`;
  const result = await spotifyClientRequest(url);
  if (result.tracks && result.tracks.items.length > 0) {
    return result.tracks.items[0].uri;
  }
  const simpleQuery = encodeURIComponent(`${title} ${artist}`);
  const url2 = `${SPOTIFY_BASE}/search?q=${simpleQuery}&type=track&limit=3`;
  const result2 = await spotifyClientRequest(url2);
  if (result2.tracks && result2.tracks.items.length > 0) {
    return result2.tracks.items[0].uri;
  }
  return null;
}

async function runSync(req) {
  ensureSession(req);
  const st = req.session.syncState;
  if (st.running) return;

  Object.assign(st, {
    running: true,
    currentStep: "Starting...",
    progress: { albums: 0, tracks: 0, found: 0, added: 0, skipped: 0 },
    log: [],
    playlistUrl: null,
  });

  try {
    sessionLog(req, "=== Discogs to Spotify Sync Started ===");

    sessionLog(req, "Step 1: Getting Discogs identity...");
    st.currentStep = "Getting Discogs identity";
    const identity = await discogsRequest(req, "/oauth/identity");
    const username = identity.username;
    sessionLog(req, `Discogs username: ${username}`);

    sessionLog(req, "Step 2: Getting Spotify user...");
    st.currentStep = "Getting Spotify user";
    const me = await spotifyUserRequest(req, "/me");
    const spotifyUserId = me.id;
    sessionLog(req, `Spotify user: ${spotifyUserId} (${me.display_name})`);

    sessionLog(req, "Step 3: Getting Discogs collection folders...");
    st.currentStep = "Getting Discogs collection folders";
    const foldersData = await discogsRequest(req, `/users/${username}/collection/folders`);
    const folders = foldersData.folders || [];
    sessionLog(req, `Found ${folders.length} folder(s)`);

    const trackUris = [];
    const seenUris = new Set();

    const allFolder = folders.find((f) => f.id === 0);
    const foldersToProcess = allFolder ? [allFolder] : folders;

    for (const folder of foldersToProcess) {
      sessionLog(req, `\n--- Folder: ${folder.name} (id: ${folder.id}) ---`);
      st.currentStep = `Processing folder: ${folder.name}`;
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const releasesData = await discogsRequest(
          req,
          `/users/${username}/collection/folders/${folder.id}/releases`,
          { page, per_page: 100 }
        );
        const releases = releasesData.releases || [];
        if (releases.length === 0) { hasMore = false; break; }

        for (const relItem of releases) {
          const releaseId = relItem.id;
          const basicInfo = relItem.basic_information;
          const artist = basicInfo.artists
            ? basicInfo.artists.map((a) => a.name).join(", ")
            : "Unknown Artist";
          const albumTitle = basicInfo.title;

          st.progress.albums++;
          st.currentStep = `Processing: ${artist} - ${albumTitle}`;

          try {
            const release = await discogsRequest(req, `/releases/${releaseId}`);
            const tracklist = release.tracklist || [];
            st.progress.tracks += tracklist.length;

            for (const track of tracklist) {
              if (track.type_ !== "track") continue;
              await sleep(50);
              const uri = await searchSpotifyTrack(track.title, artist);
              if (uri && !seenUris.has(uri)) {
                seenUris.add(uri);
                trackUris.push(uri);
                st.progress.found++;
              } else {
                st.progress.skipped++;
              }
            }
            await sleep(200);
          } catch (err) {
            sessionLog(req, `  Error getting release ${releaseId}: ${err.message}`);
          }
        }

        const pagination = releasesData.pagination;
        hasMore = !!(pagination && pagination.page < pagination.pages);
        if (hasMore) page++;
      }
    }

    sessionLog(req, `\nStep 4: Creating Spotify playlist...`);
    st.currentStep = "Creating Spotify playlist";
    const playlist = await spotifyUserRequest(req, `/users/${spotifyUserId}/playlists`, {
      method: "POST",
      body: JSON.stringify({
        name: "record collection",
        public: false,
        description: "Synced from Discogs collection",
      }),
    });
    const playlistId = playlist.id;
    st.playlistUrl = playlist.external_urls.spotify;
    sessionLog(req, `Playlist created: ${playlist.name} (${st.playlistUrl})`);

    sessionLog(req, `\nStep 5: Adding ${trackUris.length} tracks to playlist...`);
    st.currentStep = "Adding tracks to playlist";

    const chunks = [];
    for (let i = 0; i < trackUris.length; i += 100) {
      chunks.push(trackUris.slice(i, i + 100));
    }
    for (let i = 0; i < chunks.length; i++) {
      await spotifyUserRequest(req, `/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: chunks[i] }),
      });
      st.progress.added += chunks[i].length;
      sessionLog(req, `  Added chunk ${i + 1}/${chunks.length} (${chunks[i].length} tracks)`);
      await sleep(200);
    }

    sessionLog(req, "\n=== Sync Complete! ===");
    st.currentStep = "Complete!";
    st.running = false;
  } catch (err) {
    sessionLog(req, `\nERROR: ${err.message}`);
    console.error(err);
    st.currentStep = `Error: ${err.message}`;
    st.running = false;
  }
}

app.get("/api/status", (req, res) => {
  ensureSession(req);
  const tokens = req.session.spotifyTokens;
  res.json({
    ...req.session.syncState,
    discogsTokenSet: !!req.session.discogsToken,
    spotifyAuthed: !!(tokens.access && Date.now() < tokens.expiresAt - 60000) || !!tokens.refresh,
  });
});

app.post("/api/discogs-token", async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Token is required" });
  }
  try {
    const identity = await fetch(`${DISCOGS_BASE}/oauth/identity`, {
      headers: {
        "User-Agent": "DiscogsToSpotifyApp/1.0",
        Authorization: `Discogs token=${token}`,
      },
    });
    if (!identity.ok) {
      return res.status(400).json({ error: "Invalid Discogs token" });
    }
    const data = await identity.json();
    req.session.discogsToken = token;
    res.json({ username: data.username });
  } catch (err) {
    res.status(400).json({ error: "Could not validate token: " + err.message });
  }
});

app.get("/api/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const scopes = [
    "playlist-modify-private",
    "playlist-modify-public",
    "user-read-private",
  ];
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state,
    scope: scopes.join(" "),
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get("/api/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }
  if (state !== req.session.oauthState) {
    return res.redirect("/?error=state_mismatch");
  }
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    });
    const tokenRes = await fetch(SPOTIFY_AUTH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await tokenRes.json();
    if (data.access_token) {
      ensureSession(req);
      req.session.spotifyTokens = {
        access: data.access_token,
        refresh: data.refresh_token || "",
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
      };
      res.redirect("/?authed=1");
    } else {
      res.redirect(`/?error=${encodeURIComponent(JSON.stringify(data))}`);
    }
  } catch (err) {
    res.redirect(`/?error=${encodeURIComponent(err.message)}`);
  }
});

app.post("/api/sync", async (req, res) => {
  ensureSession(req);
  if (req.session.syncState.running) {
    return res.status(400).json({ error: "Sync already running" });
  }
  if (!req.session.discogsToken) {
    return res.status(400).json({ error: "Discogs token not set" });
  }
  const tokens = req.session.spotifyTokens;
  if (!tokens.access && !tokens.refresh) {
    return res.status(400).json({ error: "Spotify not authorized" });
  }
  res.json({ message: "Sync started" });
  runSync(req);
});

app.listen(PORT, () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
});
