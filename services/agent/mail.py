"""Sign-in mail through the Resend HTTP API. Without RESEND_API_KEY the code only goes to the log (test mode)."""

import logging
import os

import httpx

log = logging.getLogger("wishfit.mail")

TEXTS = {
    "de": ("Dein Wishfit-Code: {code}", "Dein Anmelde-Code für Wishfit lautet {code}.\nEr ist 10 Minuten gültig. Wenn du ihn nicht angefordert hast, ignoriere diese Mail."),
    "en": ("Your Wishfit code: {code}", "Your Wishfit sign-in code is {code}.\nIt is valid for 10 minutes. If you did not request it, ignore this email."),
}


def configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def send_code(email: str, code: str, language: str = "de") -> None:
    """Send the code. Raises RuntimeError when Resend refuses; in test mode logs the code instead."""
    if not configured():
        log.warning("auth test mode, no RESEND_API_KEY: code for %s is %s", email, code)
        return
    subject, text = TEXTS.get(language, TEXTS["de"])
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
            json={
                "from": os.environ.get("MAIL_FROM") or "Wishfit <login@bemany.tech>",
                "to": [email],
                "subject": subject.format(code=code),
                "text": text.format(code=code),
            },
            timeout=10,
        )
    except httpx.HTTPError as e:
        raise RuntimeError(f"resend unreachable: {e.__class__.__name__}") from e
    if r.status_code >= 300:
        raise RuntimeError(f"resend returned {r.status_code}")
