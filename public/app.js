"use strict";

const elements = {
  authView: document.getElementById("authView"),
  chatView: document.getElementById("chatView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  passwordInput: document.getElementById("passwordInput"),
  peerAvatar: document.getElementById("peerAvatar"),
  peerName: document.getElementById("peerName"),
  peerStatus: document.getElementById("peerStatus"),
  selfBadge: document.getElementById("selfBadge"),
  logoutButton: document.getElementById("logoutButton"),
  messageList: document.getElementById("messageList"),
  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  emojiButton: document.getElementById("emojiButton"),
  emojiPicker: document.getElementById("emojiPicker"),
  attachButton: document.getElementById("attachButton"),
  imageInput: document.getElementById("imageInput"),
  attachmentPreview: document.getElementById("attachmentPreview"),
  attachmentImage: document.getElementById("attachmentImage"),
  attachmentName: document.getElementById("attachmentName"),
  attachmentSize: document.getElementById("attachmentSize"),
  removeAttachmentButton: document.getElementById("removeAttachmentButton"),
  lightbox: document.getElementById("lightbox"),
  lightboxImage: document.getElementById("lightboxImage"),
  closeLightboxButton: document.getElementById("closeLightboxButton"),
};

const emojis = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
  "🥲", "☺️", "😊", "😇", "🙂", "🙃", "😉", "😌",
  "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛",
  "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🫣",
  "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶",
  "🫥", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌",
  "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢",
  "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠",
  "🥳", "🥸", "😎", "🤓", "🧐", "😕", "🫤", "😟",
  "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "🥹",
  "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱",
  "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤",
  "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩",
  "🤡", "👻", "👽", "🤖", "😺", "😸", "😹", "😻",
  "😼", "😽", "🙀", "😿", "😾",
  "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏",
  "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
  "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛",
  "🤜", "👏", "🙌", "🫶", "🤲", "🙏", "💪", "🫵",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
  "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "❣️", "💕", "💞", "💓",
  "💗", "💖", "💘", "💝", "💟", "💤", "💯", "💢",
  "💥", "💫", "💦", "💨", "🕳️", "💬", "👁️‍🗨️", "🗨️",
  "✨", "⭐", "🌟", "🔥", "🎉", "🎊", "🎁", "🏆",
  "✅", "☑️", "✔️", "❌", "❓", "❗", "⚠️", "🔒",
  "🔑", "📎", "📸", "🖼️", "📍", "⏰", "☕", "🍕",
  "🍔", "🍟", "🍫", "🍿", "🍻", "🥂", "🍀", "🚀",
];

const state = {
  token: "",
  user: "",
  peer: "",
  users: {},
  config: { maxUploadMb: 8 },
  messages: [],
  events: null,
  selectedImage: null,
  selectedImagePreviewUrl: "",
  mediaUrls: new Map(),
  typingTimer: 0,
  typingRequest: null,
  typingSent: false,
  typingSentAt: 0,
};

initialize();

