"""
EduVoice AI - Backend Server
Flask API that integrates with Murf AI Text-to-Speech API
to generate multilingual voice explanations for educational content.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)

# ─── Murf AI Configuration ────────────────────────────────────────────────────
MURF_API_KEY = os.environ.get("MURF_API_KEY", "YOUR_MURF_API_KEY_HERE")
MURF_API_URL = "https://api.murf.ai/v1/speech/generate"

# ─── Voice ID Mapping ─────────────────────────────────────────────────────────
VOICE_MAP = {
   "en": "en-US-natalie",
    "hi": "Aman",
    "te": "Ronnie",
}

DEFAULT_VOICE = "Natalie"


# ─── Translation ──────────────────────────────────────────────────────────────
def translate_text(text, target_lang):
    if target_lang == "en":
        return text
    try:
        url = "https://api.mymemory.translated.net/get"
        params = {
            "q": text,
            "langpair": f"en|{target_lang}",
        }
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        result = response.json()
        translated = result.get("responseData", {}).get("translatedText", "")
        if translated and translated.lower() != "invalid language pair":
            return translated
        else:
            return text
    except Exception as e:
        print(f"Translation error: {e}")
        return text


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "EduVoice AI backend is running ✅"})


# ─── Generate Voice ───────────────────────────────────────────────────────────
@app.route("/generate-voice", methods=["POST"])
def generate_voice():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body is required"}), 400

    text = data.get("text", "").strip()
    language = data.get("language", "en").strip()

    if not text:
        return jsonify({"error": "Text field is required"}), 400

    if len(text) > 3000:
        return jsonify({"error": "Text too long. Please limit to 3000 characters."}), 400

    # Step 1: Translate
    translated_text = translate_text(text, language)
    print(f"Original: {text[:80]}...")
    print(f"Translated ({language}): {translated_text[:80]}...")

    # Step 2: Select voice
    voice_id = VOICE_MAP.get(language, DEFAULT_VOICE)

    # Step 3: Call Murf AI
    headers = {
        "Content-Type": "application/json",
        "api-key": MURF_API_KEY,
    }

    payload = {
       "voiceId": voice_id,
    "text": translated_text,
    "audioFormat": "MP3",
    "style": "Conversational",
    }

    try:
        response = requests.post(MURF_API_URL, json=payload, headers=headers, timeout=30)
        print(f"Murf Response: {response.status_code}")
        print(f"Murf Body: {response.text[:300]}")
        response.raise_for_status()

        result = response.json()
        audio_url = result.get("audioFile") or result.get("audio_url") or result.get("url")

        if not audio_url:
            return jsonify({"error": "Murf API did not return an audio URL", "raw": result}), 500

        return jsonify({
            "audioUrl": audio_url,
            "voiceId": voice_id,
            "language": language,
            "originalText": text,
            "translatedText": translated_text,
        })

    except requests.exceptions.Timeout:
        return jsonify({"error": "Murf API request timed out. Please try again."}), 504

    except requests.exceptions.HTTPError as e:
        error_body = {}
        try:
            error_body = e.response.json()
        except Exception:
            pass
        print(f"❌ Murf Error Body: {error_body}")
        print(f"❌ Murf Response Text: {e.response.text}")
        return jsonify({"error": f"Murf API error: {e}", "details": error_body}), e.response.status_code

    except Exception as e:
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


if __name__ == "__main__":
    print("🎙️  EduVoice AI backend starting on http://localhost:5000")
    app.run(debug=True, host="0.0.0.0", port=5001)