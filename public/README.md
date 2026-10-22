# Umbra

**Run Windows apps and games on your Mac.** [Download the latest release](../../releases/latest).

Umbra is a CrossOver-style launcher with a dark UI. It runs Windows programs on macOS through [Wine](https://www.winehq.org/), the open-source compatibility layer that CrossOver is also built on.

- **Accounts, no guests**: sign in with email, Google, Discord or GitHub before using Umbra. Admins get an Admin panel to ban accounts and device IDs (HWIDs).
- **Welcome setup**: on first launch Umbra asks what you want (Steam, Windows essentials, game components, .NET) and installs it all with one click.
- **Pre-installed Windows tools**: Task Manager, File Explorer, Notepad, Command Prompt, Control Panel, Registry Editor, WordPad and Minesweeper are in your Library from the start.
- **Get Apps**: one-click installs for Steam, the Epic Games Launcher, GOG Galaxy, Battle.net, EA app, Ubisoft Connect, 7-Zip, Notepad++ and VLC.
- **Simple per-game settings**: a gear on every game for the FPS counter, faster graphics (DXVK), Retina, Windows version and launch options, plus one-click "Fix Common Problems".
- **DirectX 12 via D3DMetal**: Umbra finds the Wine engines from Whisky or Apple's Game Porting Toolkit, and you can switch to one on the Engine page to run DirectX 12 games.
- **Bottle backups**: save a whole Windows setup (games, saves, settings) as one `.tar.gz` from the bottle's menu.
- **Favorites**: star games to pin them to the top of your Library.
- **Drop any `.exe`** (or `.msi` / `.bat`) onto the window to run it. You can also double-click one in Finder (Open With → Umbra).
- **Installers just work**: run any `setup.exe` or `.msi` and the program installs into that bottle. When it finishes, Umbra adds the installed app to your Library automatically, named after its Start Menu shortcut.
- **Components**: one-click Visual C++ 2015–2022, .NET Desktop Runtime 8, DirectX 9 extras and Wine Mono/Gecko per bottle, plus winetricks for anything else. This is the fix for most "app won't start" problems.
- **DXVK (experimental)**: per-bottle DirectX 10/11 → Vulkan → Metal translation for faster games.
- **Real artwork**: icons pulled from each `.exe`, and official Steam cover art for Steam games.
- **Add to Mac Applications**: any Windows app or game gets its own launcher in `~/Applications/Umbra`, so it shows up in Launchpad, Spotlight and the Dock.
- **Native Mac menus**: Run Windows Program (⌘O), New Bottle (⌘N), ⌘1–5 to switch pages, plus an in-app notice when an update is out.
- **Steam library import**: installed Steam games are added with their real names and covers, automatically whenever Steam closes.
- **Bottles**: isolated Windows 10/11/7/XP environments, each with its own C: drive and registry.
- **One-click Steam**: downloads Valve's official Windows Steam installer into a dedicated bottle.
- **Library**: saves your games and apps for one-click launching and tracks playtime.
- **One-click engine install**: downloads a prebuilt macOS Wine build, so you don't need Homebrew.
- **Performance toggles**: MSync, ESync, Metal HUD and Retina mode.
- **Live console**: shows Wine output, lists running processes, and lets you force-quit them.

| | |
|---|---|
| ![Welcome setup](docs/screenshots/welcome.png) | ![Get Apps](docs/screenshots/get-apps.png) |
| ![Library with Windows tools](docs/screenshots/library-tools.png) | ![Per-game settings](docs/screenshots/app-settings.png) |
| ![Windows exe running on macOS](docs/screenshots/mac-exe-running.png) | ![Loading screen](docs/screenshots/loading-47.png) |
| ![Library](docs/screenshots/library-running.png) | ![Bottles](docs/screenshots/bottles.png) |
| ![Run dialog](docs/screenshots/run-dialog.png) | ![Steam](docs/screenshots/steam.png) |
| ![Installer detected](docs/screenshots/installer-dialog.png) | ![Installed app added](docs/screenshots/installer-added.png) |
| ![Components](docs/screenshots/components.png) | ![Library with icons](docs/screenshots/library-icons.png) |
| ![Engine](docs/screenshots/engine.png) | ![Console](docs/screenshots/console.png) |

## Install

1. Download the latest `.dmg` from **[Releases](../../releases)**: `arm64` for Apple Silicon, `x64` for Intel Macs.
2. Drag **Umbra** into **Applications**.
3. Umbra isn't notarized, so macOS blocks it the first time. Open it once, then go to **System Settings → Privacy & Security → Open Anyway**. You can also run `xattr -cr /Applications/Umbra.app` in Terminal instead.
4. Umbra's welcome screen sets everything up. Pick what you want installed (Steam is on by default) and click **Install**.

## Compatibility

Wine runs a lot of software, but not all of it:

| | |
|---|---|
| ✅ Works well | Most DirectX 9–11 games, indie games, older titles, many launchers and utilities |
| ⚠️ Depends | DirectX 12 games need D3DMetal. Install Whisky or Apple's Game Porting Toolkit, then pick its engine under **Engine → Engines on this Mac** |
| ❌ Won't work | Games with kernel anti-cheat (Valorant, many competitive shooters) |

## Your data

Umbra keeps your bottles, Wine engine and Library in `~/Library/Application Support/Umbra` on your Mac.

## Credits

**Made by Vini** ([@coldvini](https://github.com/coldvini)).

Umbra is built on these open-source projects:

- [Wine](https://www.winehq.org): the compatibility layer that runs Windows programs
- [Gcenx macOS Wine builds](https://github.com/Gcenx/macOS_Wine_builds): the prebuilt Wine for macOS that Umbra installs
- [DXVK-macOS](https://github.com/Gcenx/DXVK-macOS): DirectX 10/11 → Vulkan translation
- [MoltenVK](https://github.com/KhronosGroup/MoltenVK): Vulkan on Apple Metal
- [Winetricks](https://github.com/Winetricks/winetricks): extra Windows components
- [Electron](https://www.electronjs.org): the app framework
- [Inter](https://rsms.me/inter/): typeface by Rasmus Andersson
