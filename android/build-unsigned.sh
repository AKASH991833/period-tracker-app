#!/bin/sh
set -eu
: "${ANDROID_HOME:?Set ANDROID_HOME to an Android SDK}"
: "${JAVA_HOME:?Set JAVA_HOME to JDK 17}"
BT="$ANDROID_HOME/build-tools/android-15"
PLATFORM="$ANDROID_HOME/platforms/android-35/android.jar"
mkdir -p out
"$BT/aapt" package -f -m -J out -M app/AndroidManifest.xml -S app/res -I "$PLATFORM"
"$JAVA_HOME/bin/javac" -source 8 -target 8 -classpath "$PLATFORM" -d out app/src/com/ptracker/app/MainActivity.java out/com/ptracker/app/R.java
"$BT/d8" --lib "$PLATFORM" --output out $(find out -name '*.class')
cp ../app.js ../index.html ../styles.css app/assets/
"$BT/aapt" package -f -M app/AndroidManifest.xml -S app/res -A app/assets -I "$PLATFORM" -F out/unsigned.apk
(cd out && zip -q unsigned.apk classes.dex)
"$BT/zipalign" -f 4 out/unsigned.apk out/ptracker-unsigned.apk
