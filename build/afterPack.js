// After electron-builder lays down Umbra.app on macOS:
//   1. Flip Electron's fuses to lock down the runtime (anti-tamper /
//      anti-reverse-engineering). This rewrites the Electron binary, so it
//      must happen BEFORE signing.
//   2. Ad-hoc sign the app so it launches on Apple Silicon without a paid
//      Developer ID.
// Both are skipped when not packaging for macOS on a Mac.
const { execFileSync } = require('child_process');
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  // Lock the runtime down:
  // - RunAsNode off: ELECTRON_RUN_AS_NODE can't turn Umbra into a general
  //   Node.js interpreter that runs arbitrary scripts.
  // - NodeOptions / NodeCliInspect off: no NODE_OPTIONS injection and no
  //   --inspect debugger attaching to the main process.
  // - CookieEncryption on: the session cookie store is encrypted at rest.
  // - OnlyLoadAppFromAsar on: the app is loaded only from the packed
  //   app.asar, so a swapped-in unpacked app folder won't run.
  await flipFuses(appPath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: false,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
