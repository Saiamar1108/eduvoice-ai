"""EduVoice AI backend: conversational tutor with Gemini + Murf Falcon TTS."""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests

app = Flask(__name__)
CORS(app)

MURF_API_KEY = os.environ.get("MURF_API_KEY", "")
MURF_API_URL = "https://api.murf.ai/v1/speech/generate"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

PERSONALITY_MAP = {
    "professor": {
        "voiceId": "en-US-natalie",
        "prompt": "You are a clear, academic professor tutor. Keep responses concise and structured.",
    },
    "friendly": {
        "voiceId": "en-US-terrell",
        "prompt": "You are a warm, friendly tutor for school students. Keep tone encouraging and simple.",
    },
    "assistant": {
        "voiceId": "en-US-ken",
        "prompt": "You are an efficient AI assistant tutor. Keep responses precise and student-friendly.",
    },
}
DEFAULT_PERSONALITY = "professor"


def gemini_generate_text(system_prompt: str, user_prompt: str) -> str:
    """Generate text from Gemini API and return plain text output."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured on the server.")

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}],
            }
        ]
    }

    response = requests.post(
        f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
        json=payload,
        timeout=35,
    )
    response.raise_for_status()
    data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        return ""

    parts = candidates[0].get("content", {}).get("parts", [])
    text_chunks = [part.get("text", "") for part in parts if part.get("text")]
    return "\n".join(text_chunks).strip()


def gemini_explanation_and_quiz(history, topic, personality_prompt):
    """Create explanation + quiz from conversation history."""
    compact_history = history[-12:] if history else []
    history_text = "\n".join([f"{item.get('role', 'user')}: {item.get('content', '')}" for item in compact_history])

    explanation_prompt = (
        f"Conversation history:\n{history_text}\n\n"
        f"Current student query: {topic}\n\n"
        f"Explain \"{topic}\" in simple terms for students in under 120 words."
    )
    explanation = gemini_generate_text(personality_prompt, explanation_prompt)

    quiz_prompt = (
        f"Based on this explanation:\n{explanation}\n\n"
        "Generate one simple quiz question about the explanation. "
        "Return ONLY valid JSON with keys: question,answer"
    )
    quiz_raw = gemini_generate_text(personality_prompt, quiz_prompt)

    quiz = {"question": "", "answer": ""}
    if quiz_raw:
        cleaned = quiz_raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            import json

            parsed = json.loads(cleaned)
            quiz["question"] = parsed.get("question", "").strip()
            quiz["answer"] = parsed.get("answer", "").strip()
        except Exception:
            # Safe fallback if model output is malformed.
            quiz["question"] = quiz_raw.strip()
            quiz["answer"] = "Please discuss with your tutor."

    return explanation.strip(), quiz


def murf_generate_audio(text: str, voice_id: str) -> str:
    """Generate Murf Falcon-style audio and return URL."""
    if not MURF_API_KEY:
        raise ValueError("MURF_API_KEY is not configured on the server.")

    headers = {"Content-Type": "application/json", "api-key": MURF_API_KEY}
    payload = {
        "voiceId": voice_id,
        "text": text,
        "audioFormat": "MP3",
        "style": "Conversational",
    }

    response = requests.post(MURF_API_URL, json=payload, headers=headers, timeout=35)
    response.raise_for_status()

    data = response.json()
    return data.get("audioFile") or data.get("audio_url") or data.get("url") or ""


@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "EduVoice AI backend is running ✅"})


@app.route("/tutor-chat", methods=["POST"])
def tutor_chat():
    body = request.get_json(silent=True) or {}
    message = body.get("message", "").strip()
    history = body.get("history", [])
    personality = body.get("personality", DEFAULT_PERSONALITY).strip().lower()

    if not message:
        return jsonify({"error": "Message is required."}), 400

    personality_cfg = PERSONALITY_MAP.get(personality, PERSONALITY_MAP[DEFAULT_PERSONALITY])

    try:
        explanation, quiz = gemini_explanation_and_quiz(history, message, personality_cfg["prompt"])
        if not explanation:
            return jsonify({"error": "Gemini returned an empty explanation."}), 502

        audio_url = murf_generate_audio(explanation, personality_cfg["voiceId"])
        if not audio_url:
            return jsonify({"error": "Murf did not return an audio URL."}), 502

        return jsonify(
            {
                "audioUrl": audio_url,
                "explanationText": explanation,
                "quiz": quiz,
                "voiceId": personality_cfg["voiceId"],
            }
        )

    except requests.HTTPError as exc:
        detail = exc.response.text if exc.response is not None else str(exc)
        return jsonify({"error": "Upstream API error.", "details": detail[:500]}), 502
    except requests.Timeout:
        return jsonify({"error": "Tutor service timed out. Please retry."}), 504
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # pylint: disable=broad-except
        return jsonify({"error": f"Internal server error: {exc}"}), 500


# Backward-compatible endpoint retained from initial version.
@app.route("/generate-voice", methods=["POST"])
def generate_voice_legacy():
    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()
    if not text:
        return jsonify({"error": "Text field is required"}), 400

    try:
        audio_url = murf_generate_audio(text, PERSONALITY_MAP[DEFAULT_PERSONALITY]["voiceId"])
        if not audio_url:
            return jsonify({"error": "Murf API did not return an audio URL"}), 502
        return jsonify({"audioUrl": audio_url, "voiceId": PERSONALITY_MAP[DEFAULT_PERSONALITY]["voiceId"]})
    except Exception as exc:  # pylint: disable=broad-except
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    print("EduVoice AI backend starting on http://localhost:5001")
    app.run(debug=True, host="0.0.0.0", port=5001)
