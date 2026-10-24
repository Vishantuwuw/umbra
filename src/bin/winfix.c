// umbra-winfix.exe: runs next to Steam inside a bottle and moves any top-level window
// that opened off-screen back to the middle of the main display. Under Wine on macOS,
// Steam's sign-in and main windows are created at an off-screen position (the log says
// "pos: 805240832,805240832"), so Steam looks like it never opened.
// Exits once no steam.exe has run for a minute.
// Build: x86_64-w64-mingw32-gcc -O2 -s -mwindows -o winfix.exe winfix.c
#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>

// What it sees goes to winfix.log next to the exe, so a Steam that "never opens" can be
// diagnosed: every top-level window, each time its position or visibility changes.
static FILE *logf;
static int lines;
static struct { HWND w; RECT r; BOOL vis; } seen[512];
static int nseen;

static void note(HWND w, const RECT *r, BOOL vis, const char *what) {
  if (!logf || lines > 3000) return;
  WCHAR title[128] = L"", cls[64] = L"";
  GetWindowTextW(w, title, 128);
  GetClassNameW(w, cls, 64);
  DWORD pid = 0;
  GetWindowThreadProcessId(w, &pid);
  fprintf(logf, "%lu %s hwnd=%p pid=%lu vis=%d rect=%ld,%ld,%ld,%ld class=%ls title=%ls\n", GetTickCount(), what, (void *)w,
          pid, vis, r->left, r->top, r->right, r->bottom, cls, title);
  fflush(logf);
  lines++;
}

static void track(HWND w, const RECT *r, BOOL vis) {
  for (int i = 0; i < nseen; i++) {
    if (seen[i].w != w) continue;
    if (seen[i].vis != vis || memcmp(&seen[i].r, r, sizeof *r)) { seen[i].r = *r; seen[i].vis = vis; note(w, r, vis, "changed"); }
    return;
  }
  if (nseen < 512) { seen[nseen].w = w; seen[nseen].r = *r; seen[nseen].vis = vis; nseen++; }
  note(w, r, vis, "new");
}

static BOOL steam_running(void) {
  BOOL found = FALSE;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return TRUE;
  PROCESSENTRY32W pe = { sizeof(pe) };
  for (BOOL ok = Process32FirstW(snap, &pe); ok && !found; ok = Process32NextW(snap, &pe))
    found = !lstrcmpiW(pe.szExeFile, L"steam.exe") || !lstrcmpiW(pe.szExeFile, L"steamwebhelper.exe");
  CloseHandle(snap);
  return found;
}

static BOOL CALLBACK fix(HWND w, LPARAM unused) {
  (void)unused;
  RECT r, desk;
  if (!GetWindowRect(w, &r)) return TRUE;
  track(w, &r, IsWindowVisible(w));
  // Minimized windows also sit off-screen (at -32000), so leave those alone.
  if (!IsWindowVisible(w) || IsIconic(w) || (GetWindowLongW(w, GWL_STYLE) & WS_CHILD)) return TRUE;
  if (r.right - r.left < 100 || r.bottom - r.top < 60) return TRUE;
  int vx = GetSystemMetrics(SM_XVIRTUALSCREEN), vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN), vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  BOOL off = r.right <= vx + 40 || r.bottom <= vy + 40 || r.left >= vx + vw - 40 || r.top >= vy + vh - 40;
  if (!off) return TRUE;
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &desk, 0);
  int ww = r.right - r.left, wh = r.bottom - r.top;
  int dw = desk.right - desk.left, dh = desk.bottom - desk.top;
  if (ww > dw) ww = dw;
  if (wh > dh) wh = dh;
  BOOL moved = SetWindowPos(w, NULL, desk.left + (dw - ww) / 2, desk.top + (dh - wh) / 2, ww, wh, SWP_NOZORDER | SWP_NOACTIVATE);
  GetWindowRect(w, &r);
  note(w, &r, TRUE, moved ? "moved" : "move-failed");
  return TRUE;
}

int WINAPI WinMain(HINSTANCE a, HINSTANCE b, LPSTR c, int d) {
  (void)a; (void)b; (void)c; (void)d;
  DWORD idle = 0, start = GetTickCount();
  WCHAR path[MAX_PATH];
  DWORD n = GetModuleFileNameW(NULL, path, MAX_PATH);
  if (n > 4 && n < MAX_PATH) { lstrcpyW(path + n - 4, L".log"); logf = _wfopen(path, L"w"); }
  if (logf) {
    fprintf(logf, "screen %dx%d virtual %d,%d %dx%d\n", GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN),
            GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN),
            GetSystemMetrics(SM_CXVIRTUALSCREEN), GetSystemMetrics(SM_CYVIRTUALSCREEN));
    fflush(logf);
  }
  for (;;) {
    EnumWindows(fix, 0);
    if (steam_running()) idle = 0;
    else if ((idle += 1000) >= 60000 && GetTickCount() - start > 60000) return 0;
    Sleep(1000);
  }
}