function initialize() {
  renderEmojiPicker();
  bindEvents();
  restoreSession();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.loginError.textContent = "";

    try {
      const result = await api("/api/login", {
        method: "POST",
        body: {
          password: elements.passwordInput.value,
        },
        anonymous: true,
      });

      applyLogin(result.token, result.user, result.state);
      localStorage.setItem("cryptus.session", JSON.stringify({ token: result.token, user: result.user }));
      elements.passwordInput.value = "";
    } catch (error) {
      elements.loginError.textContent = error.message;
    }
  });

  elements.logoutButton.addEventListener("click", logout);

  elements.composerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMessage();
  });

  elements.messageInput.addEventListener("input", () => {
    autoResizeTextarea();
    noteTyping();
  });

  elements.messageInput.addEventListener("blur", () => {
    sendTyping(false);
  });

  elements.messageInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  });

  elements.emojiButton.addEventListener("click", () => {
    elements.emojiPicker.classList.toggle("hidden");
  });

  elements.attachButton.addEventListener("click", () => {
    elements.imageInput.click();
  });

  elements.imageInput.addEventListener("change", () => {
    const file = elements.imageInput.files && elements.imageInput.files[0];
    if (file) {
      selectImage(file);
    }
    elements.imageInput.value = "";
  });

  elements.removeAttachmentButton.addEventListener("click", clearSelectedImage);

  elements.closeLightboxButton.addEventListener("click", closeLightbox);
  elements.lightbox.addEventListener("click", (event) => {
    if (event.target === elements.lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      elements.emojiPicker.classList.add("hidden");
      closeLightbox();
    }
  });

  document.addEventListener("click", (event) => {
    if (!elements.emojiPicker.contains(event.target) && event.target !== elements.emojiButton) {
      elements.emojiPicker.classList.add("hidden");
    }
  });

  window.addEventListener("beforeunload", () => {
    sendTyping(false, { keepalive: true });
  });
}

async function restoreSession() {
  const saved = localStorage.getItem("cryptus.session");
  if (!saved) {
    showAuth();
    return;
  }

  try {
    const session = JSON.parse(saved);
    state.token = session.token;
    state.user = session.user;
    const snapshot = await api("/api/state");
    applyLogin(session.token, session.user, snapshot);
  } catch (error) {
    logout();
  }
}

function applyLogin(token, user, snapshot) {
  state.token = token;
  state.user = user;
  applySnapshot(snapshot);
  showChat();
  connectEvents();
}

function showAuth() {
  elements.authView.classList.remove("hidden");
  elements.chatView.classList.add("hidden");
  elements.passwordInput.focus();
}

function showChat() {
  elements.authView.classList.add("hidden");
  elements.chatView.classList.remove("hidden");
  elements.messageInput.focus();
  scrollToBottom();
}

function logout() {
  if (state.events) {
    state.events.close();
  }

  state.events = null;
  state.token = "";
  state.user = "";
  state.peer = "";
  state.users = {};
  state.messages = [];
  localStorage.removeItem("cryptus.session");
  clearSelectedImage();
  revokeUnusedMedia(new Set());
  showAuth();
}

function connectEvents() {
  if (state.events) {
    state.events.close();
  }

  const events = new EventSource(`/api/events?token=${encodeURIComponent(state.token)}`);
  state.events = events;

  events.addEventListener("state", (event) => {
    applySnapshot(JSON.parse(event.data));
  });

  events.onerror = () => {
    elements.peerStatus.textContent = "Verbindung wird wiederhergestellt";
  };
}

function applySnapshot(snapshot) {
  state.peer = snapshot.peer;
  state.users = snapshot.users || {};
  state.config = snapshot.config || state.config;
  state.messages = snapshot.messages || [];
  renderHeader();
  renderMessages();
}

async function sendMessage() {
  const text = elements.messageInput.value.trimEnd();
  if (!text.trim() && !state.selectedImage) {
    return;
  }

  const payload = { text };

  try {
    sendTyping(false);
    setComposerEnabled(false);
    if (state.selectedImage) {
      payload.image = {
        name: state.selectedImage.name,
        type: state.selectedImage.type,
        data: await readFileAsDataUrl(state.selectedImage),
      };
    }

    await api("/api/messages", {
      method: "POST",
      body: payload,
    });

    elements.messageInput.value = "";
    autoResizeTextarea();
    clearSelectedImage();
    elements.emojiPicker.classList.add("hidden");
  } catch (error) {
    alert(error.message);
  } finally {
    setComposerEnabled(true);
    elements.messageInput.focus();
  }
}

