/**
 * Staging-only k6 smoke. Not a production capacity guarantee.
 *
 *   k6 run -e BASE_URL=https://staging.example.com scripts/k6-storefront.js
 *
 * Default is 20 VUs for 30s on public pages only.
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 20,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

const base = (__ENV.BASE_URL || "http://localhost:8080").replace(/\/$/, "");

export default function () {
  const landing = http.get(`${base}/`);
  check(landing, { "landing 2xx": (r) => r.status >= 200 && r.status < 400 });
  const market = http.get(`${base}/market`);
  check(market, { "market 2xx": (r) => r.status >= 200 && r.status < 400 });
  sleep(1);
}
