import {Capacitor, registerPlugin} from '@capacitor/core';

export type InstalledApp = {name: string; packageName: string};
const InstalledApps = registerPlugin<{
  list: () => Promise<{apps: InstalledApp[]}>;
  icon: (options: {packageName: string}) => Promise<{dataUrl: string}>;
}>('InstalledApps');
const MapLinks = registerPlugin<{open: (options: {uri: string}) => Promise<void>}>('MapLinks');
const appIcons = new Map<string, Promise<string | undefined>>();

export function loadAppIcon(packageName: string): Promise<string | undefined> {
  let icon = appIcons.get(packageName);
  if (!icon) {
    icon = InstalledApps.icon({packageName})
      .then((result) => result.dataUrl)
      .catch(() => undefined);
    appIcons.set(packageName, icon);
  }
  return icon;
}

export async function openMap(uri: string): Promise<void> {
  await MapLinks.open({uri});
}

export async function listInstalledApps(): Promise<InstalledApp[]> {
  if (Capacitor.getPlatform() !== 'android')
    throw new Error('Выбор установленных приложений доступен на Android.');
  return (await InstalledApps.list()).apps;
}

export async function currentCoordinates(): Promise<{latitude: number; longitude: number; accuracy: number}> {
  const {Geolocation} = await import('@capacitor/geolocation');
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions({permissions: ['location']});
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted')
      throw new Error('Доступ к геолокации не разрешён. Можно ввести координаты вручную.');
  }
  const {coords} = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 30000,
  });
  return {latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy};
}