async function markRead(messageId, button) {
  button.disabled = true;
  try {
    await api(`/api/messages/${messageId}/read`, { method: "POST", body: {} });
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
}

function renderHeader() {
  const peer = state.users[state.peer] || { label: `User ${state.peer}`, online: false };
  const self = state.users[state.user] || { label: `User ${state.user}` };

  elements.peerAvatar.textContent = state.peer || "?";
  elements.peerName.textContent = peer.label;
  elements.peerStatus.textContent = peer.typing ? "schreibt..." : peer.online ? "Online" : "Offline";
  elements.peerStatus.classList.toggle("typing", Boolean(peer.typing));
  elements.selfBadge.textContent = self.label;
}

function renderMessages() {
  const nearBottom = elements.messageList.scrollHeight - elements.messageList.scrollTop - elements.messageList.clientHeight < 120;
  const visibleMedia = new Set();

  elements.messageList.textContent = "";

  if (state.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Noch keine Nachrichten.";
    elements.messageList.append(empty);
    revokeUnusedMedia(visibleMedia);
    return;
  }

  for (const message of state.messages) {
    if (message.image && !message.redacted) {
      visibleMedia.add(message.id);
    }
    elements.messageList.append(renderMessage(message));
  }

  revokeUnusedMedia(visibleMedia);
  if (nearBottom) {
    scrollToBottom();
  }
}

function renderMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.own ? "own" : "peer"}${message.redacted ? " redacted" : ""}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const from = document.createElement("span");
  from.textContent = message.own ? "Du" : labelFor(message.sender);

  const time = document.createElement("time");
  time.dateTime = new Date(message.createdAt).toISOString();
  time.textContent = formatTime(message.createdAt);

  meta.append(from, time);
  article.append(meta);

  if (message.redacted) {
    const redacted = document.createElement("div");
    redacted.className = "redacted-line";
    const label = document.createElement("span");
    label.textContent = message.readAt ? `Gelesen ${formatTime(message.readAt)}` : "Unkenntlich";
    redacted.append(label);
    article.append(redacted);
    return article;
  }

  if (message.text) {
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.text;
    article.append(text);
  }

  if (message.image) {
    article.append(renderImage(message));
  }

  if (!message.own && !message.readAt) {
    const readButton = document.createElement("button");
    readButton.className = "read-button";
    readButton.type = "button";
    readButton.textContent = "Gelesen";
    readButton.addEventListener("click", () => markRead(message.id, readButton));
    article.append(readButton);
  }

  return article;
}

function renderImage(message) {
  const holder = document.createElement("button");
  holder.className = "message-image";
  holder.type = "button";
  holder.title = "Bild ansehen";
  holder.setAttribute("aria-label", "Bild ansehen");

  const loading = document.createElement("span");
  loading.className = "image-loading";
  loading.textContent = "Bild lädt";
  holder.append(loading);

  loadMedia(message.id)
    .then((url) => {
      holder.textContent = "";
      const img = document.createElement("img");
      img.src = url;
      img.alt = message.image.name || "Bildnachricht";
      holder.append(img);
      holder.addEventListener("click", () => openLightbox(url, img.alt));
    })
    .catch(() => {
      holder.textContent = "";
      const error = document.createElement("span");
      error.className = "image-error";
      error.textContent = "Bild nicht verfügbar";
      holder.append(error);
    });

  return holder;
}

