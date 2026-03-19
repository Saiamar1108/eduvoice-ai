/**
 * EduVoice AI — Conversational Voice Tutor Frontend
 * Improved UX version:
 * - voice input
 * - animated typing indicator
 * - smooth auto-scroll
 * - better formatting
 * - follow-up action buttons
 * - professional audio card
 * - conversation memory
 * - duplicate send protection
 * - premium welcome state
 */

const BACKEND_URL = "http://localhost:5001";

const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const spinner = document.getElementById("spinner");
const btnText = sendBtn.querySelector(".btn-text");
const statusMsg = document.getElementById("status-msg");
const chatContainer = document.getElementById("chat-container");
const charCount = document.getElementById("char-count");
const personalitySelect = document.getElementById("personality-select");
const suggestions = document.getElementById("topic-suggestions");

const conversationHistory = [];
let recognition = null;
let isListening = false;
let isLoading = false;
let lastTopic = "";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function scrollChatToBottom(smooth = true) {
  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

function getCurrentTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatMessageText(text) {
  return escapeHtml(text)
    .replace(/\n{2,}/g, "\n\n")
    .replace(/\n/g, "<br><br>");
}

function cleanTopicText(topic) {
  return topic
    .replace(/^Explain\s+/i, "")
    .replace(/^Tell me about\s+/i, "")
    .replace(/^What is\s+/i, "")
    .replace(/^What are\s+/i, "")
    .replace(/^Give me a real-life example of\s+/i, "")
    .replace(/^Ask me one quiz question about\s+/i, "")
    .replace(/\sin simple terms\.?$/i, "")
    .replace(/\sin an even simpler way for a beginner\.?$/i, "")
    .replace(/\.$/, "")
    .trim();
}

function initSpeechRecognition() {
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    showStatus("⚠️ Voice input is not supported in this browser.", "error");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("listening");
    showStatus("🎙️ Listening... speak your question.", "info");
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();

    if (!transcript) {
      showStatus("⚠️ I couldn't hear anything clearly. Please try again.", "error");
      return;
    }

    chatInput.value = transcript;
    updateCharCount();
    sendUserQuery(transcript);
  };

  recognition.onerror = (event) => {
    if (
      event.error === "not-allowed" ||
      event.error === "service-not-allowed"
    ) {
      showStatus(
        "⚠️ Microphone permission denied. Please allow microphone access and retry.",
        "error"
      );
      return;
    }

    showStatus(`⚠️ Microphone error: ${event.error}. Please retry.`, "error");
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("listening");
  };
}

function updateCharCount() {
  const count = chatInput.value.length;
  charCount.textContent = `${count} / 500`;
}

function setLoading(loading) {
  isLoading = loading;
  sendBtn.disabled = loading;
  micBtn.disabled = loading;
  spinner.hidden = !loading;
  btnText.textContent = loading ? "Thinking..." : "Ask Tutor";
}

function showStatus(message, type = "info") {
  statusMsg.textContent = message;
  statusMsg.className = `status-msg ${type}`;
  statusMsg.hidden = false;
}

function hideStatus() {
  statusMsg.hidden = true;
}

