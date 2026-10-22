// Stands in for Steam's steamwebhelper.exe (its built-in Chromium). Under Wine 11 on
// macOS that browser paints Steam's windows black, and its separate network process
// can't finish sign-in ("Failed to poll auth session"). This wrapper starts the real
// helper, renamed to steamwebhelper.orig.exe, with --disable-gpu --single-process
// added, the fix used by macos-wine-steam and play-windows-steam-on-mac.
// Build: x86_64-w64-mingw32-gcc -O2 -s -municode -mwindows -o cefwrap.exe cefwrap.c
#include <windows.h>
#include <wchar.h>

// Everything after argv[0] in the raw command line, quotes kept as they were.
static const wchar_t *args_after_exe(const wchar_t *cmd) {
  if (*cmd == L'"') {
    cmd++;
    while (*cmd && *cmd != L'"') cmd++;
    if (*cmd) cmd++;
  } else {
    while (*cmd && *cmd != L' ' && *cmd != L'\t') cmd++;
  }
  while (*cmd == L' ' || *cmd == L'\t') cmd++;
  return cmd;
}

int WINAPI wWinMain(HINSTANCE a, HINSTANCE b, LPWSTR c, int d) {
  (void)a; (void)b; (void)c; (void)d;
  wchar_t self[MAX_PATH], real[MAX_PATH];
  DWORD n = GetModuleFileNameW(NULL, self, MAX_PATH);
  if (!n || n >= MAX_PATH) return 1;
  lstrcpyW(real, self);
  wchar_t *slash = wcsrchr(real, L'\\');
  lstrcpyW(slash ? slash + 1 : real, L"steamwebhelper.orig.exe");

  const wchar_t *rest = args_after_exe(GetCommandLineW());
  // Only the main browser process gets the flags; helpers it starts (--type=...) are
  // launched straight from the real exe anyway.
  BOOL main = !wcsstr(rest, L"--type=");
  size_t len = lstrlenW(real) + lstrlenW(rest) + 64;
  wchar_t *cmd = HeapAlloc(GetProcessHeap(), 0, len * sizeof(wchar_t));
  if (!cmd) return 1;
  wsprintfW(cmd, L"\"%s\" %s%s", real, rest, main ? L" --disable-gpu --single-process" : L"");

  // If Steam stops this wrapper, the real helper goes with it.
  HANDLE job = CreateJobObjectW(NULL, NULL);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION lim = { 0 };
  lim.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (job) SetInformationJobObject(job, JobObjectExtendedLimitInformation, &lim, sizeof lim);

  STARTUPINFOW si = { sizeof si };
  PROCESS_INFORMATION pi;
  if (!CreateProcessW(real, cmd, NULL, NULL, TRUE, CREATE_SUSPENDED, NULL, NULL, &si, &pi)) return 1;
  if (job) AssignProcessToJobObject(job, pi.hProcess);
  ResumeThread(pi.hThread);
  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD code = 1;
  GetExitCodeProcess(pi.hProcess, &code);
  return (int)code;
}
