#!/usr/bin/env python3
"""
Pre-generates all 40 ElevenLabs voiceover MP3 segments into /opt/argon/audio/
using ELEVENLABS_API_KEY from environment or /opt/argon/.env.
"""
import json
import os
import re
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")


def load_api_key():
    env_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if env_key:
        return env_key
    dotenv_path = os.path.join(BASE_DIR, ".env")
    if os.path.exists(dotenv_path):
        with open(dotenv_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("ELEVENLABS_API_KEY="):
                    return line.split("=", 1)[1].strip()
    return ""


API_KEY = load_api_key()
VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "nPczCjzI2devNBz1zQrb")


def parse_segments_from_narration_js():
    narration_path = os.path.join(BASE_DIR, "narration.js")
    with open(narration_path, "r", encoding="utf-8") as f:
        content = f.read()

    scene_blocks = re.split(r"\bid:\s*(\d+)\s*,", content)[1:]
    segments = []
    for i in range(0, len(scene_blocks), 2):
        scene_id = int(scene_blocks[i])
        body = scene_blocks[i + 1]
        texts = re.findall(r'text:\s*"([^"]+)"', body)
        for s_idx, text in enumerate(texts):
            filename = f"seg-0{scene_id}-0{s_idx + 1}.mp3"
            segments.append((scene_id, s_idx + 1, filename, text))
    return segments


def synthesize_all(quiet=False):
    os.makedirs(AUDIO_DIR, exist_ok=True)
    segments = parse_segments_from_narration_js()
    if not API_KEY:
        return
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128"

    for scene_id, step_num, filename, text in segments:
        out_path = os.path.join(AUDIO_DIR, filename)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
            continue

        if not quiet:
            print(f"[ElevenLabs] Generating {filename}: {text[:55]}...")

        payload = json.dumps(
            {
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.58,
                    "similarity_boost": 0.80,
                    "style": 0.15,
                    "use_speaker_boost": True,
                },
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "xi-api-key": API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
                "User-Agent": "CephVisualized/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                audio_bytes = resp.read()
                if len(audio_bytes) > 1000:
                    with open(out_path, "wb") as out_f:
                        out_f.write(audio_bytes)
        except Exception as e:
            if not quiet:
                print(f"[ElevenLabs] Warning on {filename}: {e}")
            break


if __name__ == "__main__":
    synthesize_all(quiet=False)
    print("[ElevenLabs] Done! Audio files stored in /opt/argon/audio/")
