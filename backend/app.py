"""EduVoice AI backend: conversational tutor with Gemini + Murf TTS."""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)

CORS(
    app,
    resources={r"/*": {"origins": ["http://localhost:3000"]}},
    supports_credentials=False,
)


@app.after_request
def after_request(response):
    response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


MURF_API_KEY = os.environ.get("MURF_API_KEY", "")
MURF_API_URL = "https://api.murf.ai/v1/speech/generate"

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

print("GEMINI_API_KEY loaded:", bool(GEMINI_API_KEY))
print("MURF_API_KEY loaded:", bool(MURF_API_KEY))
print("GEMINI_MODEL:", GEMINI_MODEL)

PERSONALITY_MAP = {
    "professor": {
        "voiceId": "en-US-natalie",
        "prompt": (
            "You are a clear, academic professor tutor. "
            "Teach school students in a direct, simple, natural way."
        ),
    },
    "friendly": {
        "voiceId": "en-US-terrell",
        "prompt": (
            "You are a warm, friendly tutor for school students. "
            "Keep the tone encouraging, simple, and natural."
        ),
    },
    "assistant": {
        "voiceId": "en-US-ken",
        "prompt": (
            "You are an efficient AI assistant tutor. "
            "Give precise and student-friendly explanations."
        ),
    },
}
DEFAULT_PERSONALITY = "professor"


def gemini_generate_text(system_prompt: str, user_prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured.")

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"{system_prompt}\n\n{user_prompt}"
                    }
                ]
            }
        ]
    }

    response = requests.post(
        f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=35,
    )

    print("Gemini status:", response.status_code)
    print("Gemini response:", response.text[:500])

    response.raise_for_status()
    data = response.json()

    candidates = data.get("candidates", [])
    if not candidates:
        return ""

    parts = candidates[0].get("content", {}).get("parts", [])
    text_chunks = [part.get("text", "") for part in parts if part.get("text")]
    return "\n".join(text_chunks).strip()


def clean_topic(topic: str) -> str:
    topic = topic.strip()

    lower = topic.lower()

    prefixes = [
        "explain ",
        "what is ",
        "what are ",
        "tell me about ",
        "teach me about ",
        "can you explain ",
        "please explain ",
        "describe ",
    ]

    for prefix in prefixes:
        if lower.startswith(prefix):
            topic = topic[len(prefix):].strip()
            lower = topic.lower()
            break

    suffixes = [
        " in simple terms",
        " simply",
        " for me",
        " please",
    ]

    for suffix in suffixes:
        if lower.endswith(suffix):
            topic = topic[: -len(suffix)].strip()
            lower = topic.lower()

    return topic.strip(' "?.!')


def gemini_explanation_and_quiz(history, topic, personality_prompt):
    compact_history = history[-12:] if history else []
    history_text = "\n".join(
        [
            f"{item.get('role', 'user')}: {item.get('content', '')}"
            for item in compact_history
        ]
    )

    clean = clean_topic(topic)

    explanation_prompt = f"""
Conversation history:
{history_text}

Student topic: {clean}

Explain ONLY the concept/topic directly.

Rules:
- Max 90 words
- Use simple language for students
- Do NOT explain the meaning of the question itself
- Do NOT break down words from the sentence
- Do NOT say things like '"{topic}" means'
- No bullet points
- Just give a natural explanation like a good teacher

Answer:
"""
    explanation = gemini_generate_text(personality_prompt, explanation_prompt)

    quiz_prompt = f"""
Topic: {clean}

Explanation:
{explanation}

Create one very short quiz question and answer.

Return ONLY valid JSON like:
{{"question":"...","answer":"..."}}
"""
    quiz_raw = gemini_generate_text(personality_prompt, quiz_prompt)

    quiz = {"question": "", "answer": ""}

    if quiz_raw:
        cleaned = (
            quiz_raw.strip()
            .removeprefix("```json")
            .removeprefix("```")
            .removesuffix("```")
            .strip()
        )
        try:
            parsed = json.loads(cleaned)
            quiz["question"] = parsed.get("question", "").strip()
            quiz["answer"] = parsed.get("answer", "").strip()
        except Exception:
            quiz["question"] = "What is one key idea from this topic?"
            quiz["answer"] = clean

    return explanation.strip(), quiz


def murf_generate_audio(text: str, voice_id: str) -> str:
    if not MURF_API_KEY:
        raise ValueError("MURF_API_KEY is not configured on the server.")

    headers = {
        "Content-Type": "application/json",
        "api-key": MURF_API_KEY,
    }

    payload = {
        "voiceId": voice_id,
        "text": text,
        "audioFormat": "MP3",
    }

    response = requests.post(
        MURF_API_URL,
        json=payload,
        headers=headers,
        timeout=35,
    )

    print("Murf status:", response.status_code)
    print("Murf response:", response.text[:500])

    response.raise_for_status()
    data = response.json()

    return data.get("audioFile") or data.get("audio_url") or data.get("url") or ""


@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "EduVoice AI backend is running ✅"})


@app.route("/tutor-chat", methods=["POST", "OPTIONS"])
def tutor_chat():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200

    body = request.get_json(silent=True) or {}
    message = body.get("message", "").strip()
    history = body.get("history", [])
    personality = body.get("personality", DEFAULT_PERSONALITY).strip().lower()

    if not message:
        return jsonify({"error": "Message is required."}), 400

    personality_cfg = PERSONALITY_MAP.get(
        personality,
        PERSONALITY_MAP[DEFAULT_PERSONALITY],
    )

    try:
        explanation, quiz = gemini_explanation_and_quiz(
            history,
            message,
            personality_cfg["prompt"],
        )
        if not explanation:
            return jsonify({"error": "Gemini returned an empty explanation."}), 502
    except requests.HTTPError as exc:
        detail = exc.response.text if exc.response is not None else str(exc)
        return jsonify(
            {
                "error": "Gemini API error",
                "details": detail[:500],
            }
        ), 502
    except requests.Timeout:
        return jsonify({"error": "Gemini timed out. Please retry."}), 504
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": f"Internal server error: {exc}"}), 500

    try:
        audio_url = murf_generate_audio(explanation, personality_cfg["voiceId"])
    except requests.HTTPError as exc:
        detail = exc.response.text if exc.response is not None else str(exc)
        print("Murf failed:", detail[:500])
        audio_url = ""
    except requests.Timeout:
        print("Murf timed out")
        audio_url = ""
    except ValueError as exc:
        print("Murf config error:", str(exc))
        audio_url = ""

    return jsonify(
        {
            "audioUrl": audio_url,
            "explanationText": explanation,
            "quiz": quiz,
            "voiceId": personality_cfg["voiceId"],
        }
    )


@app.route("/generate-voice", methods=["POST"])
def generate_voice_legacy():
    body = request.get_json(silent=True) or {}
    text = body.get("text", "").strip()

    if not text:
        return jsonify({"error": "Text field is required"}), 400

    try:
        audio_url = murf_generate_audio(
            text,
            PERSONALITY_MAP[DEFAULT_PERSONALITY]["voiceId"],
        )
        if not audio_url:
            return jsonify({"error": "Murf API did not return an audio URL"}), 502

        return jsonify(
            {
                "audioUrl": audio_url,
                "voiceId": PERSONALITY_MAP[DEFAULT_PERSONALITY]["voiceId"],
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    print("EduVoice AI backend starting on http://localhost:5001")
    app.run(debug=True, host="0.0.0.0", port=5001)