# Google Play: Kwetuu merchant app (`com.mykwetuu.app`)

Technical prep lives in this repo. **Play Console setup and review are done by a human** on [Google Play Console](https://play.google.com/console).

## What the app is

- **Package:** `com.mykwetuu.app`
- **Type:** Capacitor WebView loading `https://mykwetuu.com/staff-login` (merchant dashboard, not shopper storefronts).
- **Category suggestion:** Business
- **Privacy policy URL:** `https://mykwetuu.com/privacy` (update legal name on that page before review).

## Build the upload file (AAB)

Google Play requires an **Android App Bundle** (`.aab`), not APK alone.

### 1. Create a release keystore (once)

```bash
keytool -genkeypair -v -keystore kwetuu-release.keystore -alias kwetuu -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore **outside git**. Add GitHub Actions secrets:

| Secret                      | Purpose                              |
| --------------------------- | ------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 kwetuu-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                    |
| `ANDROID_KEY_ALIAS`         | e.g. `kwetuu`                        |
| `ANDROID_KEY_PASSWORD`      | Key password                         |

### 2. CI build

- Workflow: **Android merchant APK** (`.github/workflows/android-apk.yml`)
- Push tag `merchant-android-1.0.0` or run **workflow_dispatch** with version name/code.
- When signing secrets exist, the job outputs **`app-release.aab`** (artifact + GitHub Release on tags).

### 3. Local build (optional)

```bash
cp android/keystore.properties.example android/keystore.properties   # fill in
node scripts/android-set-version.mjs 1.0.0 2
CAPACITOR_SERVER_URL=https://mykwetuu.com/staff-login npm run mobile:sync
cd android && ./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

**Bump `VERSION_CODE` on every Play upload** (Play rejects reused codes). CI uses `workflow_dispatch` input or tag suffix.

## Play Console checklist

Create app **Kwetuu** (or **Kwetuu for Business**). Complete before **Submit for review**:

### Store listing

- Short + full description (merchant POS, inventory, online orders, Zimbabwe-focused).
- App icon: `public/icon-512.png` or Android mipmap exports.
- Feature graphic 1024×500, phone screenshots (staff login, dashboard, sales, inventory).
- Contact email (support).

### App content

- **Privacy policy:** `https://mykwetuu.com/privacy`
- **App access:** Restricted (login required). Provide **test credentials** for reviewers (staging shop or dedicated test business).
- **Ads:** No (unless you add ads later).
- **Target audience:** 18+ / not aimed at children (business app).
- **News app / COVID / Government:** No.
- **Data safety:** Declare account info, financial info (orders/sales), device IDs as collected/processed through the web app and Supabase; encryption in transit; users can request deletion per privacy policy. Align answers with `docs/DATA_INVENTORY_AND_PRIVACY.md`.
- **Content rating:** IARC questionnaire (typically low maturity, business tools).

### Release

1. **Internal testing** track first (upload `.aab`, add testers).
2. Fix any **pre-launch report** issues (permissions, WebView, crash-free).
3. **Production** when ready.

### After approval

Set on Cloud Run (no redeploy of web assets needed):

```env
MERCHANT_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.mykwetuu.app
```

`/download` shows **Get it on Google Play**. Keep `MERCHANT_APK_URL` only if you still offer sideload.

## Permissions

Manifest today: `INTERNET` only. Camera for barcode scanning is requested at runtime in the WebView when merchants use Sales; declare **Camera** in Data safety if prompted after review.

## Common rejection fixes

- Login wall: always supply working test account in App access.
- Privacy policy mismatch: legal operator name must match Play developer account.
- Version code: increment on every upload.
- Target API: project uses `targetSdkVersion 36` in `android/variables.gradle` (keep current with Play requirements).

## Not automated here

- Play Console account verification, tax, banking.
- Creating the store listing graphics (screenshots).
- Answering the Data safety form (template above is a guide, not legal advice).
