"""Sign-in mail through the Resend HTTP API. Without RESEND_API_KEY the code only goes to the log (test mode)."""

import logging
import os

import httpx

log = logging.getLogger("wishfit.mail")

TEXTS = {
    "de": ("Dein Wishfit-Code: {code}", "Dein Anmelde-Code für Wishfit lautet {code}.\nEr ist 10 Minuten gültig. Wenn du ihn nicht angefordert hast, ignoriere diese Mail."),
    "en": ("Your Wishfit code: {code}", "Your Wishfit sign-in code is {code}.\nIt is valid for 10 minutes. If you did not request it, ignore this email."),
}

# Copy of the HTML part per language: (preheader, tag label, headline, lead, validity, ignore note)
COPY = {
    "de": ("Dein Code ist {code}. Er gilt 10 Minuten.", "Anmelde-Code", "Dein Code für Wishfit", "Gib diesen Code in der App ein, um dich anzumelden.", "Gültig für 10 Minuten.", "Du hast ihn nicht angefordert? Dann ignoriere diese Mail, es passiert nichts."),
    "en": ("Your code is {code}. It is valid for 10 minutes.", "Sign-in code", "Your code for Wishfit", "Enter this code in the app to sign in.", "Valid for 10 minutes.", "Didn't request it? Ignore this email, nothing happens."),
}

# Gift-tag look of the app (docs/design/gift-tags.md): tomato tag, 2px ink border, hole on top. Table layout with inline
# styles for Gmail/Outlook/Apple Mail; the style block only adds the webfonts and the dark mode where a client allows it.
HTML = """<!DOCTYPE html>
<html lang="{lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{headline}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=DM+Mono:wght@500&family=Instrument+Sans:wght@400;600&display=swap');
:root {{ color-scheme: light dark; supported-color-schemes: light dark; }}
@media (prefers-color-scheme: dark) {{
  .bg {{ background-color: #0b0b0c !important; }}
  .hole {{ background-color: #0b0b0c !important; }}
  .mute {{ color: #a9a9b1 !important; }}
  .brand {{ color: #ffffff !important; }}
}}
@media only screen and (max-width: 480px) {{
  .code {{ font-size: 40px !important; letter-spacing: 6px !important; }}
}}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff;">{preheader}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
<tr><td align="center" style="padding:28px 16px 36px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;">
    <tr><td class="brand" style="padding:0 6px 18px 6px;font-family:'Bricolage Grotesque','Arial Black',Arial,Helvetica,sans-serif;font-weight:800;font-size:26px;letter-spacing:-1px;color:#0b0b0c;">Wishfit</td></tr>
    <tr><td style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ff5a3c" style="background-color:#ff5a3c;border:2px solid #0b0b0c;border-radius:28px;">
        <tr><td align="center" style="padding:16px 0 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="hole" width="16" height="16" bgcolor="#ffffff" style="width:16px;height:16px;line-height:16px;font-size:1px;background-color:#ffffff;border:2px solid #0b0b0c;border-radius:10px;">&nbsp;</td></tr></table>
        </td></tr>
        <tr><td align="center" style="padding:22px 24px 4px 24px;font-family:'DM Mono',Menlo,Consolas,'Courier New',monospace;font-weight:500;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#0b0b0c;">{label}</td></tr>
        <tr><td align="center" style="padding:6px 24px 0 24px;font-family:'Bricolage Grotesque','Arial Black',Arial,Helvetica,sans-serif;font-weight:800;font-size:26px;line-height:30px;letter-spacing:-1px;color:#0b0b0c;">{headline}</td></tr>
        <tr><td align="center" style="padding:18px 20px 0 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;border:2px solid #0b0b0c;border-radius:18px;"><tr>
            <td class="code" align="center" style="padding:14px 22px;font-family:'DM Mono',Menlo,Consolas,'Courier New',monospace;font-weight:500;font-size:44px;line-height:48px;letter-spacing:8px;color:#0b0b0c;background-color:#ffffff;border-radius:16px;">{code}</td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:18px 28px 0 28px;font-family:'Instrument Sans',Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;color:#0b0b0c;">{lead}</td></tr>
        <tr><td align="center" style="padding:6px 28px 28px 28px;font-family:'DM Mono',Menlo,Consolas,'Courier New',monospace;font-size:12px;letter-spacing:1px;color:#0b0b0c;">{validity}</td></tr>
      </table>
    </td></tr>
    <tr><td class="mute" align="center" style="padding:20px 24px 0 24px;font-family:'Instrument Sans',Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#5f5f66;">{ignore}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""


def render_html(code: str, language: str = "de") -> str:
    lang = language if language in COPY else "de"
    preheader, label, headline, lead, validity, ignore = COPY[lang]
    return HTML.format(lang=lang, code=code, preheader=preheader.format(code=code), label=label, headline=headline, lead=lead, validity=validity, ignore=ignore)


def configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY"))


def send_code(email: str, code: str, language: str = "de") -> None:
    """Send the code. Raises RuntimeError when Resend refuses; in test mode logs the code instead."""
    if not configured():
        log.warning("auth test mode, no RESEND_API_KEY: code for %s is %s", email, code)
        return
    language = language if language in TEXTS else "de"
    subject, text = TEXTS[language]
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
            json={
                "from": os.environ.get("MAIL_FROM") or "Wishfit <login@bemany.tech>",
                "to": [email],
                "subject": subject.format(code=code),
                "text": text.format(code=code),
                "html": render_html(code, language),
            },
            timeout=10,
        )
    except httpx.HTTPError as e:
        raise RuntimeError(f"resend unreachable: {e.__class__.__name__}") from e
    if r.status_code >= 300:
        raise RuntimeError(f"resend returned {r.status_code}")
