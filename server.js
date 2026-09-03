"use strict";

const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const ROOT_DIR = __dirname;
loadDotEnv(path.join(ROOT_DIR, ".env"));

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 8));
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_JSON_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.45) + 512 * 1024;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 12) * 60 * 60 * 1000;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const TYPING_TTL_MS = 3500;
const MESSAGE_MAX_AGE_MS = Number(process.env.MESSAGE_MAX_HOURS || 24) * 60 * 60 * 1000;
const READ_RETENTION_MS = Number(process.env.READ_DELETE_MINUTES || 30) * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const VERSION_FILE = path.join(ROOT_DIR, "version.json");
const APP_VERSION = loadAppVersion();

const REQUIRED_ENV = ["USER_A_PASSWORD", "USER_B_PASSWORD"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(", ")}`);
  console.error("Create a .env file from .env.example or set the variables in Docker/Portainer.");
  process.exit(1);
}

if (process.env.USER_A_PASSWORD === process.env.USER_B_PASSWORD) {
  console.error("USER_A_PASSWORD and USER_B_PASSWORD must be different.");
  process.exit(1);
}

const USERS = {
  A: {
    id: "A",
    label: process.env.USER_A_LABEL || "User A",
    password: process.env.USER_A_PASSWORD,
  },
  B: {
    id: "B",
    label: process.env.USER_B_LABEL || "User B",
    password: process.env.USER_B_PASSWORD,
  },
};

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const sessions = new Map();
const sseClients = new Map([
  ["A", new Set()],
  ["B", new Set()],
]);
const failedLogins = new Map();
const typingState = new Map([
  ["A", { typing: false, updatedAt: 0 }],
  ["B", { typing: false, updatedAt: 0 }],
]);
const typingExpiryTimers = new Map();

let state = {
  messages: [],
  users: createUserState(),
};

let saveQueue = Promise.resolve();

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await ensureStorage();
  state = await loadState();
  await cleanupExpiredMessages({ broadcast: false });

  const cleanupTimer = setInterval(() => {
    cleanupExpiredMessages().catch((error) => console.error("Cleanup failed:", error));
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      if (!res.headersSent) {
        sendJson(res, error.statusCode || 500, {
          error: error.publicMessage || "Serverfehler",
        });
      }
      if (!error.statusCode || error.statusCode >= 500) {
        console.error(error);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Cryptus is listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    await saveState();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function handleRequest(req, res) {
  setSecurityHeaders(res);

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, name: "cryptus", version: APP_VERSION.version });
    return;
  }

  if (req.method === "GET" && pathname === "/api/config") {
    sendJson(res, 200, {
      maxUploadMb: MAX_UPLOAD_MB,
      version: APP_VERSION.version,
      versionDate: APP_VERSION.date,
      versionSequence: APP_VERSION.sequence,
      users: publicUsers(),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    await handleLogin(req, res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/events") {
    await handleEvents(req, res, url);
    return;
  }

  if (req.method === "GET" && pathname === "/api/state") {
    const session = requireSession(req, url);
    await cleanupExpiredMessages();
    sendJson(res, 200, safeStateFor(session.user));
    return;
  }

  if (req.method === "POST" && pathname === "/api/messages") {
    const session = requireSession(req, url);
    await cleanupExpiredMessages();
    await handleCreateMessage(req, res, session.user);
    return;
  }

  if (req.method === "POST" && pathname === "/api/typing") {
    const session = requireSession(req, url);
    await handleTyping(req, res, session.user);
    return;
  }

  if (req.method === "POST" && pathname === "/api/messages/read-all") {
    const session = requireSession(req, url);
    await cleanupExpiredMessages();
    await handleReadAllMessages(res, session.user);
    return;
  }

  const editMatch = pathname.match(/^\/api\/messages\/([0-9a-f-]+)$/i);
  if (req.method === "PATCH" && editMatch) {
    const session = requireSession(req, url);
    await cleanupExpiredMessages();
    await handleEditMessage(req, res, session.user, editMatch[1]);
    return;
  }

  const readMatch = pathname.match(/^\/api\/messages\/([0-9a-f-]+)\/read$/i);
  if (req.method === "POST" && readMatch) {
    const session = requireSession(req, url);
    await cleanupExpiredMessages();
    await handleReadMessage(res, session.user, readMatch[1]);
    return;
  }

  const mediaMatch = pathname.match(/^\/api\/media\/([0-9a-f-]+)$/i);
  if ((req.method === "GET" || req.method === "HEAD") && mediaMatch) {
    const session = requireSession(req, url);
    await cleanupExpiredMessages();
    await handleMedia(req, res, session.user, mediaMatch[1]);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Nicht gefunden" });
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res, pathname);
    return;
  }

  sendJson(res, 404, { error: "Nicht gefunden" });
}

async function handleLogin(req, res) {
  const body = await readJson(req, 32 * 1024);
  const password = String(body.password || "");
  const key = `${req.socket.remoteAddress || "unknown"}:login`;
  if (!canAttemptLogin(key)) {
    sendJson(res, 429, { error: "Zu viele Versuche. Bitte kurz warten." });
    return;
  }

  const matchingUsers = Object.values(USERS)
    .filter((candidate) => safeCompare(password, candidate.password))
    .map((candidate) => candidate.id);

  if (matchingUsers.length !== 1) {
    registerFailedLogin(key);
    sendJson(res, 401, { error: "Falscher Benutzer oder falsches Passwort." });
    return;
  }

  const user = matchingUsers[0];
  failedLogins.delete(key);
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { user, expiresAt });
  setLastSeen(user);
  await saveState();

  sendJson(res, 200, {
    token,
    user,
    expiresAt,
    state: safeStateFor(user),
  });
}

async function handleEvents(req, res, url) {
  const session = requireSession(req, url);
  await cleanupExpiredMessages();
  const clients = sseClients.get(session.user);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  clients.add(res);
  setLastSeen(session.user);
  saveState().catch((error) => console.error("Could not save last seen:", error));
  sendEvent(res, "state", safeStateFor(session.user));
  broadcastState();

  const keepAlive = setInterval(() => {
    sendEvent(res, "ping", { at: Date.now() });
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
    if (clients.size === 0) {
      setTyping(session.user, false);
      setLastSeen(session.user);
      saveState().catch((error) => console.error("Could not save last seen:", error));
    }
    broadcastState();
  });
}

async function handleCreateMessage(req, res, sender) {
  const body = await readJson(req, MAX_JSON_BYTES);
  const text = sanitizeText(body.text || "");
  const hasText = text.trim().length > 0;
  const imagePayload = body.image || null;
  const hasImage = Boolean(imagePayload && imagePayload.data);
  const replyTo = body.replyTo ? createReplyQuote(String(body.replyTo), sender) : null;

  if (!hasText && !hasImage) {
    sendJson(res, 400, { error: "Nachricht oder Bild fehlt." });
    return;
  }

  const id = crypto.randomUUID();
  const recipient = peerOf(sender);
  let image = null;

  if (hasImage) {
    image = await persistImage(id, imagePayload);
  }

  const message = {
    id,
    sender,
    recipient,
    text: hasText ? text : "",
    image,
    replyTo,
    createdAt: Date.now(),
    editedAt: null,
    readAt: null,
  };

  state.messages.push(message);
  setTyping(sender, false);
  await saveState();
  sendJson(res, 201, { message: safeMessageFor(message, sender) });
  broadcastState();
}

async function handleEditMessage(req, res, user, messageId) {
  const message = state.messages.find((item) => item.id === messageId);

  if (!message || (message.sender !== user && message.recipient !== user)) {
    sendJson(res, 404, { error: "Nachricht nicht gefunden." });
    return;
  }

  if (message.sender !== user) {
    sendJson(res, 403, { error: "Nur eigene Nachrichten können bearbeitet werden." });
    return;
  }

  if (message.readAt) {
    sendJson(res, 409, { error: "Gelesene Nachrichten können nicht mehr bearbeitet werden." });
    return;
  }

  const body = await readJson(req, 32 * 1024);
  const text = sanitizeText(body.text || "");
  if (!text.trim() && !message.image) {
    sendJson(res, 400, { error: "Nachricht darf nicht leer sein." });
    return;
  }

  message.text = text;
  message.editedAt = Date.now();
  setTyping(user, false);

  await saveState();
  sendJson(res, 200, { message: safeMessageFor(message, user) });
  broadcastState();
}

async function handleTyping(req, res, user) {
  const body = await readJson(req, 4096);
  setTyping(user, Boolean(body.typing));
  sendJson(res, 200, { ok: true });
  broadcastState();
}

async function handleReadMessage(res, user, messageId) {
  const message = state.messages.find((item) => item.id === messageId);

  if (!message || (message.sender !== user && message.recipient !== user)) {
    sendJson(res, 404, { error: "Nachricht nicht gefunden." });
    return;
  }

  if (message.recipient !== user) {
    sendJson(res, 403, { error: "Nur die Gegenseite kann diese Nachricht als gelesen markieren." });
    return;
  }

  if (!message.readAt) {
    await markMessageRead(message);
    await saveState();
    broadcastState();
  }

  sendJson(res, 200, { message: safeMessageFor(message, user) });
}

async function handleReadAllMessages(res, user) {
  const unreadMessages = state.messages.filter((message) => message.recipient === user && !message.readAt);

  for (const message of unreadMessages) {
    await markMessageRead(message);
  }

  if (unreadMessages.length > 0) {
    await saveState();
    broadcastState();
  }

  sendJson(res, 200, { ok: true, count: unreadMessages.length });
}

async function markMessageRead(message) {
  message.readAt = Date.now();
  message.text = "";

  if (message.image && message.image.filename) {
    await deleteUpload(message.image.filename);
    message.image = null;
  }
}

async function handleMedia(req, res, user, messageId) {
  const message = state.messages.find((item) => item.id === messageId);

  if (!message || (message.sender !== user && message.recipient !== user)) {
    sendJson(res, 404, { error: "Bild nicht gefunden." });
    return;
  }

  if (message.readAt || !message.image) {
    sendJson(res, 410, { error: "Bild wurde unkenntlich gemacht." });
    return;
  }

  const filePath = safeUploadPath(message.image.filename);
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    sendJson(res, 404, { error: "Bilddatei fehlt." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": message.image.mimeType,
    "Content-Length": stat.size,
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename="${message.image.originalName || "cryptus-image"}"`,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

