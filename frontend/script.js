/**
 * EduVoice AI — Frontend Script
 * Handles user input, calls the Flask backend, and plays back audio.
 */

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = "http://localhost:5001";


// ── DOM References ────────────────────────────────────────────────────────────
const topicInput   = document.getElementById("topic-input");
const langSelect   = document.getElementById("lang-select");
const generateBtn  = document.getElementById("generate-btn");
const spinner      = document.getElementById("spinner");
const btnText      = generateBtn.querySelector(".btn-text");
const btnIcon      = generateBtn.querySelector(".btn-icon");
const statusMsg    = document.getElementById("status-msg");
const audioSection = document.getElementById("audio-section");
const audioPlayer  = document.getElementById("audio-player");
const charCount    = document.getElementById("char-count");
const translatedBox  = document.getElementById("translated-box");
const translatedText = document.getElementById("translated-text");


// ── Character Counter ─────────────────────────────────────────────────────────
topicInput.addEventListener("input", () => {
  const count = topicInput.value.length;
  charCount.textContent = count;

  charCount.style.color = count > 2700
    ? "var(--danger)"
    : count > 2000
      ? "var(--accent)"
      : "var(--muted)";
});


// ── Main: Generate Voice ──────────────────────────────────────────────────────
async function generateVoice() {
  const text     = topicInput.value.trim();
  const language = langSelect.value;

  if (!text) {
    showStatus("⚠️ Please enter a topic or educational text first.", "error");
    topicInput.focus();
    return;
  }

  if (text.length < 10) {
    showStatus("⚠️ Please enter at least 10 characters.", "error");
    return;
  }

  setLoading(true);
  hideStatus();
  hideAudio();

  try {
    // Show different message based on language
    const langNames = { en: "English", hi: "Hindi", te: "Telugu" };
    const langLabel = langNames[language] || language;

    if (language !== "en") {
      showStatus(`🌐 Translating to ${langLabel} and generating voice…`, "info");
    } else {
      showStatus("🤖 Contacting Murf AI — generating your voice explanation…", "info");
    }

    const response = await fetch(`${BACKEND_URL}/generate-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Server error: ${response.status}`);
    }

    if (!data.audioUrl) {
      throw new Error("Backend did not return an audio URL.");
    }

    // ── Show translated text box if not English ──────────────────────────
    if (data.translatedText && language !== "en") {
      translatedText.textContent = data.translatedText;
      translatedBox.hidden = false;
    } else {
      translatedBox.hidden = true;
    }

    audioPlayer.src = data.audioUrl;
    audioPlayer.load();

    hideStatus();
    showAudio();

    audioPlayer.play().catch(() => {});

  } catch (error) {
    console.error("EduVoice Error:", error);
    showStatus(`❌ ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}


// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(isLoading) {
  generateBtn.disabled  = isLoading;
  spinner.hidden        = !isLoading;
  btnText.textContent   = isLoading ? "Generating…" : "Generate Voice";
  btnIcon.textContent   = isLoading ? "" : "🎙️";
}

function showStatus(message, type = "info") {
  statusMsg.textContent = message;
  statusMsg.className   = `status-msg ${type}`;
  statusMsg.hidden      = false;
}

function hideStatus() {
  statusMsg.hidden = true;
}

function showAudio() {
  audioSection.hidden = false;
}

function hideAudio() {
  audioSection.hidden = true;
  audioPlayer.src     = "";
  translatedBox.hidden = true;
}

// ── Enter key to generate ─────────────────────────────────────────────────────
topicInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    generateVoice();
  }
});