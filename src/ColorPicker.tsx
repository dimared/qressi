import {Button} from '@gravity-ui/uikit';
import {useRef, useState, type PointerEvent} from 'react';
import {
  clamp,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  type HSV,
} from './colors';
import Dialog from './Dialog';

type Mode = 'HEX' | 'RGB' | 'HSL';
const round = (value: number) => String(Math.round(value * 10) / 10);
function fields(hsv: HSV, mode: Mode): string[] {
  const rgb = hsvToRgb(hsv);
  if (mode === 'HEX') return [rgbToHex(rgb)];
  if (mode === 'RGB') return [rgb.r, rgb.g, rgb.b].map((v) => String(Math.round(v)));
  const hsl = rgbToHsl(rgb);
  return [hsl.h, hsl.s, hsl.l].map(round);
}
function parse(values: string[], mode: Mode): HSV | undefined {
  if (mode === 'HEX') {
    const hex = normalizeHex(values[0]);
    return hex ? rgbToHsv(hexToRgb(hex)) : undefined;
  }
  if (values.some((v) => !v.trim() || !Number.isFinite(Number(v)))) return;
  const [a, b, c] = values.map(Number);
  const limits = mode === 'RGB' ? [255, 255, 255] : [360, 100, 100];
  if ([a, b, c].some((v, i) => v < 0 || v > limits[i])) return;
  return rgbToHsv(mode === 'RGB' ? {r: a, g: b, b: c} : hslToRgb({h: a, s: b, l: c}));
}
export default function ColorPicker({
  title,
  value,
  onApply,
  onClose,
}: {
  title: string;
  value: string;
  onApply: (color: string) => void;
  onClose: () => void;
}) {
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value)));
  const [mode, setMode] = useState<Mode>('HEX');
  const [inputs, setInputs] = useState<string[]>([value]);
  const [invalid, setInvalid] = useState(false);
  const plane = useRef<HTMLDivElement>(null);
  const color = rgbToHex(hsvToRgb(hsv));
  function sync(next: HSV, nextMode = mode) {
    setHsv(next);
    setInputs(fields(next, nextMode));
    setInvalid(false);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!plane.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = plane.current.getBoundingClientRect();
    sync({
      ...hsv,
      s: clamp(((event.clientX - rect.left) / rect.width) * 100),
      v: clamp(100 - ((event.clientY - rect.top) / rect.height) * 100),
    });
  }
  const labels = mode === 'HEX' ? ['HEX'] : mode === 'RGB' ? ['R', 'G', 'B'] : ['H', 'S', 'L'];
  return (
    <Dialog title={title} onClose={onClose}>
      <div
        ref={plane}
        className="color-plane"
        style={{backgroundColor: `hsl(${hsv.h},100%,50%)`}}
        role="group"
        aria-label="Насыщенность и яркость"
        tabIndex={0}
        onPointerDown={(event) => {
          if (!event.isPrimary) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            sync({
              ...hsv,
              s: clamp(hsv.s + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
              v: clamp(hsv.v + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)),
            });
          }
        }}
      >
        <span style={{left: `${hsv.s}%`, top: `${100 - hsv.v}%`}} />
      </div>
      <label className="hue-field">
        <span>Оттенок</span>
        <input
          type="range"
          className="hue-slider"
          min="0"
          max="360"
          step="1"
          value={hsv.h}
          aria-label="Оттенок"
          onChange={(event) => sync({...hsv, h: Number(event.target.value)})}
        />
      </label>
      <div className="color-value-preview">
        <i style={{background: color}} />
        <strong>{color.toUpperCase()}</strong>
      </div>
      <div className="segmented color-modes" role="group" aria-label="Формат цвета">
        {(['HEX', 'RGB', 'HSL'] as const).map((item) => (
          <button
            key={item}
            className={mode === item ? 'active' : ''}
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
              sync(hsv, item);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="color-channels">
        {labels.map((label, i) => (
          <label key={label}>
            <span>
              {label}
              {mode === 'HSL' ? (i === 0 ? ' °' : ' %') : ''}
            </span>
            <input
              aria-label={label}
              type={mode === 'HEX' ? 'text' : 'number'}
              inputMode={mode === 'HEX' ? 'text' : 'decimal'}
              value={inputs[i]}
              maxLength={mode === 'HEX' ? 7 : undefined}
              min={mode === 'HEX' ? undefined : 0}
              max={mode === 'RGB' ? 255 : i === 0 ? 360 : 100}
              step={mode === 'RGB' ? 1 : 0.1}
              spellCheck={false}
              onChange={(event) => {
                const next = inputs.map((v, j) => (j === i ? event.target.value : v));
                setInputs(next);
                const parsed = parse(next, mode);
                setInvalid(!parsed);
                if (parsed) setHsv(parsed);
              }}
            />
          </label>
        ))}
      </div>
      {invalid && (
        <p className="field-error" role="alert">
          {mode === 'HEX'
            ? 'HEX: #RGB или #RRGGBB.'
            : mode === 'RGB'
              ? 'Каждый канал RGB: от 0 до 255.'
              : 'H: 0–360°, S и L: 0–100%.'}
        </p>
      )}
      <Button
        className="color-apply"
        view="action"
        size="xl"
        width="max"
        disabled={invalid}
        onClick={() => {
          onApply(color);
          onClose();
        }}
      >
        Применить
      </Button>
    </Dialog>
  );
}
