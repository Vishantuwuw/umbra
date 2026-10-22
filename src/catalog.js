// What Umbra can pre-install: the Windows tools every bottle already has, and
// popular launchers/apps it can download and install in one click.

// Built into every Wine bottle; added to the Library during setup.
const WINDOWS_TOOLS = [
  { name: 'Task Manager', rel: 'windows/system32/taskmgr.exe' },
  { name: 'File Explorer', rel: 'windows/explorer.exe' },
  { name: 'Notepad', rel: 'windows/system32/notepad.exe' },
  { name: 'Command Prompt', rel: 'windows/system32/wineconsole.exe', args: 'cmd', iconFrom: 'windows/system32/cmd.exe' },
  { name: 'Control Panel', rel: 'windows/system32/control.exe' },
  { name: 'Registry Editor', rel: 'windows/regedit.exe' },
  { name: 'WordPad', rel: 'windows/system32/write.exe' },
  { name: 'Minesweeper', rel: 'windows/system32/winemine.exe' },
  { name: 'Windows Settings', rel: 'windows/system32/winecfg.exe' },
];

// One-click installs on the Get Apps page. `args` makes an installer run silently;
// without it the installer's own window opens. `match` picks the main program
// when the installer creates no Start Menu shortcut.
const STORE = [
  {
    id: 'steam', name: 'Steam', kind: 'Game store', compat: 'good',
    desc: 'Valve’s PC game store and library.',
    special: 'steam',
  },
  {
    id: 'epic', name: 'Epic Games Launcher', kind: 'Game store', compat: 'ok',
    desc: 'Epic’s store, free weekly games and Fortnite’s launcher.',
    url: 'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi',
    file: 'EpicGamesLauncherInstaller.msi', args: ['/qn'], match: /EpicGamesLauncher\.exe$/i,
  },
  {
    id: 'gog', name: 'GOG Galaxy', kind: 'Game store', compat: 'ok',
    desc: 'DRM-free games from GOG.com.',
    url: 'https://webinstallers.gog-statics.com/download/GOG_Galaxy_2.0.exe',
    file: 'GOG_Galaxy_2.0.exe', match: /GalaxyClient\.exe$/i,
  },
  {
    id: 'battlenet', name: 'Battle.net', kind: 'Game store', compat: 'ok',
    desc: 'Blizzard games: Diablo, Overwatch, WoW, Hearthstone.',
    url: 'https://www.battle.net/download/getInstallerForGame?os=win&gameProgram=BATTLENET_APP&version=Live',
    file: 'Battle.net-Setup.exe', match: /Battle\.net( Launcher)?\.exe$/i,
  },
  {
    id: 'ea', name: 'EA app', kind: 'Game store', compat: 'limited',
    desc: 'EA and Origin games. Some titles use anti-cheat that won’t run.',
    url: 'https://origin-a.akamaihd.net/EA-Desktop-Client-Download/installer-releases/EAappInstaller.exe',
    file: 'EAappInstaller.exe', match: /EADesktop\.exe$/i,
  },
  {
    id: 'ubisoft', name: 'Ubisoft Connect', kind: 'Game store', compat: 'limited',
    desc: 'Ubisoft’s launcher for Assassin’s Creed, Far Cry and more.',
    url: 'https://static3.cdn.ubi.com/orbit/launcher_installer/UbisoftConnectInstaller.exe',
    file: 'UbisoftConnectInstaller.exe', args: ['/S'], match: /UbisoftConnect\.exe$/i,
  },
  {
    id: '7zip', name: '7-Zip', kind: 'Utility', compat: 'good',
    desc: 'Open .zip, .rar and .7z archives.',
    url: 'https://www.7-zip.org/a/7z2409-x64.exe',
    file: '7z2409-x64.exe', args: ['/S'], match: /7zFM\.exe$/i,
  },
  {
    id: 'notepadpp', name: 'Notepad++', kind: 'Utility', compat: 'good',
    desc: 'A powerful text and code editor.',
    url: 'https://github.com/notepad-plus-plus/notepad-plus-plus/releases/download/v8.7.1/npp.8.7.1.Installer.x64.exe',
    file: 'npp.8.7.1.Installer.x64.exe', args: ['/S'], match: /notepad\+\+\.exe$/i,
  },
  {
    id: 'vlc', name: 'VLC', kind: 'Utility', compat: 'good',
    desc: 'Plays almost any video or audio file.',
    url: 'https://get.videolan.org/vlc/3.0.21/win64/vlc-3.0.21-win64.exe',
    file: 'vlc-3.0.21-win64.exe', args: ['/S'], match: /vlc\.exe$/i,
  },
];

module.exports = { WINDOWS_TOOLS, STORE };
