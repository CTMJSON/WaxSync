let discogsSet = false;
let spotifyAuthed = false;
let pollingId = null;

function $(id) { return document.getElementById(id); }

async function setDiscogsToken() {
  const token = $("discogs-token").value.trim();
  if (!token) return;

  const btn = $("discogs-btn");
  btn.disabled = true;
  btn.textContent = "Validating...";

  try {
    const res = await fetch("/api/discogs-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (res.ok) {
      discogsSet = true;
      $("discogs-status").textContent = "Connected as " + data.username;
      $("discogs-status").style.color = "#1db954";
      $("discogs-card").style.opacity = "1";
      $("spotify-card").style.opacity = "1";
      btn.textContent = "Connected";
      btn.style.opacity = "0.6";
      updateSyncButton();
    } else {
      $("discogs-status").textContent = "Error: " + (data.error || "Invalid token");
      $("discogs-status").style.color = "#ff6b6b";
      btn.disabled = false;
      btn.textContent = "Connect Discogs";
    }
  } catch (err) {
    $("discogs-status").textContent = "Error: " + err.message;
    $("discogs-status").style.color = "#ff6b6b";
    btn.disabled = false;
    btn.textContent = "Connect Discogs";
  }
}

function login() {
  window.location.href = "/api/login";
}

async function startSync() {
  if (!discogsSet || !spotifyAuthed) return;
  const btn = $("sync-btn");
  btn.disabled = true;
  btn.textContent = "Syncing...";

  try {
    const res = await fetch("/api/sync", { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to start sync");
      btn.disabled = false;
      updateSyncButton();
      return;
    }
    if (!pollingId) pollStatus();
  } catch (err) {
    alert("Error: " + err.message);
    btn.disabled = false;
    updateSyncButton();
  }
}

async function pollStatus() {
  try {
    const res = await fetch("/api/status");
    const state = await res.json();

    discogsSet = state.discogsTokenSet;
    spotifyAuthed = state.spotifyAuthed;
    updateUI(state);
    updateSyncButton();

    const running = state.running;
    if (!running && state.currentStep !== "Complete!" && !String(state.currentStep).startsWith("Error")) {
      pollingId = setTimeout(pollStatus, 1000);
    } else if (running) {
      pollingId = setTimeout(pollStatus, 1000);
    } else {
      pollingId = null;
    }
  } catch (err) {
    console.error("Poll error:", err);
    pollingId = setTimeout(pollStatus, 2000);
  }
}

function updateUI(state) {
  $("status-text").textContent = state.running ? "Running" : (state.currentStep === "Complete!" ? "Complete!" : "Idle");
  $("current-step").textContent = state.currentStep || "-";

  const p = state.progress || {};
  $("val-albums").textContent = p.albums || 0;
  $("val-tracks").textContent = p.tracks || 0;
  $("val-found").textContent = p.found || 0;
  $("val-added").textContent = p.added || 0;
  $("val-skipped").textContent = p.skipped || 0;

  const log = (state.log || []).join("\n");
  if (log) {
    $("log-output").textContent = log;
    const pre = $("log-output").parentElement;
    pre.scrollTop = pre.scrollHeight;
  }

  if (state.playlistUrl) {
    $("playlist-link").classList.remove("hidden");
    $("playlist-url").href = state.playlistUrl;
  }

  if (discogsSet && !$("discogs-card").querySelector("input").disabled) {
    $("discogs-card").querySelector("input").disabled = true;
  }

  if (spotifyAuthed) {
    $("auth-status").textContent = "Connected";
    $("auth-status").style.color = "#1db954";
    $("spotify-card").style.opacity = "1";
    $("login-btn").style.display = "none";
    $("sync-card").style.opacity = "1";
  } else {
    $("auth-status").textContent = "Not connected";
    $("auth-status").style.color = "#ff6b6b";
    $("login-btn").style.display = "block";
  }
}

function updateSyncButton() {
  const btn = $("sync-btn");
  if (discogsSet && spotifyAuthed) {
    btn.disabled = false;
    btn.textContent = "Sync Discogs to Spotify";
  } else {
    btn.disabled = true;
    if (!discogsSet) btn.textContent = "Set Discogs token first";
    else if (!spotifyAuthed) btn.textContent = "Login with Spotify first";
  }
}

const params = new URLSearchParams(window.location.search);
if (params.get("authed") === "1") {
  window.history.replaceState({}, "", "/");
}
if (params.get("error")) {
  $("auth-status").textContent = "Error: " + params.get("error");
  $("auth-status").style.color = "#ff6b6b";
  window.history.replaceState({}, "", "/");
}

pollStatus();
