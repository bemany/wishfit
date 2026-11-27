"""Fetch a public Amazon wishlist. Request and selectors follow
https://github.com/christian-draeger/amazon-wishlist-webservice (WishListFetcher, DomParser), ported to httpx + regex.
ponytail: first page only, regex instead of a DOM parser; Amazon may answer with a bot check, then this returns []."""
import html
import re
from urllib.parse import unquote, urljoin, urlparse

import httpx

USER_AGENT = "Mozilla/5.0 (Windows; U; WindowsNT 5.1; en-US; rv1.8.1.6) Gecko/20070725 Firefox/2.0.0.6"
WISHLIST_URL = re.compile(r"https?://(?:www\.)?amazon\.[a-z.]+/(?:hz/wishlist/ls|gp/registry/wishlist|registry/wishlist|wishlist/ls)/[A-Z0-9]+[^\s]*", re.I)


def find_url(text: str | None) -> str | None:
    m = WISHLIST_URL.search(text or "")
    return m.group(0) if m else None


SHORT_HOSTS = {"amzn.eu", "amzn.to", "a.co"}
SHOP_HOST = re.compile(r"^(?:www\.)?amazon\.(?:de|com|co\.uk|fr|it|es|nl|at|ch|pl|se|com\.be)$")
# candidates: any host that looks like Amazon; resolve_product() then lets only the exact hosts above through
PRODUCT_URL = re.compile(
    r"https?://(?:(?:amzn\.eu|amzn\.to|a\.co)/[A-Za-z0-9_\-/]+|[^\s/]*(?:amazon|amzn)[^\s/]*/[^\s]*?/?dp/[A-Z0-9]{10}[^\s]*)", re.I)
BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
MAX_HOPS = 3


def allowed(url: str) -> bool:
    """Only http(s) and exactly the Amazon hosts: no amazon.evil.com, no internal addresses."""
    p = urlparse(url)
    host = (p.hostname or "").lower()
    return p.scheme in ("http", "https") and p.port in (None, 80, 443) and not p.username and (host in SHORT_HOSTS or bool(SHOP_HOST.match(host)))


def find_product_urls(text: str | None) -> list[str]:
    """Short links and product links, wishlist links excluded."""
    return [u.rstrip(".,;)") for u in PRODUCT_URL.findall(text or "") if not WISHLIST_URL.search(u)]


def asin_of(url: str) -> str | None:
    m = re.search(r"/(?:dp|gp/product)/([A-Z0-9]{10})", urlparse(url).path)
    return m.group(1) if m else None


def slug_term(url: str) -> str | None:
    """'https://www.amazon.de/Ducati-Schluesselanhaenger-rot/dp/B0X' -> 'Ducati Schluesselanhaenger rot'."""
    path = unquote(urlparse(url).path)
    if "/dp/" not in path and "/gp/product/" not in path:
        return None
    before = path.split("/dp/")[0].split("/gp/product/")[0].strip("/")
    slug = before.split("/")[-1] if before else ""
    term = re.sub(r"[-_+]+", " ", slug).strip()
    return term[:120] if len(term) >= 3 else None


def resolve_product(url: str, timeout: float = 5) -> tuple[str | None, str, str | None]:
    """Product slug as search term. Redirects are followed by hand (max 3 hops), every hop must be an Amazon
    host. Returns (term, status, asin); status is only "resolved", "rejected" or "failed" (it goes into the public trace)."""
    if not allowed(url):
        return None, "rejected", None
    term, asin = slug_term(url), asin_of(url)
    if term:
        return term, "resolved", asin
    try:
        with httpx.Client(follow_redirects=False, timeout=timeout, headers={"User-Agent": BROWSER_UA, "Accept-Language": "de-DE,de;q=0.9"}) as client:
            for _ in range(MAX_HOPS + 1):
                with client.stream("GET", url) as r:
                    location = r.headers.get("location") if r.is_redirect else None
                if not location:
                    break
                url = urljoin(url, location)
                if not allowed(url):
                    return None, "rejected", asin
                asin = asin_of(url) or asin
                term = slug_term(url)
                if term:
                    return term, "resolved", asin
            else:
                return None, "failed", asin  # more hops than allowed
    except Exception:
        return None, "failed", asin
    return slug_term(url), "resolved" if slug_term(url) else "failed", asin_of(url) or asin


def parse_price(text: str | None) -> float | None:
    """'83,92\xa0€' -> 83.92, '1.299,00 €' -> 1299.0, '$12.50' -> 12.5."""
    m = re.search(r"\d[\d.,]*", text or "")
    if not m:
        return None
    num = m.group(0).rstrip(".,")
    if "," in num and "." in num:
        dec = "," if num.rfind(",") > num.rfind(".") else "."
    elif "," in num:
        dec = ","
    elif "." in num and len(num.rsplit(".", 1)[1]) != 3:
        dec = "."
    else:
        dec = None
    if dec:
        whole, _, frac = num.rpartition(dec)
        num = re.sub(r"[.,]", "", whole) + "." + frac
    else:
        num = re.sub(r"[.,]", "", num)
    try:
        return round(float(num), 2)
    except ValueError:
        return None


def fetch(url: str) -> tuple[list[dict], int]:
    """Returns (items, http_status). items: [{title, price, price_eur, url, image_url}]."""
    url = url.split("?")[0]
    headers = {"User-Agent": USER_AGENT, "Referer": "http://www.google.com", "Accept-Language": "de-DE,de;q=0.9"}
    for _ in range(MAX_HOPS + 1):  # redirects by hand: every hop must be an Amazon host
        if not allowed(url):
            return [], 400
        r = httpx.get(url, headers=headers, follow_redirects=False, timeout=15)
        if not r.is_redirect:
            break
        url = urljoin(url, r.headers.get("location", ""))
    else:
        return [], 508
    if r.status_code != 200:
        return [], r.status_code
    page = r.text
    items = []
    prev = 0
    for m in re.finditer(r'id="itemName_([A-Z0-9]+)"([^>]*?)>', page):
        tag = m.group(2)
        title = re.search(r'title="([^"]+)"', tag)
        if not title:
            continue
        price = re.search(rf'id="itemPrice_{m.group(1)}"[^>]*>.*?a-offscreen">([^<]+)<', page, re.S)
        price_text = html.unescape(price.group(1)).strip() if price else None
        href = re.search(r'href="([^"]+)"', tag)
        asin = re.search(r"/dp/([A-Z0-9]{10})", href.group(1)) if href else None
        imgs = re.findall(r'<img[^>]*?\ssrc="(https://[^"]+)"', page[prev:m.start()])
        prev = m.end()
        items.append({
            "title": html.unescape(title.group(1)).strip(),
            "price": price_text,
            "price_eur": parse_price(price_text),
            "url": f"https://www.amazon.de/dp/{asin.group(1)}" if asin else None,
            "image_url": html.unescape(imgs[-1]) if imgs else None,
        })
    return items, 200


if __name__ == "__main__":
    import sys

    found, status = fetch(sys.argv[1])
    print(status, len(found))
    for it in found:
        print("-", it["title"][:90], "|", it["price"])
