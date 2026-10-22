// umbra-winfix.exe: runs next to Steam inside a bottle and moves any top-level window
// that opened off-screen back to the middle of the main display. Under Wine on macOS,
// Steam's sign-in and main windows are created at an off-screen position (the log says
// "pos: 805240832,805240832"), so Steam looks like it never opened.
// Exits once no steam.exe has run for a minute.
// Build: x86_64-w64-mingw32-gcc -O2 -s -mwindows -o winfix.exe winfix.c
#include <windows.h>
#include <tlhelp32.h>

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
  // Minimized windows also sit off-screen (at -32000), so leave those alone.
  if (!IsWindowVisible(w) || IsIconic(w) || (GetWindowLongW(w, GWL_STYLE) & WS_CHILD)) return TRUE;
  RECT r, desk;
  if (!GetWindowRect(w, &r) || r.right - r.left < 100 || r.bottom - r.top < 60) return TRUE;
  int vx = GetSystemMetrics(SM_XVIRTUALSCREEN), vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN), vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  BOOL off = r.right <= vx + 40 || r.bottom <= vy + 40 || r.left >= vx + vw - 40 || r.top >= vy + vh - 40;
  if (!off) return TRUE;
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &desk, 0);
  int ww = r.right - r.left, wh = r.bottom - r.top;
  int dw = desk.right - desk.left, dh = desk.bottom - desk.top;
  if (ww > dw) ww = dw;
  if (wh > dh) wh = dh;
  SetWindowPos(w, NULL, desk.left + (dw - ww) / 2, desk.top + (dh - wh) / 2, ww, wh, SWP_NOZORDER | SWP_NOACTIVATE);
  return TRUE;
}

int WINAPI WinMain(HINSTANCE a, HINSTANCE b, LPSTR c, int d) {
  (void)a; (void)b; (void)c; (void)d;
  DWORD idle = 0, start = GetTickCount();
  for (;;) {
    EnumWindows(fix, 0);
    if (steam_running()) idle = 0;
    else if ((idle += 1000) >= 60000 && GetTickCount() - start > 60000) return 0;
    Sleep(1000);
  }
}
