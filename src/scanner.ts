import {Capacitor} from '@capacitor/core';
import {prepareCameraViewport} from './cameraViewport';
import {CODE_FORMATS, type CodeFormat, type ScannedCode} from './types';

export async function decodeImage(blob: Blob, background?: string): Promise<string[]> {
  const {default: jsQR} = await import('jsqr');
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось открыть изображение.'));
      image.src = url;
    });
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
    const found: string[] = [];
    for (const matte of background ? [background] : ['#ffffff', '#000000']) {
      ctx.fillStyle = matte;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 8; i++) {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(pixels.data, canvas.width, canvas.height, {inversionAttempts: 'attemptBoth'});
        if (!code) break;
        if (code.data && !found.includes(code.data)) found.push(code.data);
        const points = [
          code.location.topLeftCorner,
          code.location.topRightCorner,
          code.location.bottomLeftCorner,
          code.location.bottomRightCorner,
        ];
        const x = Math.min(...points.map((p) => p.x)) - 6;
        const y = Math.min(...points.map((p) => p.y)) - 6;
        ctx.fillStyle = matte;
        ctx.fillRect(
          x,
          y,
          Math.max(...points.map((p) => p.x)) - x + 6,
          Math.max(...points.map((p) => p.y)) - y + 6,
        );
      }
      if (found.length) break;
    }
    return found;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readCodesFromImage(blob: Blob): Promise<ScannedCode[]> {
  if (!Capacitor.isNativePlatform())
    return (await decodeImage(blob)).map((data) => ({data, format: 'QR_CODE'}));
  // The inline camera is stopped by Scan's busy state before reading a file.
  // Wait for its native teardown so both operations cannot share ML Kit state.
  await nativeSessionEnd;
  const [{BarcodeFormat, BarcodeScanner}, {Directory, Filesystem}] = await Promise.all([
    import('@capacitor-mlkit/barcode-scanning'),
    import('@capacitor/filesystem'),
  ]);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const path = `scan-${crypto.randomUUID()}.image`;
  const {uri} = await Filesystem.writeFile({path, data, directory: Directory.Cache});
  try {
    const {barcodes} = await BarcodeScanner.readBarcodesFromImage({
      path: uri,
      formats: Object.values(BarcodeFormat),
    });
    const codes = barcodes
      .filter((code) => !!code.rawValue)
      .map((code) => ({
        data: code.rawValue!,
        format: CODE_FORMATS.includes(code.format as CodeFormat) ? (code.format as CodeFormat) : 'QR_CODE',
      }));
    // Some native image decoders flatten PNG alpha against black. A QR with
    // dark modules and transparent background then needs a light matte.
    if (!codes.length && blob.type === 'image/png')
      return (await decodeImage(blob)).map((data) => ({data, format: 'QR_CODE'}));
    return codes;
  } finally {
    await Filesystem.deleteFile({path, directory: Directory.Cache}).catch(() => {});
  }
}

export type CameraSession = {
  stop: () => Promise<void>;
  toggleTorch: () => Promise<void>;
  hasTorch: boolean;
  zoom?: {min: number; max: number; value: number; step: number};
  setZoom?: (value: number) => Promise<void>;
};
let nativeSessionEnd = Promise.resolve();
export function waitForCameraStop(): Promise<void> {
  return nativeSessionEnd;
}

export class CameraPermissionError extends Error {}

export async function ensureCameraPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('BarcodeScanner'))
    throw new Error('Модуль камеры недоступен. Установите полную APK приложения.');
  const {BarcodeScanner} = await import('@capacitor-mlkit/barcode-scanning');
  let {camera} = await BarcodeScanner.checkPermissions();
  if (camera !== 'granted' && camera !== 'limited') ({camera} = await BarcodeScanner.requestPermissions());
  if (camera !== 'granted' && camera !== 'limited')
    throw new CameraPermissionError('Разрешите приложению доступ к камере в настройках Android.');
}

export async function openCameraSettings(): Promise<void> {
  const {BarcodeScanner} = await import('@capacitor-mlkit/barcode-scanning');
  await BarcodeScanner.openSettings();
}

