// Creates a Direct3D 11 device and swap chain at feature level 11_0, the way Unity and
// most current games start, draws a few frames, and prints the adapter. Exits 0 on
// success; the smoke test runs it with Wine's built-in Direct3D and with DXVK.
// Build: x86_64-w64-mingw32-gcc -O2 -s -o d3d11test.exe d3d11test.c -ld3d11 -ldxgi -lgdi32
#define COBJMACROS
#define INITGUID
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <stdio.h>

int main(void) {
  WNDCLASSW wc = { 0 };
  wc.lpfnWndProc = DefWindowProcW;
  wc.lpszClassName = L"d3d11test";
  RegisterClassW(&wc);
  HWND w = CreateWindowW(L"d3d11test", L"Umbra D3D11 test", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 100, 100, 640, 360, 0, 0, 0, 0);
  DXGI_SWAP_CHAIN_DESC sd = { 0 };
  sd.BufferCount = 2;
  sd.BufferDesc.Width = 640;
  sd.BufferDesc.Height = 360;
  sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
  sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
  sd.OutputWindow = w;
  sd.SampleDesc.Count = 1;
  sd.Windowed = TRUE;
  sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;
  D3D_FEATURE_LEVEL want[] = { D3D_FEATURE_LEVEL_11_0 }, got = 0;
  ID3D11Device *dev = NULL;
  ID3D11DeviceContext *ctx = NULL;
  IDXGISwapChain *sc = NULL;
  HRESULT hr = D3D11CreateDeviceAndSwapChain(NULL, D3D_DRIVER_TYPE_HARDWARE, NULL, 0, want, 1, D3D11_SDK_VERSION, &sd, &sc, &dev, &got, &ctx);
  if (FAILED(hr)) { printf("D3D11 FAIL: D3D11CreateDeviceAndSwapChain hr=0x%08lx\n", (unsigned long)hr); return 2; }
  IDXGIDevice *xd = NULL;
  IDXGIAdapter *ad = NULL;
  DXGI_ADAPTER_DESC desc = { 0 };
  if (SUCCEEDED(ID3D11Device_QueryInterface(dev, &IID_IDXGIDevice, (void **)&xd)) && SUCCEEDED(IDXGIDevice_GetAdapter(xd, &ad))) IDXGIAdapter_GetDesc(ad, &desc);
  ID3D11Texture2D *bb = NULL;
  ID3D11RenderTargetView *rtv = NULL;
  hr = IDXGISwapChain_GetBuffer(sc, 0, &IID_ID3D11Texture2D, (void **)&bb);
  if (SUCCEEDED(hr)) hr = ID3D11Device_CreateRenderTargetView(dev, (ID3D11Resource *)bb, NULL, &rtv);
  if (FAILED(hr)) { printf("D3D11 FAIL: render target hr=0x%08lx\n", (unsigned long)hr); return 3; }
  float color[4] = { 0.45f, 0.3f, 0.95f, 1 };
  for (int i = 0; i < 60; i++) {
    MSG m;
    while (PeekMessageW(&m, 0, 0, 0, PM_REMOVE)) DispatchMessageW(&m);
    ID3D11DeviceContext_OMSetRenderTargets(ctx, 1, &rtv, NULL);
    ID3D11DeviceContext_ClearRenderTargetView(ctx, rtv, color);
    hr = IDXGISwapChain_Present(sc, 1, 0);
    if (FAILED(hr)) { printf("D3D11 FAIL: Present hr=0x%08lx\n", (unsigned long)hr); return 4; }
    Sleep(16);
  }
  printf("D3D11 OK: feature level 0x%x on %ls\n", (unsigned)got, desc.Description);
  return 0;
}
