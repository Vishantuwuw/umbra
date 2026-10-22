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

## Screenshots

**A Windows .exe running on a real Apple Silicon Mac**
![Windows exe running on macOS](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/mac-exe-running.png)

**Loading screen**
![Loading screen](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/loading-47.png)

**Library**
![Library](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/library-running.png)

**Run an installer and the app is added to your Library automatically**
![Installed app added](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/installer-added.png)

**Components: one-click Visual C++, .NET, DirectX and DXVK**
![Components](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/components.png)

**Bottles: separate Windows environments**
![Bottles](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/bottles.png)

**Run any .exe**
![Run dialog](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/run-dialog.png)

**One-click Steam**
![Steam](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/steam.png)

**Engine & performance**
![Engine](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/engine.png)

**Live console**
![Console](https://raw.githubusercontent.com/{{REPO}}/{{SHA}}/docs/screenshots/console.png)

All screenshots are also attached below as files.
