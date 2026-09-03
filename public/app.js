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
  markAllReadButton: document.getElementById("markAllReadButton"),
  selfBadge: document.getElementById("selfBadge"),
  logoutButton: document.getElementById("logoutButton"),
  messageList: document.getElementById("messageList"),
  typingIndicator: document.getElementById("typingIndicator"),
  typingText: document.getElementById("typingText"),
  contextPreview: document.getElementById("contextPreview"),
  contextTitle: document.getElementById("contextTitle"),
  contextText: document.getElementById("contextText"),
  cancelContextButton: document.getElementById("cancelContextButton"),
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
  "🍔", "🍟", "🌭", "🌮", "🍣", "🍜", "🍪", "🍫",
  "🍿", "🍓", "🍉", "🍒", "🍻", "🥂", "🍾", "🍀",
  "🌈", "☀️", "🌙", "⚡", "💧", "🌊", "🏠", "🚗",
  "✈️", "🚀", "🛎️", "📞", "📱", "💻", "🎧", "🎮",
  "🎵", "🎬", "💡", "🧠", "💊", "🧾", "💰", "💎",
];

const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const state = {
  token: "",
  user: "",
  peer: "",
  users: {},
  config: { maxUploadMb: 8 },
  messages: [],
  messageRenderKey: null,
  events: null,
  selectedImage: null,
  selectedImagePreviewUrl: "",
  replyTarget: null,
  editingMessage: null,
  mediaUrls: new Map(),
  typingTimer: 0,
  typingRequest: null,
  typingSent: false,
  typingSentAt: 0,
  knownMessageIds: new Set(),
  hasMessageSnapshot: false,
  unreadCount: 0,
  audioContext: null,
  audioUnlocked: false,
  openMenuMessageId: null,
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
    unlockNotificationSound();
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
  elements.markAllReadButton.addEventListener("click", markAllRead);

  elements.composerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await sendMessage();
  });

  elements.messageInput.addEventListener("input", () => {
    autoResizeTextarea();
    noteTyping();
  });

  elements.messageInput.addEventListener("paste", handleMessagePaste);

  elements.messageInput.addEventListener("blur", () => {
    sendTyping(false);
  });

  elements.messageInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  });

  elements.emojiButton.addEventListener("click", (event) => {
    event.stopPropagation();
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
  elements.cancelContextButton.addEventListener("click", clearComposerContext);

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
    if (!elements.emojiPicker.contains(event.target) && !elements.emojiButton.contains(event.target)) {
      elements.emojiPicker.classList.add("hidden");
    }

    if (!event.target.closest(".message-action-menu")) {
      closeMessageMenu();
    }
  });

  document.addEventListener("pointerdown", unlockNotificationSound, { once: true });
  document.addEventListener("keydown", unlockNotificationSound, { once: true });
  document.addEventListener("paste", handleDocumentPaste);

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
  sendTyping(false);

  if (state.events) {
    state.events.close();
  }

  window.clearTimeout(state.typingTimer);
  state.events = null;
  state.token = "";
  state.user = "";
  state.peer = "";
  state.users = {};
  state.messages = [];
  state.messageRenderKey = null;
  state.replyTarget = null;
  state.editingMessage = null;
  state.knownMessageIds = new Set();
  state.hasMessageSnapshot = false;
  document.title = "Cryptus";
  localStorage.removeItem("cryptus.session");
  clearSelectedImage();
  renderComposerContext();
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
  const messages = snapshot.messages || [];
  const nextRenderKey = getMessageRenderKey(messages);
  const messagesChanged = nextRenderKey !== state.messageRenderKey;

  state.peer = snapshot.peer;
  state.users = snapshot.users || {};
  state.config = snapshot.config || state.config;
  updateMessageNotifications(messages);
  state.messages = messages;
  renderHeader();
  syncComposerContext();

  if (messagesChanged) {
    state.messageRenderKey = nextRenderKey;
    renderMessages();
  }
}

async function sendMessage() {
  const text = elements.messageInput.value.trimEnd();
  if (state.editingMessage) {
    await saveEditedMessage(text);
    return;
  }

  if (!text.trim() && !state.selectedImage) {
    return;
  }

  const payload = {
    text,
    replyTo: state.replyTarget ? state.replyTarget.id : null,
  };

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
    clearComposerContext();
    clearSelectedImage();
    elements.emojiPicker.classList.add("hidden");
  } catch (error) {
    alert(error.message);
  } finally {
    setComposerEnabled(true);
    elements.messageInput.focus();
  }
}

