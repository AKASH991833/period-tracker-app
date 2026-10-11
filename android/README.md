# P Tracker Android app

Offline Android shell (native WebView wrapper) around the same bundled web UI. AI tips (optional, consent-gated) call Google Gemini; baaki sab offline.

## Install
`P-Tracker-v1.0.0.apk` Android 8+ pe kholo aur install allow karo. Internet permission sirf optional AI tips ke liye hai.

## Data
App ka data uske private storage me hai (website ke browser storage se alag). Website se move karna ho toh: website Settings me JSON export, app Settings me import. Uninstall karne se local data delete ho jayega - pehle backup le lena.

## Build
Package `com.ptracker.app`, minSdk 26, target 34. JDK 17 + Android SDK platform 35 + build-tools 35 se build hota hai:
`aapt package -m` -> `javac` -> `d8` -> `aapt package -F` -> `zip classes.dex` -> `zipalign` -> `apksigner sign`.
Signing key public repo me nahi hai; future versions same package + key + higher versionCode se hi update honge (warna data nahi bachega).
