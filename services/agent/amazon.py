"""Fetch a public Amazon wishlist. Request and selectors follow
https://github.com/christian-draeger/amazon-wishlist-webservice (WishListFetcher, DomParser), ported to httpx + regex.
ponytail: first page only, regex instead of a DOM parser; Amazon may answer with a bot check, then this returns []."""
import html
import re
from urllib.parse import unquote, urlparse

import httpx

USER_AGENT = "Mozilla/5.0 (Windows; U; WindowsNT 5.1; en-US; rv1.8.1.6) Gecko/20070725 Firefox/2.0.0.6"
WISHLIST_URL = re.compile(r"https?://(?:www\.)?amazon\.[a-z.]+/(?:hz/wishlist/ls|gp/registry/wishlist|registry/wishlist|wishlist/ls)/[A-Z0-9]+[^\s]*", re.I)


def find_url(text: str | None) -> str | None:
    m = WISHLIST_URL.search(text or "")
    return m.group(0) if m else None


PRODUCT_URL = re.compile(
    r"https?://(?:(?:amzn\.eu|amzn\.to|a\.co)/[A-Za-z0-9_\-/]+|(?:www\.)?amazon\.[a-z.]+/[^\s]*?/?dp/[A-Z0-9]{10}[^\s]*)", re.I)
BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


def find_product_urls(text: str | None) -> list[str]:
    """Short links and product links, wishlist links excluded."""
    return [u.rstrip(".,;)") for u in PRODUCT_URL.findall(text or "") if not WISHLIST_URL.search(u)]


def slug_term(url: str) -> str | None:
    """'https://www.amazon.de/Ducati-Schluesselanhaenger-rot/dp/B0X' -> 'Ducati Schluesselanhaenger rot'."""
    path = unquote(urlparse(url).path)
    if "/dp/" not in path and "/gp/product/" not in path:
        return None
    before = path.split("/dp/")[0].split("/gp/product/")[0].strip("/")
    slug = before.split("/")[-1] if before else ""
    term = re.sub(r"[-_+]+", " ", slug).strip()
    return term[:120] if len(term) >= 3 else None


def resolve_product(url: str) -> tuple[str | None, str]:
    """Follow the redirect (no page is read) and take the product slug from the target URL. Returns (term, status)."""
    try:
        with httpx.stream("GET", url, headers={"User-Agent": BROWSER_UA, "Accept-Language": "de-DE,de;q=0.9"},
                          follow_redirects=True, timeout=5) as r:
            final, code = str(r.url), r.status_code
    except Exception as exc:
        return None, type(exc).__name__
    term = slug_term(final)
    return term, f"{code} {final.split('?')[0]}" if term else f"no product name in target {final.split('?')[0]} ({code})"


def fetch(url: str) -> tuple[list[dict], int]:
    """Returns (items, http_status). items: [{title, price}]."""
    r = httpx.get(url.split("?")[0], headers={"User-Agent": USER_AGENT, "Referer": "http://www.google.com", "Accept-Language": "de-DE,de;q=0.9"},
                  follow_redirects=True, timeout=15)
    if r.status_code != 200:
        return [], r.status_code
    page = r.text
    items = []
    for m in re.finditer(r'id="itemName_([A-Z0-9]+)"[^>]*?title="([^"]+)"', page):
        price = re.search(rf'id="itemPrice_{m.group(1)}"[^>]*>.*?a-offscreen">([^<]+)<', page, re.S)
        items.append({"title": html.unescape(m.group(2)).strip(), "price": html.unescape(price.group(1)).strip() if price else None})
    return items, 200


if __name__ == "__main__":
    import sys

    found, status = fetch(sys.argv[1])
    print(status, len(found))
    for it in found:
        print("-", it["title"][:90], "|", it["price"])
