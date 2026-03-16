/**
 * EduVoice AI — Conversational Voice Tutor Frontend
 * Features: chat UI, voice input, conversational memory, topic suggestions.
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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

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
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      showStatus("⚠️ Microphone permission denied. Please allow access and retry.", "error");
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

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  spinner.hidden = !isLoading;
  btnText.textContent = isLoading ? "Thinking..." : "Ask Tutor";
}

function showStatus(message, type = "info") {
  statusMsg.textContent = message;
  statusMsg.className = `status-msg ${type}`;
  statusMsg.hidden = false;
}

function hideStatus() {
  statusMsg.hidden = true;
}

function addMessage(role, text, quiz, audioUrl) {
  const bubble = document.createElement("article");
  bubble.className = `message ${role}`;

  const p = document.createElement("p");
  p.className = "message-text";
  p.textContent = text;
  bubble.appendChild(p);

  if (quiz) {
    const quizCard = document.createElement("div");
    quizCard.className = "quiz-card";
    quizCard.innerHTML = `<strong>Quiz:</strong> ${quiz.question}<br><strong>Answer:</strong> ${quiz.answer}`;
    bubble.appendChild(quizCard);
  }

  if (audioUrl) {
    const audio = document.createElement("audio");
    audio.className = "audio-player";
    audio.controls = true;
    audio.src = audioUrl;
    bubble.appendChild(audio);
    audio.play().catch(() => {});
  }

  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendUserQuery(rawInput) {
  const message = rawInput.trim();

  if (!message) {
    showStatus("⚠️ Please enter a question first.", "error");
    return;
  }

  addMessage("user", message);
  hideStatus();
  setLoading(true);
  chatInput.value = "";
  updateCharCount();

  conversationHistory.push({ role: "user", content: message });

  try {
    const response = await fetch(`${BACKEND_URL}/tutor-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        personality: personalitySelect.value,
        history: conversationHistory,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Server error ${response.status}`);
    }

    if (!data.explanationText) {
      throw new Error("Tutor returned an empty explanation.");
    }

    addMessage("assistant", data.explanationText, data.quiz, data.audioUrl);
    conversationHistory.push({ role: "assistant", content: data.explanationText });

    // Prevent unbounded payload growth for demos.
    if (conversationHistory.length > 16) {
      conversationHistory.splice(0, conversationHistory.length - 16);
    }
  } catch (error) {
    showStatus(`❌ ${error.message}`, "error");
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

sendBtn.addEventListener("click", () => sendUserQuery(chatInput.value));

micBtn.addEventListener("click", () => {
  if (!recognition) {
    showStatus("⚠️ Voice recognition is unavailable.", "error");
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  recognition.start();
});

suggestions.addEventListener("click", (event) => {
  const chip = event.target.closest(".suggestion-chip");
  if (!chip) {
    return;
  }

  const topic = chip.dataset.topic || chip.textContent.trim();
  sendUserQuery(`Explain ${topic} in simple terms.`);
});

initSpeechRecognition();
updateCharCount();
addMessage(
  "assistant",
  "Hi! I am your voice tutor. Ask any topic, use the mic, or tap a suggestion to begin."
);