async function saveEditedMessage(text) {
  if (!state.editingMessage) {
    return;
  }

  if (!text.trim() && !state.editingMessage.image) {
    return;
  }

  try {
    sendTyping(false);
    setComposerEnabled(false);
    await api(`/api/messages/${state.editingMessage.id}`, {
      method: "PATCH",
      body: { text },
    });

    elements.messageInput.value = "";
    autoResizeTextarea();
    clearComposerContext();
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

async function markAllRead() {
  if (state.unreadCount === 0) {
    return;
  }

  elements.markAllReadButton.disabled = true;
  try {
    await api("/api/messages/read-all", { method: "POST", body: {} });
  } catch (error) {
    alert(error.message);
    updateMarkAllReadButton();
  }
}

function startReply(message) {
  if (message.redacted) {
    return;
  }

  state.editingMessage = null;
  state.replyTarget = {
    id: message.id,
    sender: message.sender,
    text: getMessagePreviewText(message),
    hasImage: Boolean(message.image),
  };
  renderComposerContext();
  elements.messageInput.focus();
}

function startEdit(message) {
  if (!message.canEdit) {
    return;
  }

  clearSelectedImage();
  state.replyTarget = null;
  state.editingMessage = {
    id: message.id,
    text: message.text || "",
    image: message.image,
  };
  elements.messageInput.value = message.text || "";
  autoResizeTextarea();
  renderComposerContext();
  elements.messageInput.focus();
}

function clearComposerContext() {
  state.replyTarget = null;
  state.editingMessage = null;
  renderComposerContext();
}

function syncComposerContext() {
  if (state.replyTarget) {
    const target = state.messages.find((message) => message.id === state.replyTarget.id);
    if (!target || target.redacted) {
      state.replyTarget = null;
    } else {
      state.replyTarget = {
        id: target.id,
        sender: target.sender,
        text: getMessagePreviewText(target),
        hasImage: Boolean(target.image),
      };
    }
  }

  if (state.editingMessage) {
    const target = state.messages.find((message) => message.id === state.editingMessage.id);
    if (!target || !target.canEdit) {
      state.editingMessage = null;
      elements.messageInput.value = "";
      autoResizeTextarea();
    } else {
      state.editingMessage = {
        id: target.id,
        text: target.text || "",
        image: target.image,
      };
    }
  }

  renderComposerContext();
}

function renderComposerContext() {
  const isEditing = Boolean(state.editingMessage);
  const isReplying = Boolean(state.replyTarget);

  elements.contextPreview.classList.toggle("hidden", !isEditing && !isReplying);
  elements.attachButton.disabled = isEditing;

  if (isEditing) {
    elements.contextPreview.classList.add("editing");
    elements.contextTitle.textContent = "Nachricht bearbeiten";
    elements.contextText.textContent = state.editingMessage.text || (state.editingMessage.image ? "Bild" : "Nachricht");
    return;
  }

  elements.contextPreview.classList.remove("editing");

  if (isReplying) {
    elements.contextTitle.textContent = `Antwort an ${state.replyTarget.sender === state.user ? "dich" : labelFor(state.replyTarget.sender)}`;
    elements.contextText.textContent = getQuoteText(state.replyTarget);
  }
}

function getMessageRenderKey(messages) {
  return messages
    .map((message) => [
      message.id,
      message.readAt || "",
      message.editedAt || "",
      message.text || "",
      message.image ? "image" : "",
      message.replyTo ? `${message.replyTo.id}:${message.replyTo.text}:${message.replyTo.hasImage ? 1 : 0}` : "",
      message.canEdit ? 1 : 0,
    ].join("|"))
    .join("~");
}

function renderHeader() {
  const peer = state.users[state.peer] || { label: `User ${state.peer}`, online: false };
  const self = state.users[state.user] || { label: `User ${state.user}` };

  elements.peerAvatar.textContent = state.peer || "?";
  elements.peerName.textContent = peer.label;
  elements.peerStatus.textContent = getPeerStatus(peer);
  elements.peerStatus.classList.toggle("typing", Boolean(peer.typing));
  elements.selfBadge.textContent = self.label;
  updateMarkAllReadButton();
  renderTypingIndicator(peer);
}

function getPeerStatus(peer) {
  if (peer.typing) {
    return "schreibt...";
  }

  if (peer.online) {
    return "Online";
  }

  if (peer.lastSeenAt) {
    return `zuletzt online ${formatLastSeen(peer.lastSeenAt)}`;
  }

  return "Offline";
}

function renderTypingIndicator(peer) {
  const isTyping = Boolean(peer && peer.typing);
  elements.typingIndicator.classList.toggle("is-visible", isTyping);
  elements.typingText.textContent = isTyping ? `${peer.label} schreibt...` : "";
}

function updateMessageNotifications(messages) {
  const nextIds = new Set(messages.map((message) => message.id));
  const unreadCount = messages.filter((message) => !message.own && !message.readAt && !message.redacted).length;
  state.unreadCount = unreadCount;

  document.title = unreadCount > 0 ? `(${unreadCount}) Cryptus` : "Cryptus";

  if (state.hasMessageSnapshot) {
    const hasNewIncoming = messages.some((message) => (
      !state.knownMessageIds.has(message.id) &&
      !message.own &&
      !message.readAt &&
      !message.redacted
    ));

    if (hasNewIncoming) {
      playNotificationSound();
    }
  }

  state.knownMessageIds = nextIds;
  state.hasMessageSnapshot = true;
}

function updateMarkAllReadButton() {
  const hasUnread = state.unreadCount > 0;
  elements.markAllReadButton.classList.toggle("hidden", !hasUnread);
  elements.markAllReadButton.disabled = !hasUnread;
  elements.markAllReadButton.querySelector("span").textContent = hasUnread
    ? `Alle gelesen (${state.unreadCount})`
    : "Alle gelesen";
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
  const soloEmoji = isSoloEmojiMessage(message);
  const article = document.createElement("article");
  article.className = `message ${message.own ? "own" : "peer"}${message.redacted ? " redacted" : ""}${soloEmoji ? " solo-emoji" : ""}`;
  article.dataset.messageId = message.id;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const from = document.createElement("span");
  from.textContent = message.own ? "Du" : labelFor(message.sender);

  const time = document.createElement("time");
  time.dateTime = new Date(message.createdAt).toISOString();
  time.textContent = message.editedAt ? `${formatTime(message.createdAt)} · bearbeitet` : formatTime(message.createdAt);

  const metaTail = document.createElement("div");
  metaTail.className = "message-meta-tail";
  metaTail.append(time);

  meta.append(from, metaTail);
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

  if (message.replyTo) {
    article.append(renderReplyQuote(message.replyTo));
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

  article.append(renderMessageMenu(message));

  return article;
}

function renderMessageMenu(message) {
  const menu = document.createElement("div");
  menu.className = "message-action-menu";

  const trigger = document.createElement("button");
  trigger.className = "message-menu-trigger";
  trigger.type = "button";
  trigger.title = "Nachrichtenoptionen";
  trigger.setAttribute("aria-label", "Nachrichtenoptionen");
  trigger.setAttribute("aria-expanded", state.openMenuMessageId === message.id ? "true" : "false");
  trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    state.openMenuMessageId = state.openMenuMessageId === message.id ? null : message.id;
    renderMessages();
  });
  menu.append(trigger);

  if (state.openMenuMessageId === message.id) {
    const list = document.createElement("div");
    list.className = "message-menu-list";
    list.setAttribute("role", "menu");

    const replyItem = document.createElement("button");
    replyItem.type = "button";
    replyItem.setAttribute("role", "menuitem");
    replyItem.textContent = "Zitieren";
    replyItem.addEventListener("click", (event) => {
      event.stopPropagation();
      closeMessageMenu();
      startReply(message);
    });
    list.append(replyItem);

    if (message.canEdit) {
      const editItem = document.createElement("button");
      editItem.type = "button";
      editItem.setAttribute("role", "menuitem");
      editItem.textContent = "Bearbeiten";
      editItem.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMessageMenu();
        startEdit(message);
      });
      list.append(editItem);
    }

    menu.append(list);
  }

  return menu;
}

