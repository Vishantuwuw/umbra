// Minimal Windows installer used to verify Umbra adds installed programs to the
// library: copies hello.exe into Program Files and creates a Start Menu shortcut.
// Build: x86_64-w64-mingw32-gcc -O2 -mwindows -o hello-setup.exe installer.c -lole32 -luuid
#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <string.h>

int WINAPI WinMain(HINSTANCE inst, HINSTANCE prev, LPSTR cmd, int show) {
  char src[MAX_PATH], dir[MAX_PATH], dst[MAX_PATH], menu[MAX_PATH], lnk[MAX_PATH];
  GetModuleFileNameA(NULL, src, MAX_PATH);
  strcpy(strrchr(src, '\\') + 1, "hello.exe");

  SHGetFolderPathA(NULL, CSIDL_PROGRAM_FILES, NULL, 0, dir);
  strcat(dir, "\\Hello App");
  CreateDirectoryA(dir, NULL);
  snprintf(dst, MAX_PATH, "%s\\HelloApp.exe", dir);
  if (!CopyFileA(src, dst, FALSE)) return 1;

  SHGetFolderPathA(NULL, CSIDL_COMMON_PROGRAMS, NULL, 0, menu);
  snprintf(lnk, MAX_PATH, "%s\\Hello App.lnk", menu);
  CoInitialize(NULL);
  IShellLinkA *sl;
  IPersistFile *pf;
  if (FAILED(CoCreateInstance(&CLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER, &IID_IShellLinkA, (void **)&sl))) return 2;
  sl->lpVtbl->SetPath(sl, dst);
  sl->lpVtbl->QueryInterface(sl, &IID_IPersistFile, (void **)&pf);
  WCHAR wide[MAX_PATH];
  MultiByteToWideChar(CP_ACP, 0, lnk, -1, wide, MAX_PATH);
  HRESULT hr = pf->lpVtbl->Save(pf, wide, TRUE);
  pf->lpVtbl->Release(pf);
  sl->lpVtbl->Release(sl);
  CoUninitialize();
  return FAILED(hr) ? 3 : 0;
}
