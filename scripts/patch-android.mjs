// Re-applies the Spotify redirect intent filter if you ever regenerate the
// android/ folder (rm -rf android && npx cap add android && npm run android:patch).
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'android/app/src/main/AndroidManifest.xml'
let xml = readFileSync(file, 'utf8')

if (!xml.includes('android:scheme="pulse"')) {
  xml = xml.replace(
    /(<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>)/,
    `$1

            <!-- Spotify login redirect: pulse://callback -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="pulse" android:host="callback" />
            </intent-filter>`,
  )
}

if (!xml.includes('<queries>')) {
  xml = xml.replace(
    '<!-- Permissions -->',
    `<queries>
        <package android:name="com.spotify.music" />
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="spotify" />
        </intent>
    </queries>

    <!-- Permissions -->`,
  )
}

writeFileSync(file, xml)
console.log('AndroidManifest.xml patched')