async function loadMedia(messageId) {
  if (state.mediaUrls.has(messageId)) {
    return state.mediaUrls.get(messageId);
  }

  const response = await fetch(`/api/media/${messageId}`, {
    headers: { Authorization: `Bearer ${state.token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Bild nicht verfügbar");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  state.mediaUrls.set(messageId, url);
  return url;
}

function revokeUnusedMedia(visibleIds) {
  for (const [id, url] of state.mediaUrls.entries()) {
    if (!visibleIds.has(id)) {
      URL.revokeObjectURL(url);
      state.mediaUrls.delete(id);
    }
  }
}

function renderEmojiPicker() {
  elements.emojiPicker.textContent = "";
  for (const emoji of emojis) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = emoji;
    button.addEventListener("click", () => {
      insertAtCursor(elements.messageInput, emoji);
      autoResizeTextarea();
      noteTyping();
      elements.messageInput.focus();
    });
    elements.emojiPicker.append(button);
  }
}

function noteTyping() {
  if (!state.token || elements.messageInput.disabled) {
    return;
  }

  const hasText = elements.messageInput.value.trim().length > 0;
  window.clearTimeout(state.typingTimer);

  if (!hasText) {
    sendTyping(false);
    return;
  }

  const now = Date.now();
  if (!state.typingSent || now - state.typingSentAt > 1200) {
    sendTyping(true);
  }

  state.typingTimer = window.setTimeout(() => {
    sendTyping(false);
  }, 1800);
}

function sendTyping(typing, options = {}) {
  if (!state.token) {
    return Promise.resolve();
  }

  window.clearTimeout(state.typingTimer);

  if (state.typingSent === typing && typing && Date.now() - state.typingSentAt < 1200) {
    return Promise.resolve();
  }

  state.typingSent = typing;
  state.typingSentAt = Date.now();

  const payload = JSON.stringify({ typing });

  if (options.keepalive && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon(`/api/typing?token=${encodeURIComponent(state.token)}`, blob);
    return Promise.resolve();
  }

  if (state.typingRequest) {
    state.typingRequest.abort();
  }

  const controller = new AbortController();
  state.typingRequest = controller;

  return fetch("/api/typing", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json",
    },
    body: payload,
    cache: "no-store",
    signal: controller.signal,
  })
    .catch(() => {})
    .finally(() => {
      if (state.typingRequest === controller) {
        state.typingRequest = null;
      }
    });
}

function selectImage(file) {
  if (!file.type.startsWith("image/")) {
    alert("Bitte ein Bild auswählen.");
    return;
  }

  const limit = (state.config.maxUploadMb || 8) * 1024 * 1024;
  if (file.size > limit) {
    alert(`Das Bild darf maximal ${state.config.maxUploadMb || 8} MB groß sein.`);
    return;
  }

  clearSelectedImage();
  state.selectedImage = file;
  state.selectedImagePreviewUrl = URL.createObjectURL(file);
  elements.attachmentImage.src = state.selectedImagePreviewUrl;
  elements.attachmentImage.alt = file.name;
  elements.attachmentName.textContent = file.name;
  elements.attachmentSize.textContent = formatBytes(file.size);
  elements.attachmentPreview.classList.remove("hidden");
}

function clearSelectedImage() {
  if (state.selectedImagePreviewUrl) {
    URL.revokeObjectURL(state.selectedImagePreviewUrl);
  }
  state.selectedImage = null;
  state.selectedImagePreviewUrl = "";
  elements.attachmentImage.removeAttribute("src");
  elements.attachmentName.textContent = "";
  elements.attachmentSize.textContent = "";
  elements.attachmentPreview.classList.add("hidden");
}

function openLightbox(src, alt) {
  elements.lightboxImage.src = src;
  elements.lightboxImage.alt = alt;
  elements.lightbox.classList.remove("hidden");
}

function closeLightbox() {
  elements.lightbox.classList.add("hidden");
  elements.lightboxImage.removeAttribute("src");
}

function setComposerEnabled(enabled) {
  elements.messageInput.disabled = !enabled;
  elements.attachButton.disabled = !enabled;
  elements.emojiButton.disabled = !enabled;
  document.getElementById("sendButton").disabled = !enabled;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!options.anonymous && state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  const fetchOptions = {
    method: options.method || "GET",
    headers,
    cache: "no-store",
  };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, fetchOptions);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Anfrage fehlgeschlagen.");
  }

  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function insertAtCursor(input, value) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
  const next = start + value.length;
  input.setSelectionRange(next, next);
}

function autoResizeTextarea() {
  elements.messageInput.style.height = "auto";
  elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 150)}px`;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
  });
}

function labelFor(user) {
  return (state.users[user] && state.users[user].label) || `User ${user}`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
