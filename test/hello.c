// Tiny Win32 GUI program used to verify Umbra can launch real .exe files.
// Build: x86_64-w64-mingw32-gcc -O2 -mwindows -o hello.exe hello.c
#include <windows.h>

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (msg == WM_PAINT) {
    PAINTSTRUCT ps;
    HDC dc = BeginPaint(hwnd, &ps);
    RECT r;
    GetClientRect(hwnd, &r);
    HBRUSH bg = CreateSolidBrush(RGB(8, 8, 12));
    FillRect(dc, &r, bg);
    DeleteObject(bg);
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, RGB(167, 139, 250));
    HFONT f = CreateFontA(34, 0, 0, 0, FW_BOLD, 0, 0, 0, 0, 0, 0, ANTIALIASED_QUALITY, 0, "Arial");
    SelectObject(dc, f);
    DrawTextA(dc, "Hello from Windows!", -1, &r, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
    OSVERSIONINFOA v = { sizeof(v) };
    GetVersionExA(&v);
    char line[128];
    wsprintfA(line, "This .exe is running through Umbra  -  Windows %lu.%lu build %lu", v.dwMajorVersion, v.dwMinorVersion, v.dwBuildNumber);
    HFONT s = CreateFontA(16, 0, 0, 0, FW_NORMAL, 0, 0, 0, 0, 0, 0, ANTIALIASED_QUALITY, 0, "Arial");
    SelectObject(dc, s);
    SetTextColor(dc, RGB(200, 200, 210));
    r.top += 70;
    DrawTextA(dc, line, -1, &r, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
    DeleteObject(f);
    DeleteObject(s);
    EndPaint(hwnd, &ps);
    return 0;
  }
  if (msg == WM_DESTROY) { PostQuitMessage(0); return 0; }
  return DefWindowProcA(hwnd, msg, wp, lp);
}

int WINAPI WinMain(HINSTANCE inst, HINSTANCE prev, LPSTR cmd, int show) {
  WNDCLASSA wc = { 0 };
  wc.lpfnWndProc = WndProc;
  wc.hInstance = inst;
  wc.lpszClassName = "UmbraHello";
  wc.hCursor = LoadCursor(NULL, IDC_ARROW);
  RegisterClassA(&wc);
  HWND w = CreateWindowA("UmbraHello", "Umbra Test - hello.exe", WS_OVERLAPPEDWINDOW, 120, 120, 640, 300, 0, 0, inst, 0);
  ShowWindow(w, show);
  MSG m;
  while (GetMessageA(&m, 0, 0, 0)) { TranslateMessage(&m); DispatchMessageA(&m); }
  return 0;
}
