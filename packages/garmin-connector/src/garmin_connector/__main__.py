from __future__ import annotations

import json
import os
import sys
import time
from contextlib import suppress
from pathlib import Path
from typing import Any

TOKEN_DIR = Path(os.environ.get("GARMIN_CONNECTOR_STATE", "~/.running-lab/garmin")).expanduser()
TOKEN_FILE = TOKEN_DIR / "garmin_tokens.json"
MFA_TTL_SECONDS = 300
_pending: dict[str, Any] = {}


def save_state(data: dict[str, Any]) -> None:
    TOKEN_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    TOKEN_DIR.chmod(0o700)
    temp = TOKEN_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    temp.replace(TOKEN_FILE)
    TOKEN_FILE.chmod(0o600)


def load_state() -> dict[str, Any]:
    try:
        return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def load_tokens(client: Any) -> bool:
    try:
        client.client.load(str(TOKEN_DIR))
        return True
    except Exception:
        return False


def dump_tokens(client: Any) -> None:
    client.client.dump(str(TOKEN_DIR))


def account_state() -> dict[str, Any]:
    state = load_state()
    return {
        "email": state.get("email"),
        "last_auth_at": state.get("last_auth_at"),
    }


def build_client(email: str | None = None, password: str | None = None):
    try:
        from garminconnect import Garmin
    except ImportError as exc:
        raise RuntimeError(
            "Garmin connector dependencies are missing. Run: "
            "python3 -m pip install -e packages/garmin-connector"
        ) from exc
    return Garmin(email=email, password=password)


def client_from_state():
    client = build_client()
    return client if load_tokens(client) else None


def status() -> dict[str, Any]:
    state = account_state()
    return {
        "ok": True,
        "status": "mfa_required" if _pending else ("connected" if TOKEN_FILE.exists() else "disconnected"),
        "accountLabel": state.get("email"),
        "tokenStore": str(TOKEN_FILE),
        "lastAuthAt": state.get("last_auth_at"),
        "message": None,
    }


def login_start(request: dict[str, Any]) -> dict[str, Any]:
    email = str(request.get("email", "")).strip()
    password = str(request.get("password", ""))
    if not email or not password:
        return {"ok": False, "error": "Email and password are required."}
    client = build_client(email, password)
    try:
        mfa_status, _ = client.login(tokenstore=str(TOKEN_DIR))
        if mfa_status == "needs_mfa":
            challenge_id = f"mfa-{int(time.time())}"
            _pending.clear()
            _pending.update({"id": challenge_id, "client": client, "email": email, "expires_at": time.time() + MFA_TTL_SECONDS})
            return {"ok": True, "status": "mfa_required", "challengeId": challenge_id, "expiresInSeconds": MFA_TTL_SECONDS}
        dump_tokens(client)
    except Exception as exc:  # upstream errors must not include credentials
        return {"ok": False, "error": f"Garmin login failed: {type(exc).__name__}"}
    save_state({
        "email": email,
        "last_auth_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    return {"ok": True, "status": "connected", "accountLabel": email}


def login_resume(request: dict[str, Any]) -> dict[str, Any]:
    challenge_id = str(request.get("challengeId", ""))
    code = str(request.get("code", ""))
    if not challenge_id or not code:
        return {"ok": False, "error": "Challenge ID and MFA code are required."}
    if not _pending or _pending.get("id") != challenge_id:
        return {"ok": False, "error": "MFA challenge not found or expired."}
    if time.time() > float(_pending["expires_at"]):
        _pending.clear()
        return {"ok": False, "error": "MFA challenge expired. Start login again."}
    client = _pending["client"]
    try:
        mfa_status, _ = client.resume_login({}, code)
        if mfa_status == "needs_mfa":
            return {"ok": False, "error": "MFA code was not accepted."}
        dump_tokens(client)
    except Exception as exc:
        return {"ok": False, "error": f"MFA verification failed: {type(exc).__name__}"}
    email = _pending.get("email")
    _pending.clear()
    save_state({"email": email, "last_auth_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    return {"ok": True, "status": "connected", "accountLabel": email}


def sync(request: dict[str, Any]) -> dict[str, Any]:
    client = client_from_state()
    if client is None:
        return {"ok": False, "error": "Garmin is not connected. Connect it in the Training Lab UI first."}
    days = max(1, min(int(request.get("days", 7)), 31))
    from datetime import date, timedelta

    end = date.today()
    start = end - timedelta(days=days - 1)
    try:
        activities = client.get_activities_by_date(start.isoformat(), end.isoformat()) or []
    except Exception as exc:
        return {"ok": False, "error": f"Garmin sync failed: {type(exc).__name__}"}
    normalized = []
    for activity in activities:
        normalized.append({
            "activity_id": str(activity.get("activityId")),
            "date": activity.get("startTimeGMT") or activity.get("startTimeLocal"),
            "sport": activity.get("activityType", {}).get("typeKey", "other"),
            "duration_min": float(activity.get("duration", 0)) / 60,
            "distance_km": float(activity.get("distance", 0)) / 1000,
            "elevation_gain_m": activity.get("elevationGain"),
            "avg_hr": activity.get("averageHR"),
            "max_hr": activity.get("maxHR"),
            "calories": activity.get("calories"),
            "source": "garmin_connect",
        })
    return {"ok": True, "status": "connected", "activities": normalized}


def handle(request: dict[str, Any]) -> dict[str, Any]:
    action = request.get("action")
    if action == "status":
        return status()
    if action == "login_start":
        return login_start(request)
    if action == "login_resume":
        return login_resume(request)
    if action == "sync":
        return sync(request)
    if action == "logout":
        _pending.clear()
        client = client_from_state()
        if client is not None:
            with suppress(Exception):
                client.logout(str(TOKEN_DIR))
        TOKEN_FILE.unlink(missing_ok=True)
        return {"ok": True, "status": "disconnected"}
    if action == "health":
        return {"ok": True, "status": "ready"}
    return {"ok": False, "error": f"Unsupported connector action: {action}"}


def main() -> None:
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = handle(request)
        except Exception as exc:
            response = {"ok": False, "error": str(exc)}
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
