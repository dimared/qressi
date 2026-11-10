export type ContentKind = 'url' | 'text' | 'wifi' | 'contact' | 'email' | 'phone' | 'geo' | 'app';
export const CODE_FORMATS = [
  'QR_CODE',
  'AZTEC',
  'DATA_MATRIX',
  'PDF_417',
  'CODE_128',
  'CODE_39',
  'CODE_93',
  'CODABAR',
  'EAN_13',
  'EAN_8',
  'ITF',
  'UPC_A',
  'UPC_E',
] as const;
export type CodeFormat = (typeof CODE_FORMATS)[number];
export type ScannedCode = {data: string; format: CodeFormat};
export type Tab = 'scan' | 'create' | 'history';
export type QrGradient = {type: 'linear' | 'radial'; color: string; rotation: number};
export type QrStyle = {
  dots: 'square' | 'rounded' | 'dots';
  color: string;
  background: string;
  logo?: string;
  foregroundGradient?: QrGradient;
  backgroundGradient?: QrGradient;
  transparent?: boolean;
  centerText?: {text: string; color: string};
};
export type Entry = {
  id: string;
  data: string;
  title: string;
  kind: ContentKind;
  source: 'created' | 'scanned';
  date: string;
  favorite: boolean;
  style?: QrStyle;
  codeFormat?: CodeFormat;
};
export type EditorDraft = {
  kind: ContentKind;
  values: Record<string, string>;
  name: string;
  style: QrStyle;
  centerMode: 'none' | 'image' | 'text';
};
export type Notify = (message: string) => void;
export const DEFAULT_STYLE: QrStyle = {dots: 'rounded', color: '#20241b', background: '#ffffff'};
export const LABELS: Record<ContentKind, string> = {
  contact: 'Контакт',
  email: 'Почта',
  phone: 'Телефон',
  text: 'Текст',
  url: 'Ссылка',
  wifi: 'Wi-Fi',
  geo: 'Геолокация',
  app: 'Приложение',
};