export async function startCamera(
  video: HTMLVideoElement | null,
  onFound: (code: ScannedCode) => void,
  onError: (error: string) => void,
  signal: AbortSignal,
  viewport?: HTMLElement | null,
): Promise<CameraSession> {
  if (Capacitor.isNativePlatform()) {
    const previous = nativeSessionEnd;
    let finish!: () => void;
    nativeSessionEnd = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await previous;
    if (signal.aborted) {
      finish();
      return {stop: async () => {}, toggleTorch: async () => {}, hasTorch: false};
    }
    const {BarcodeFormat, BarcodeScanner, LensFacing} = await import(
      '@capacitor-mlkit/barcode-scanning'
    ).catch((error) => {
      finish();
      throw error;
    });
    let stopped = false;
    let started = false;
    let stopping: Promise<void> | undefined;
    let preview: ReturnType<typeof prepareCameraViewport> | undefined;
    const listeners: {remove: () => Promise<void>}[] = [];
    const abort = () => void stop().catch(() => {});
    const stop = () => {
      if (stopping) return stopping;
      stopped = true;
      signal.removeEventListener('abort', abort);
      stopping = (async () => {
        try {
          preview?.stop();
          if (started) {
            started = false;
            await BarcodeScanner.stopScan();
          }
        } finally {
          document.documentElement.classList.remove('native-scanning');
          document.body.classList.remove('native-scanning');
          try {
            await Promise.allSettled(listeners.map((listener) => listener.remove()));
            listeners.length = 0;
          } finally {
            finish();
          }
        }
      })();
      return stopping;
    };
    try {
      preview = viewport ? prepareCameraViewport(viewport) : undefined;
      await ensureCameraPermission();
      if (signal.aborted) {
        await stop();
        return {stop, toggleTorch: async () => {}, hasTorch: false};
      }
      listeners.push(
        await BarcodeScanner.addListener('barcodesScanned', ({barcodes}) => {
          if (!stopped && !signal.aborted && barcodes[0]?.rawValue)
            onFound({
              data: barcodes[0].rawValue,
              format: CODE_FORMATS.includes(barcodes[0].format as CodeFormat)
                ? (barcodes[0].format as CodeFormat)
                : 'QR_CODE',
            });
        }),
      );
      listeners.push(
        await BarcodeScanner.addListener('scanError', ({message}) => {
          if (!signal.aborted) onError(message || 'Не удалось запустить камеру.');
        }),
      );
      if (signal.aborted) {
        await stop();
        return {stop, toggleTorch: async () => {}, hasTorch: false};
      }
      document.documentElement.classList.add('native-scanning');
      document.body.classList.add('native-scanning');
      started = true;
      await BarcodeScanner.startScan({formats: Object.values(BarcodeFormat), lensFacing: LensFacing.Back});
      // Cancellation owns teardown directly, including while optional camera
      // controls are still loading. Do not wait for the session to be returned.
      signal.addEventListener('abort', abort, {once: true});
      if (signal.aborted) {
        await stop();
        return {stop, toggleTorch: async () => {}, hasTorch: false};
      }
      if (preview && !signal.aborted) await preview.start();
      if (signal.aborted) {
        await stop();
        return {stop, toggleTorch: async () => {}, hasTorch: false};
      }
      const {available} = await BarcodeScanner.isTorchAvailable();
      let zoom: CameraSession['zoom'];
      try {
        const [min, max, current] = await Promise.all([
          BarcodeScanner.getMinZoomRatio(),
          BarcodeScanner.getMaxZoomRatio(),
          BarcodeScanner.getZoomRatio(),
        ]);
        if (max.zoomRatio > min.zoomRatio)
          zoom = {min: min.zoomRatio, max: Math.min(8, max.zoomRatio), value: current.zoomRatio, step: 0.1};
      } catch {
        /* Camera stays usable on devices without zoom controls. */
      }
      return {
        stop,
        toggleTorch: () => BarcodeScanner.toggleTorch(),
        hasTorch: available,
        zoom,
        setZoom: (zoomRatio) => BarcodeScanner.setZoomRatio({zoomRatio}),
      };
    } catch (error) {
      await stop().catch(() => {});
      throw error;
    }
  }

  if (!video) throw new Error('Не удалось подготовить экран камеры. Попробуйте открыть её ещё раз.');
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('Камера недоступна. Откройте приложение по HTTPS или выберите фотографию.');
  const [{default: jsQR}, stream] = await Promise.all([
    import('jsqr'),
    navigator.mediaDevices.getUserMedia({
      video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}},
      audio: false,
    }),
  ]);
  let timer = 0;
  let stopped = false;
  const abort = () => void stop();
  const stop = async () => {
    stopped = true;
    signal.removeEventListener('abort', abort);
    clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.style.transform = '';
  };
  signal.addEventListener('abort', abort, {once: true});
  if (signal.aborted) {
    await stop();
    return {stop, toggleTorch: async () => {}, hasTorch: false};
  }
  try {
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
    let digitalZoom = 1;
    const track = stream.getVideoTracks()[0];
    const hardwareZoom = (
      track.getCapabilities?.() as
        | (MediaTrackCapabilities & {zoom?: {min: number; max: number; step: number}})
        | undefined
    )?.zoom;
    const tick = () => {
      if (stopped || signal.aborted) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 960 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const width = video.videoWidth / digitalZoom,
          height = video.videoHeight / digitalZoom;
        ctx.drawImage(
          video,
          (video.videoWidth - width) / 2,
          (video.videoHeight - height) / 2,
          width,
          height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(frame.data, canvas.width, canvas.height, {inversionAttempts: 'attemptBoth'});
        if (result?.data) {
          onFound({data: result.data, format: 'QR_CODE'});
          return;
        }
      }
      timer = window.setTimeout(tick, 130);
    };
    tick();
    const zoom = hardwareZoom
      ? {...hardwareZoom, value: (track.getSettings() as MediaTrackSettings & {zoom?: number}).zoom || 1}
      : {min: 1, max: 4, value: 1, step: 0.1};
    return {
      stop,
      toggleTorch: async () => {},
      hasTorch: false,
      zoom,
      setZoom: async (value) => {
        if (stopped || signal.aborted) return;
        if (hardwareZoom)
          await track.applyConstraints({advanced: [{zoom: value} as MediaTrackConstraintSet]});
        else {
          digitalZoom = value;
          video.style.transform = `scale(${value})`;
        }
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

export function cameraError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Разрешите доступ к камере или выберите фотографию.';
    if (error.name === 'NotFoundError') return 'Камера не найдена. Можно прочитать QR из картинки.';
    if (error.name === 'NotReadableError') return 'Камера занята другим приложением.';
  }
  return error instanceof Error ? error.message : 'Не удалось открыть камеру.';
}
