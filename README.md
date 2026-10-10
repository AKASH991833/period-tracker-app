# Gulabi - Period & Health Tracker App

Ek **simple, private aur accurate** period & health tracker - girls ke liye, unki privacy ko dhyan me rakh ke banaya gaya.

**Live app:** hosted via GitHub Pages (link repo description me)

## Features

- **Cycle prediction** - agla period, ovulation aur fertile window, uncertainty range ke saath (fake precision nahi - honest "+/-N din ka range")
- **Color-coded calendar** - period, predicted period, fertile window, ovulation, PMS - sab alag colors me
- **Daily log** - flow (light/medium/heavy), 12 symptoms, 8 moods, notes
- **AI health tips** - Gemini API se personalized tips (cramps, diet, exercise, sleep, mood) - aapke current cycle phase ke hisaab se. Offline fallback tips bhi included.
- **Privacy first** - tracking data 100% phone ke localStorage me. Koi account nahi, koi tracking nahi. AI tips optional hain: pehli use se pehle app clear permission leti hai, aur tab sirf limited cycle info (cycle day, phase, recent symptoms - kabhi period dates/notes/naam nahi) Google Gemini ko tip banane ke liye jati hai.
- **PIN lock** + **Disguise mode** - lock screen ek working calculator jaisi dikhti hai, app ka naam "Calculator" ho jata hai. PIN type karke = dabao toh app khulti hai.
- **Reminders** - period se pehle in-app reminder
- **Dark mode** - soft dark pink theme
- **Backup / restore** - JSON export-import

## Accuracy method

Prediction evidence-based calendar method use karti hai:

1. Logged period start dates se cycle lengths nikali jaati hain (last 6 cycles ka mean)
2. Ovulation = predicted next period - 14 days (standard luteal phase)
3. Fertile window = ovulation -4 se +1 din (sperm survival ~5 din + egg ~24 hrs)
4. Uncertainty = logged cycles ka standard deviation (kam data pe range honestly wide dikhai jaati hai)

Jitna zyada regular log, utna accurate prediction. App kabhi exact-date ka jhootha dawa nahi karti - hamesha range ke saath.

## Tech

Pure HTML/CSS/JS - koi framework nahi, koi build step nahi. Static hosting pe chalti hai (GitHub Pages). PWA manifest included - "Add to Home Screen" se app jaisi lagti hai.

## AI tips setup

1. [Google AI Studio](https://aistudio.google.com/apikey) se free Gemini API key banao
2. App me Settings > AI Tips (Gemini) me key paste karo
3. Key sirf phone pe save hoti hai - code/repo me kahin nahi hai

## Privacy

App ka koi apna server nahi, koi analytics nahi - tracking data phone se bahar nahi jaata. Sirf optional AI tips (aapki permission ke baad) limited cycle info Google Gemini API ko bhejti hain. Data delete karna ho toh Settings > "Saara data delete karo" - bas, khatam.