async function serveStatic(req, res, pathname) {
  let relativePath = pathname === "/" ? "/index.html" : pathname;
  if (relativePath.includes("\0")) {
    sendJson(res, 400, { error: "Ungueltiger Pfad." });
    return;
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${relativePath}`);
  const publicRoot = path.resolve(PUBLIC_DIR);
  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
    sendJson(res, 403, { error: "Nicht erlaubt." });
    return;
  }

  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    await serveStatic(req, res, "/index.html");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

async function persistImage(messageId, payload) {
  const mimeType = String(payload.type || "").toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES.get(mimeType);

  if (!extension) {
    throw httpError(415, "Nur JPEG, PNG, WebP und GIF sind erlaubt.");
  }

  const dataUrl = String(payload.data || "");
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match || match[1].toLowerCase() !== mimeType) {
    throw httpError(400, "Bilddaten sind ungueltig.");
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw httpError(413, `Bilder duerfen maximal ${MAX_UPLOAD_MB} MB gross sein.`);
  }

  if (!looksLikeImage(buffer, mimeType)) {
    throw httpError(415, "Bildtyp passt nicht zu den Bilddaten.");
  }

  const filename = `${messageId}.${extension}`;
  await fsp.writeFile(safeUploadPath(filename), buffer, { flag: "wx" });

  return {
    filename,
    originalName: sanitizeFileName(payload.name || `cryptus.${extension}`),
    mimeType,
    size: buffer.length,
  };
}

function looksLikeImage(buffer, mimeType) {
  if (mimeType === "image/png") {
    return buffer.length > 8 && buffer.slice(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  }

  if (mimeType === "image/jpeg") {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/gif") {
    const sig = buffer.slice(0, 6).toString("ascii");
    return sig === "GIF87a" || sig === "GIF89a";
  }

  if (mimeType === "image/webp") {
    return buffer.length > 12 && buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }

  return false;
}

async function deleteUpload(filename) {
  await fsp.unlink(safeUploadPath(filename)).catch((error) => {
    if (error.code !== "ENOENT") {
      console.error(`Could not delete upload ${filename}:`, error);
    }
  });
}

function safeUploadPath(filename) {
  const cleanName = path.basename(filename);
  const fullPath = path.resolve(UPLOAD_DIR, cleanName);
  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (fullPath !== uploadRoot && !fullPath.startsWith(uploadRoot + path.sep)) {
    throw httpError(400, "Ungueltiger Dateiname.");
  }
  return fullPath;
}

async function ensureStorage() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
}

async function loadState() {
  const raw = await fsp.readFile(STATE_FILE, "utf8").catch((error) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (!raw) {
    return {
      messages: [],
      users: createUserState(),
    };
  }

  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.messages)) {
    return {
      messages: [],
      users: createUserState(parsed && parsed.users),
    };
  }

  return {
    messages: parsed.messages.filter(isValidMessage),
    users: createUserState(parsed.users),
  };
}

function saveState() {
  const task = saveQueue.then(writeState);
  saveQueue = task.catch(() => {});
  return task;
}

async function writeState() {
  await ensureStorage();
  const tmpFile = `${STATE_FILE}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(state, null, 2));
  await fsp.rename(tmpFile, STATE_FILE);
}