function closeMessageMenu() {
  if (!state.openMenuMessageId) {
    return;
  }

  state.openMenuMessageId = null;
  renderMessages();
}

function renderReplyQuote(replyTo) {
  const quote = document.createElement("button");
  quote.className = "reply-quote";
  quote.type = "button";
  quote.title = "Zitierte Nachricht";
  quote.setAttribute("aria-label", "Zitierte Nachricht");

  const author = document.createElement("strong");
  author.textContent = replyTo.sender === state.user ? "Du" : labelFor(replyTo.sender);

  const text = document.createElement("span");
  text.textContent = getQuoteText(replyTo);

  quote.append(author, text);
  quote.addEventListener("click", () => {
    const target = document.querySelector(`[data-message-id="${replyTo.id}"]`);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("message-highlight");
      window.setTimeout(() => target.classList.remove("message-highlight"), 1200);
    }
  });

  return quote;
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

function handleMessagePaste(event) {
  if (!state.token || elements.messageInput.disabled) {
    return;
  }

  const pastedImage = getClipboardImage(event.clipboardData);
  if (!pastedImage) {
    return;
  }

  event.preventDefault();

  if (state.editingMessage) {
    alert("Beim Bearbeiten kann kein neues Bild eingefügt werden.");
    return;
  }

  selectImage(prepareClipboardImage(pastedImage));
  elements.messageInput.focus();
}