function showTypingIndicator() {
  hideTypingIndicator();

  const typing = document.createElement("article");
  typing.className = "message assistant typing-indicator";
  typing.id = "typing-indicator";
  typing.innerHTML = `
    <div class="typing-dots" aria-label="Tutor is typing">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;

  chatContainer.appendChild(typing);
  scrollChatToBottom();
}

function hideTypingIndicator() {
  const typing = document.getElementById("typing-indicator");
  if (typing) typing.remove();
}

function createTimeElement() {
  const time = document.createElement("div");
  time.className = "msg-time";
  time.textContent = getCurrentTime();
  return time;
}

function createAudioCard(audioUrl, personality = "Tutor Voice") {
  const wrapper = document.createElement("div");
  wrapper.className = "audio-card";

  const top = document.createElement("div");
  top.className = "audio-card-top";

  const badge = document.createElement("div");
  badge.className = "audio-badge";
  badge.textContent = "🔊 Voice Reply";

  const hint = document.createElement("div");
  hint.className = "audio-hint";
  hint.textContent = personality;

  top.appendChild(badge);
  top.appendChild(hint);

  const audio = document.createElement("audio");
  audio.className = "audio-player";
  audio.controls = true;
  audio.preload = "metadata";
  audio.src = audioUrl;
  audio.addEventListener("play", () => {
  micBtn.classList.add("speaking");
});

audio.addEventListener("pause", () => {
  micBtn.classList.remove("speaking");
});

audio.addEventListener("ended", () => {
  micBtn.classList.remove("speaking");
});

  wrapper.appendChild(top);
  wrapper.appendChild(audio);

  audio.play().catch(() => {});

  return wrapper;
}

function createActionButtons(topic) {
  const cleanTopic = cleanTopicText(topic);
  const actions = document.createElement("div");
  actions.className = "actions";

  const simplifyBtn = document.createElement("button");
  simplifyBtn.className = "action-btn";
  simplifyBtn.type = "button";
  simplifyBtn.textContent = "Simplify";
  simplifyBtn.addEventListener("click", () => {
    sendUserQuery(`Explain ${cleanTopic} in an even simpler way for a beginner.`);
  });

  const exampleBtn = document.createElement("button");
  exampleBtn.className = "action-btn";
  exampleBtn.type = "button";
  exampleBtn.textContent = "Real-life example";
  exampleBtn.addEventListener("click", () => {
    sendUserQuery(`Give me a real-life example of ${cleanTopic}.`);
  });

  const quizBtn = document.createElement("button");
  quizBtn.className = "action-btn";
  quizBtn.type = "button";
  quizBtn.textContent = "Quiz me";
  quizBtn.addEventListener("click", () => {
    sendUserQuery(`Ask me one quiz question about ${cleanTopic}.`);
  });

  actions.appendChild(simplifyBtn);
  actions.appendChild(exampleBtn);
  actions.appendChild(quizBtn);

  return actions;
}

function typeHtml(element, html, speed = 4) {
  return new Promise((resolve) => {
    let i = 0;
    let buffer = "";
    let insideTag = false;

    element.innerHTML = "";

    function step() {
      if (i >= html.length) {
        if (buffer) {
          element.innerHTML += buffer;
        }
        resolve();
        return;
      }

      const char = html[i];

      if (char === "<") {
        insideTag = true;
      }

      buffer += char;

      if (char === ">") {
        insideTag = false;
        element.innerHTML += buffer;
        buffer = "";
      } else if (!insideTag) {
        element.innerHTML += buffer;
        buffer = "";
      }

      i += 1;
      scrollChatToBottom(false);
      setTimeout(step, insideTag ? 0 : speed);
    }

    step();
  });
}

function showWelcomeState() {
  const existing = document.querySelector(".chat-empty");
  if (existing) existing.remove();

  const welcome = document.createElement("div");
  welcome.className = "chat-empty";

  welcome.innerHTML = `
    <div class="empty-wrapper">
      <div class="empty-icon-glow">
        <div class="empty-icon">🤖</div>
        <span class="pulse-ring"></span>
      </div>

      <h3 class="empty-title">Your AI Tutor is Ready</h3>
      <p class="empty-subtitle">
        Ask anything, use voice input, or pick a topic above to begin learning.
      </p>

      <div class="empty-suggestions">
        <button class="empty-chip" type="button">Artificial Intelligence</button>
        <button class="empty-chip" type="button">Black Holes</button>
        <button class="empty-chip" type="button">Climate Change</button>
      </div>
    </div>
  `;

  chatContainer.appendChild(welcome);

  welcome.querySelectorAll(".empty-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      sendUserQuery(`Explain ${chip.textContent} in simple terms.`);
    });
  });
}

async function addMessage(
  role,
  text,
  quiz = null,
  audioUrl = "",
  options = {}
) {
  const emptyState = document.querySelector(".chat-empty");
  if (emptyState) emptyState.remove();

  const bubble = document.createElement("article");
  bubble.className = `message ${role}`;

  const p = document.createElement("p");
  p.className = "message-text";
  bubble.appendChild(p);

  chatContainer.appendChild(bubble);
  scrollChatToBottom();

  if (role === "assistant" && options.typewriter) {
    await typeHtml(p, formatMessageText(text), 3);
  } else {
    p.innerHTML = formatMessageText(text);
  }

  if (quiz && (quiz.question || quiz.answer)) {
    const quizCard = document.createElement("div");
    quizCard.className = "quiz-card";
    quizCard.innerHTML = `
      <strong>Quiz:</strong> ${escapeHtml(quiz.question || "-")}<br>
      <strong>Answer:</strong> ${escapeHtml(quiz.answer || "-")}
    `;
    bubble.appendChild(quizCard);
  }

  if (audioUrl) {
    const selectedVoice =
      personalitySelect.selectedOptions[0]?.textContent || "Tutor";
    bubble.appendChild(createAudioCard(audioUrl, `${selectedVoice} Voice`));
  }

  bubble.appendChild(createTimeElement());

  if (role === "assistant" && options.showActions && options.topic) {
    bubble.appendChild(createActionButtons(options.topic));
  }

  scrollChatToBottom();
}

async function sendUserQuery(rawInput) {
  const message = rawInput.trim();

  if (!message) {
    showStatus("⚠️ Please enter a question first.", "error");
    return;
  }

  if (isLoading) return;

  lastTopic = cleanTopicText(message);

  await addMessage("user", message);
  hideStatus();
  showTypingIndicator();
  setLoading(true);

  chatInput.value = "";
  updateCharCount();

  conversationHistory.push({
    role: "user",
    content: message,
  });

  try {
    const response = await fetch(`${BACKEND_URL}/tutor-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        personality: personalitySelect.value,
        history: conversationHistory,
      }),
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      throw new Error(`Invalid server response (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(
        data.details || data.error || `Server error ${response.status}`
      );
    }

    if (!data.explanationText) {
      throw new Error("Tutor returned an empty explanation.");
    }

    hideTypingIndicator();

    await addMessage(
      "assistant",
      data.explanationText,
      data.quiz || null,
      data.audioUrl || "",
      {
        typewriter: true,
        showActions: true,
        topic: lastTopic,
      }
    );

    conversationHistory.push({
      role: "assistant",
      content: data.explanationText,
    });

    if (conversationHistory.length > 16) {
      conversationHistory.splice(0, conversationHistory.length - 16);
    }

    if (!data.audioUrl) {
      showStatus(
        "✅ Answer generated. Audio unavailable, but text response works.",
        "info"
      );
    }
  } catch (error) {
    console.error("Fetch error:", error);
    hideTypingIndicator();

    let cleanMessage = "Something went wrong. Please try again.";

    if (error.message.includes("quota") || error.message.includes("429")) {
      cleanMessage =
        "⚠️ Tutor is busy right now. Please try again in a few minutes.";
    } else if (error.message.includes("Microphone")) {
      cleanMessage = error.message;
    }

    await addMessage("assistant", cleanMessage, null, "", {
      typewriter: true,
    });
  } finally {
    setLoading(false);
  }
}

chatInput.addEventListener("input", updateCharCount);

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendUserQuery(chatInput.value);
  }
});

sendBtn.addEventListener("click", () => {
  sendUserQuery(chatInput.value);
});

micBtn.addEventListener("click", () => {
  if (!recognition) {
    showStatus("⚠️ Voice recognition is unavailable.", "error");
    return;
  }

  if (isLoading) return;

  if (isListening) {
    recognition.stop();
    return;
  }

  recognition.start();
});

suggestions.addEventListener("click", (event) => {
  const chip = event.target.closest(".suggestion-chip");
  if (!chip) return;

  const topic =
    chip.dataset.topic ||
    chip.querySelector(".chip-title")?.textContent?.trim() ||
    chip.textContent.trim();

  sendUserQuery(`Explain ${topic} in simple terms.`);
});

initSpeechRecognition();
updateCharCount();
showWelcomeState();
chatContainer.addEventListener("click", (e) => {
  const chip = e.target.closest(".empty-chip");
  if (!chip) return;

  const topic = chip.dataset.topic;
  sendUserQuery(`Explain ${topic} in simple terms.`);
});