async function cleanupExpiredMessages(options = {}) {
  const now = Date.now();
  const keptMessages = [];
  const removedMessages = [];

  for (const message of state.messages) {
    const tooOld = now - message.createdAt >= MESSAGE_MAX_AGE_MS;
    const readTooLongAgo = message.readAt && now - message.readAt >= READ_RETENTION_MS;

    if (tooOld || readTooLongAgo) {
      removedMessages.push(message);
    } else {
      keptMessages.push(message);
    }
  }

  if (removedMessages.length === 0) {
    return false;
  }

  state.messages = keptMessages;
  for (const message of removedMessages) {
    if (message.image && message.image.filename) {
      await deleteUpload(message.image.filename);
    }
  }

  await saveState();
  if (options.broadcast !== false) {
    broadcastState();
  }
  return true;
}

function isValidMessage(message) {
  return (
    message &&
    typeof message.id === "string" &&
    USERS[message.sender] &&
    USERS[message.recipient] &&
    message.sender !== message.recipient &&
    typeof message.createdAt === "number"
  );
}

async function readJson(req, maxBytes) {
  const body = await readBody(req, maxBytes);
  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw httpError(400, "JSON konnte nicht gelesen werden.");
  }
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (tooLarge) {
        reject(httpError(413, "Anfrage ist zu gross."));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

function requireSession(req, url) {
  const token = getToken(req, url);
  const session = token ? sessions.get(token) : null;

  if (!session || session.expiresAt < Date.now()) {
    if (token) {
      sessions.delete(token);
    }
    throw httpError(401, "Bitte neu anmelden.");
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function getToken(req, url) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return url.searchParams.get("token");
}

function safeStateFor(user) {
  purgeStaleTyping();

  return {
    user,
    peer: peerOf(user),
    users: publicUsers(),
    config: {
      maxUploadMb: MAX_UPLOAD_MB,
      sessionTtlHours: SESSION_TTL_MS / 60 / 60 / 1000,
      messageMaxHours: MESSAGE_MAX_AGE_MS / 60 / 60 / 1000,
      readDeleteMinutes: READ_RETENTION_MS / 60 / 1000,
      version: APP_VERSION.version,
      versionDate: APP_VERSION.date,
      versionSequence: APP_VERSION.sequence,
    },
    messages: state.messages.map((message) => safeMessageFor(message, user)),
  };
}

function safeMessageFor(message, user) {
  const redacted = Boolean(message.readAt);
  const allowed = message.sender === user || message.recipient === user;

  return {
    id: message.id,
    sender: message.sender,
    recipient: message.recipient,
    own: message.sender === user,
    createdAt: message.createdAt,
    editedAt: !redacted && allowed ? message.editedAt || null : null,
    readAt: message.readAt,
    redacted,
    canEdit: !redacted && message.sender === user && !message.readAt,
    replyTo: !redacted && allowed && message.replyTo ? safeReplyQuote(message.replyTo) : null,
    text: !redacted && allowed ? message.text : "",
    image: !redacted && allowed && message.image
      ? {
          name: message.image.originalName,
          mimeType: message.image.mimeType,
          size: message.image.size,
        }
      : null,
  };
}

function createReplyQuote(messageId, user) {
  const target = state.messages.find((message) => message.id === messageId);

  if (!target || (target.sender !== user && target.recipient !== user) || target.readAt) {
    throw httpError(400, "Antwort-Zitat ist nicht mehr verfügbar.");
  }

  return {
    id: target.id,
    sender: target.sender,
    text: summarizeMessage(target),
    hasImage: Boolean(target.image),
    createdAt: target.createdAt,
  };
}

function safeReplyQuote(replyTo) {
  return {
    id: replyTo.id,
    sender: replyTo.sender,
    text: replyTo.text || "",
    hasImage: Boolean(replyTo.hasImage),
    createdAt: replyTo.createdAt || null,
  };
}

function summarizeMessage(message) {
  const text = String(message.text || "").replace(/\s+/g, " ").trim();
  if (text) {
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  }

  if (message.image) {
    return "Bild";
  }

  return "Nachricht";
}

function publicUsers() {
  purgeStaleTyping();

  return Object.fromEntries(
    Object.values(USERS).map((user) => [
      user.id,
      {
        id: user.id,
        label: user.label,
        online: sseClients.get(user.id).size > 0,
        typing: isTyping(user.id),
        lastSeenAt: state.users[user.id] ? state.users[user.id].lastSeenAt : null,
      },
    ]),
  );
}

function createUserState(source = {}) {
  return Object.fromEntries(
    Object.keys(USERS || { A: true, B: true }).map((user) => {
      const value = source && source[user] && typeof source[user].lastSeenAt === "number"
        ? source[user].lastSeenAt
        : null;
      return [user, { lastSeenAt: value }];
    }),
  );
}

function loadAppVersion() {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const fallbackVersion = `${fallbackDate.replaceAll("-", ".")}.1`;

  try {
    const raw = fs.readFileSync(VERSION_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const version = String(parsed.version || "").trim();
    const date = String(parsed.date || "").trim();
    const sequence = Number(parsed.sequence || 0);

    if (version && date && Number.isInteger(sequence) && sequence > 0) {
      return { version, date, sequence };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Could not read version.json:", error.message);
    }
  }

  return {
    version: process.env.APP_VERSION || fallbackVersion,
    date: fallbackDate,
    sequence: 1,
  };
}

function setLastSeen(user, timestamp = Date.now()) {
  if (!state.users) {
    state.users = createUserState();
  }
  if (!state.users[user]) {
    state.users[user] = { lastSeenAt: null };
  }
  state.users[user].lastSeenAt = timestamp;
}

function setTyping(user, typing) {
  const existingTimer = typingExpiryTimers.get(user);
  if (existingTimer) {
    clearTimeout(existingTimer);
    typingExpiryTimers.delete(user);
  }

  typingState.set(user, {
    typing: Boolean(typing),
    updatedAt: Date.now(),
  });

  if (typing) {
    const timer = setTimeout(() => {
      typingExpiryTimers.delete(user);
      typingState.set(user, { typing: false, updatedAt: Date.now() });
      broadcastState();
    }, TYPING_TTL_MS);
    typingExpiryTimers.set(user, timer);
  }
}

function isTyping(user) {
  const entry = typingState.get(user);
  return Boolean(entry && entry.typing && Date.now() - entry.updatedAt < TYPING_TTL_MS);
}

function purgeStaleTyping() {
  for (const [user, entry] of typingState.entries()) {
    if (entry.typing && Date.now() - entry.updatedAt >= TYPING_TTL_MS) {
      setTyping(user, false);
    }
  }
}

function peerOf(user) {
  return user === "A" ? "B" : "A";
}

function broadcastState() {
  for (const user of Object.keys(USERS)) {
    for (const client of sseClients.get(user)) {
      sendEvent(client, "state", safeStateFor(user));
    }
  }
}

function sendEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function sanitizeText(value) {
  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, 4000);
}

function sanitizeFileName(value) {
  return String(value)
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "cryptus-image";
}

function safeCompare(input, secret) {
  const inputBuffer = Buffer.from(String(input));
  const secretBuffer = Buffer.from(String(secret));
  const length = Math.max(inputBuffer.length, secretBuffer.length);
  const a = Buffer.alloc(length);
  const b = Buffer.alloc(length);
  inputBuffer.copy(a);
  secretBuffer.copy(b);
  return crypto.timingSafeEqual(a, b) && inputBuffer.length === secretBuffer.length;
}

function canAttemptLogin(key) {
  const record = failedLogins.get(key);
  if (!record) {
    return true;
  }

  if (record.blockedUntil && record.blockedUntil > Date.now()) {
    return false;
  }

  if (Date.now() - record.firstAt > 10 * 60 * 1000) {
    failedLogins.delete(key);
  }

  return true;
}

function registerFailedLogin(key) {
  const now = Date.now();
  const record = failedLogins.get(key) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (now - record.firstAt > 10 * 60 * 1000) {
    record.count = 0;
    record.firstAt = now;
    record.blockedUntil = 0;
  }
  record.count += 1;
  if (record.count >= 8) {
    record.blockedUntil = now + 10 * 60 * 1000;
  }
  failedLogins.set(key, record);
}

function httpError(statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
