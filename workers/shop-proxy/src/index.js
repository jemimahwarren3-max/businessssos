// Cloudflare Worker: proxy *.mykwetuu.com → mykwetuu.com
// Cloud Run only has mykwetuu.com mapped; subdomain requests need
// this Worker to forward them with the original hostname preserved.

const ROOT = "mykwetuu.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only proxy subdomain requests (not apex or www)
    if (url.hostname === ROOT || url.hostname === `www.${ROOT}`) {
      return fetch(request);
    }

    const suffix = `.${ROOT}`;
    if (!url.hostname.endsWith(suffix)) {
      return fetch(request);
    }

    const originalHost = url.hostname;

    // Rewrite hostname to apex so Cloud Run accepts it
    url.hostname = ROOT;

    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", originalHost);

    return fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });
  },
};
