# Univers — Build & Push Setup

## Building the Android APK

A GitHub Actions workflow at `.github/workflows/build-apk.yml` builds a debug APK on every push to `main`.

After the workflow runs:
1. Open the GitHub Actions run → **Artifacts** → download `univers-debug-apk`.
2. Install `app-debug.apk` on your phone.

## Push notifications (Firebase Cloud Messaging)

Push only works on the **installed APK**, not the web preview.

1. In Firebase Console → Project settings → **Your apps** → Add Android app with package name `app.lovable.univers`.
2. Download `google-services.json`.
3. In your GitHub repo → **Settings → Secrets and variables → Actions** → add a new secret:
   - Name: `GOOGLE_SERVICES_JSON`
   - Value: paste the full contents of `google-services.json`
4. Push to `main` — the workflow drops the file into `android/app/` before building.
5. After installing the new APK and signing in, the app registers an FCM token in `device_tokens`.

The server-side "send push when message arrives" piece needs your Firebase Admin SDK service-account JSON — share it via a Lovable Secret (e.g. `FIREBASE_SERVICE_ACCOUNT`) and I'll wire the push-on-new-message server function.

## End-to-end encryption

- Text **and files** are encrypted in your browser with AES-256-GCM before leaving your device.
- Files use a per-file random key, which is itself wrapped by the ECDH-derived chat key.
- The server only ever stores ciphertext (text + files).
- Private keys live in your browser's localStorage and never touch the server.
