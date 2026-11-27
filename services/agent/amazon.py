"""Fetch a public Amazon wishlist. Request and selectors follow
https://github.com/christian-draeger/amazon-wishlist-webservice (WishListFetcher, DomParser), ported to httpx + regex.
ponytail: first page only, regex instead of a DOM parser; Amazon may answer with a bot check, then this returns []."""
import html
import re

import httpx

USER_AGENT = "Mozilla/5.0 (Windows; U; WindowsNT 5.1; en-US; rv1.8.1.6) Gecko/20070725 Firefox/2.0.0.6"
WISHLIST_URL = re.compile(r"https?://(?:www\.)?amazon\.[a-z.]+/(?:hz/wishlist/ls|gp/registry/wishlist|registry/wishlist|wishlist/ls)/[A-Z0-9]+[^\s]*", re.I)


def find_url(text: str | None) -> str | None:
    m = WISHLIST_URL.search(text or "")
    return m.group(0) if m else None


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
