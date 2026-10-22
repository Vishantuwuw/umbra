## Download
- **Apple Silicon (M1/M2/M3/M4)** → `Umbra-*-arm64.dmg`
- **Intel Mac** → `Umbra-*-x64.dmg`

## First launch
Umbra isn't notarized by Apple, so macOS will block it the first time:
1. Drag **Umbra** into **Applications**.
2. Open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.
   (Or run `xattr -cr /Applications/Umbra.app` in Terminal.)
3. In Umbra, click **Set up everything**. It installs Rosetta (on Apple Silicon), the Wine engine, a Windows bottle and Visual C++.

Then drop any `.exe` onto the window, or go to **Steam → Install Steam for Windows**.

Screenshots are in the [README](https://github.com/{{REPO}}#readme).
