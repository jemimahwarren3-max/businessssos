# Kwetuu Desktop (Tauri) and Android (Capacitor)

Phase **B** packaging proof. The merchant app remains **TanStack Start** with server functions on the hosted Node API — native shells v1 load the **live staff entrypoint** so sessions and Paynow stay correct.

## Prerequisites

| Tool | Desktop (Windows) | Android APK |
| ---- | ------------------- | ----------- |
| Node.js ≥ 22.12 | Yes | Yes |
| Rust + MSVC (Windows) | Yes | — |
| [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) | Yes | Optional (Tauri Android later) |
| Android Studio + SDK | — | Yes |
| JDK 17+ | — | Yes |

Cloud CI can build Linux `.deb` / AppImage after installing [Tauri Linux deps](https://v2.tauri.app/start/prerequisites/#linux) (`libwebkit2gtk-4.1-dev`, etc.). **Windows `.exe` (NSIS) must be built on Windows** (or a Windows CI runner). This repo pins Rust ≥ 1.90 via `rust-toolchain.toml`.

## Desktop — Tauri 2

### Development (full local stack)

Runs Vite on port **8080** and opens a native window against `http://localhost:8080`.

```bash
npm install
cp .env.example .env   # fill Supabase + SESSION_SECRET
npm run desktop:dev
```

Sign in at `/staff-login` or `/auth` as in the browser.

### Production installer (v1 — hosted shell)

`src-tauri/tauri.conf.json` opens **`https://mykwetuu.com/staff-login`** in release builds so httpOnly cookies and server functions match production. This is intentional until a bundled client + API origin strategy is implemented (see `docs/MULTI_PLATFORM_PHASE_A_AUDIT.md`).

On **Windows** (after Rust + NSIS prerequisites):

```bash
npm run desktop:build
```

Installers appear under `src-tauri/target/release/bundle/`.

### Platform detection

`src/lib/platform.ts` exposes `getKwetuuPlatform()` → `"desktop"` when running under Tauri.

## Android — Capacitor 8

### One-time project setup

On a machine with Android Studio installed:

```bash
npm install
npm run build
npx cap add android   # if android/ is not present yet
```

### Sync web assets

```bash
npm run mobile:sync
npx cap open android
```

Build **Debug APK** from Android Studio: *Build → Build Bundle(s) / APK(s) → Build APK(s)*.

### Remote URL mode (default)

`capacitor.config.ts` sets `server.url` to `https://mykwetuu.com/staff-login` unless `CAPACITOR_SERVER_URL` is set. Same rationale as desktop v1.

To test a **bundled** `.output/public` build (server functions will not work until API origin + cookies are solved):

```bash
CAPACITOR_SERVER_URL= npm run mobile:sync
```

### Release signing

Do **not** commit keystores or passwords. Use Android Studio *Generate signed bundle / APK* with a keystore stored outside the repo. Document checksums on the public download page when ready (Phase 6).

## npm scripts

| Script | Purpose |
| ------ | ------- |
| `npm run desktop:dev` | Tauri + local Vite |
| `npm run desktop:build` | Tauri release bundles |
| `npm run mobile:build:web` | Vite/Nitro build only |
| `npm run mobile:sync` | Build + `cap sync android` |
| `npm run mobile:open:android` | Open Android Studio |

## Next steps (Phase B+)

- Bundled client with `VITE_KWETUU_API_ORIGIN` + fetch shim and cookie/auth strategy for true offline-first shell.
- Replace default Tauri icons with terracotta Kwetuu mark (`npx tauri icon public/icon-512.png`).
- Windows code signing; APK signing in CI with secrets.
- Milestone 3: offline POS using existing IndexedDB queue inside WebView.
