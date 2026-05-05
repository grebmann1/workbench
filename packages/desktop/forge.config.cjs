const fs = require('node:fs');
const path = require('node:path');

const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { MakerDeb } = require('@electron-forge/maker-deb');
const { MakerDMG } = require('@electron-forge/maker-dmg');
const { MakerRpm } = require('@electron-forge/maker-rpm');
const { MakerSquirrel } = require('@electron-forge/maker-squirrel');
const { MakerZIP } = require('@electron-forge/maker-zip');
const { AutoUnpackNativesPlugin } = require('@electron-forge/plugin-auto-unpack-natives');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { PublisherGithub } = require('@electron-forge/publisher-github');

const PRODUCT_NAME = 'Workbench Desktop';
const EXECUTABLE_NAME = 'workbench-desktop';
const APP_BUNDLE_ID = 'com.sftoolkit.desktop';

const repoRoot = path.resolve(__dirname, '../..');
const packagedWebRoot = path.join(repoRoot, 'dist', 'extension');
const desktopResourcesRoot = path.join(__dirname, 'resources');
const desktopIcon =
    process.env.DESKTOP_APP_ICON || path.join(desktopResourcesRoot, 'icons', 'icon');
const windowsIcon = process.env.DESKTOP_WINDOWS_ICON || `${desktopIcon}.ico`;
const linuxIcon = process.env.DESKTOP_LINUX_ICON || `${desktopIcon}.png`;
const packagerIcon =
    process.platform === 'win32' && !fs.existsSync(windowsIcon) ? undefined : desktopIcon;
const artifactName = `${EXECUTABLE_NAME}-${process.platform}-${process.arch}`;

const publishers = process.env.GITHUB_TOKEN
    ? [
          new PublisherGithub({
              authToken: process.env.GITHUB_TOKEN,
              prerelease: process.env.GITHUB_PRERELEASE === 'true',
              repository: {
                  name: process.env.GITHUB_REPOSITORY_NAME || 'workbench',
                  owner: process.env.GITHUB_REPOSITORY_OWNER || 'grebmann',
              },
          }),
      ]
    : [];

module.exports = {
    packagerConfig: {
        asar: true,
        appBundleId: APP_BUNDLE_ID,
        appCategoryType: 'public.app-category.developer-tools',
        executableName: EXECUTABLE_NAME,
        extraResource: [packagedWebRoot, desktopResourcesRoot],
        ignore: [/^\/src($|\/)/, /^\/resources($|\/)/],
        icon: packagerIcon,
        name: PRODUCT_NAME,
        osxNotarize:
            process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID
                ? {
                      appleId: process.env.APPLE_ID,
                      appleIdPassword: process.env.APPLE_ID_PASSWORD,
                      teamId: process.env.APPLE_TEAM_ID,
                  }
                : undefined,
        osxSign:
            process.env.APPLE_SIGN_IDENTITY || process.env.APPLE_TEAM_ID
                ? {
                      identity: process.env.APPLE_SIGN_IDENTITY || undefined,
                      hardenedRuntime: true,
                      signatureFlags: 'library',
                      teamId: process.env.APPLE_TEAM_ID || undefined,
                  }
                : undefined,
    },
    rebuildConfig: {},
    makers: [
        new MakerDMG({ name: artifactName }, ['darwin']),
        new MakerZIP({ name: artifactName }, ['darwin']),
        new MakerSquirrel(
            {
                authors: 'Workbench',
                description: 'Workbench Desktop',
                exe: `${EXECUTABLE_NAME}.exe`,
                name: EXECUTABLE_NAME,
                setupExe: `${artifactName}-setup.exe`,
                setupIcon: fs.existsSync(windowsIcon) ? windowsIcon : undefined,
            },
            ['win32']
        ),
        new MakerDeb(
            {
                options: {
                    bin: EXECUTABLE_NAME,
                    genericName: 'Salesforce administration toolkit',
                    icon: fs.existsSync(linuxIcon) ? linuxIcon : undefined,
                    productName: PRODUCT_NAME,
                },
            },
            ['linux']
        ),
        new MakerRpm(
            {
                options: {
                    bin: EXECUTABLE_NAME,
                    genericName: 'Salesforce administration toolkit',
                    icon: fs.existsSync(linuxIcon) ? linuxIcon : undefined,
                    productName: PRODUCT_NAME,
                },
            },
            ['linux']
        ),
        new MakerZIP({ name: artifactName }, ['linux', 'win32']),
    ],
    publishers,
    plugins: [
        new AutoUnpackNativesPlugin(),
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};