function handleDocumentPaste(event) {
  if (event.target === elements.messageInput || elements.chatView.classList.contains("hidden")) {
    return;
  }

  if (isTextInputTarget(event.target)) {
    return;
  }

  handleMessagePaste(event);
}

function isTextInputTarget(target) {
  const element = target instanceof Element ? target : target && target.parentElement;
  if (!element) {
    return false;
  }

  return Boolean(element.closest("input, textarea, [contenteditable]"));
}

function getClipboardImage(clipboardData) {
  if (!clipboardData) {
    return null;
  }

  for (const item of Array.from(clipboardData.items || [])) {
    if (item.kind === "file" && supportedImageTypes.has(item.type)) {
      return item.getAsFile();
    }
  }

  return Array.from(clipboardData.files || []).find((file) => supportedImageTypes.has(file.type)) || null;
}

function prepareClipboardImage(file) {
  if (!file) {
    return null;
  }

  const genericNames = new Set(["", "image.png", "image.jpg", "image.jpeg", "image.gif", "image.webp"]);
  if (!genericNames.has((file.name || "").toLowerCase())) {
    return file;
  }

  const type = file.type || "image/png";
  const extension = getImageExtension(type);
  return new File([file], `zwischenablage-${formatFileTimestamp(new Date())}.${extension}`, {
    type,
    lastModified: Date.now(),
  });
}

function getImageExtension(mimeType) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  if (mimeType === "image/gif") {
    return "gif";
  }

  return "png";
}

function formatFileTimestamp(date) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
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
  if (!file || !supportedImageTypes.has(file.type)) {
    alert("Bitte ein PNG-, JPG-, WEBP- oder GIF-Bild auswählen.");
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
  elements.attachButton.disabled = !enabled || Boolean(state.editingMessage);
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
  const previousScrollTop = elements.messageList.scrollTop;
  const nextMinHeight = 46;

  elements.messageInput.style.height = `${nextMinHeight}px`;
  const nextHeight = Math.min(Math.max(elements.messageInput.scrollHeight, nextMinHeight), 150);
  elements.messageInput.style.height = `${nextHeight}px`;
  elements.messageInput.style.overflowY = elements.messageInput.scrollHeight > 150 ? "auto" : "hidden";
  elements.messageList.scrollTop = previousScrollTop;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
  });
}

function labelFor(user) {
  return (state.users[user] && state.users[user].label) || `User ${user}`;
}

function getMessagePreviewText(message) {
  const text = String(message.text || "").replace(/\s+/g, " ").trim();
  if (text) {
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  }

  if (message.image) {
    return "Bild";
  }

  return "Nachricht";
}

function getQuoteText(source) {
  const text = String(source.text || "").trim();
  if (source.hasImage && text && text !== "Bild") {
    return `Bild · ${text}`;
  }

  if (text) {
    return text;
  }

  return source.hasImage ? "Bild" : "Nachricht";
}

function isSoloEmojiMessage(message) {
  if (message.image || !message.text) {
    return false;
  }

  const text = message.text.trim();
  if (!text || /\s/u.test(text)) {
    return false;
  }

  return graphemes(text).length === 1 && /\p{Extended_Pictographic}/u.test(text);
}

function graphemes(text) {
  if (window.Intl && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (segment) => segment.segment);
  }

  return Array.from(text);
}

function unlockNotificationSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  state.audioUnlocked = true;
}

function getAudioContext() {
  if (state.audioContext) {
    return state.audioContext;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  state.audioContext = new AudioContextClass();
  return state.audioContext;
}

function playNotificationSound() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    context.resume().then(() => playNotificationSound()).catch(() => {});
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(420, now);
  oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.09);
  oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.18);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.075, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.24);
}

function formatLastSeen(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (sameDay) {
    return `heute um ${time}`;
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return `gestern um ${time}`;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
