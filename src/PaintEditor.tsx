import {Button, Select, Switch} from '@gravity-ui/uikit';
import {Check, SlidersHorizontal} from 'lucide-react';
import {useState} from 'react';
import ColorPicker from './ColorPicker';
import {paintCss} from './colors';
import type {QrGradient} from './types';

type Paint = {color: string; gradient?: QrGradient};
export default function PaintEditor({
  title,
  value,
  onChange,
  transparent,
  onTransparentChange,
}: {
  title: string;
  value: Paint;
  onChange: (paint: Paint) => void;
  transparent?: boolean;
  onTransparentChange?: (value: boolean) => void;
}) {
  const [editing, setEditing] = useState<'start' | 'end'>();
  const gradient = value.gradient;
  const presets = onTransparentChange
    ? ['#ffffff', '#fff6e8', '#eaf2ff', '#151515']
    : ['#20241b', '#375ce5', '#7753b9', '#b34061', '#15745a', '#b04f24'];
  return (
    <div className="paint-editor">
      <div className="paint-heading">
        <span className="field-caption">{title}</span>
        {onTransparentChange && (
          <Switch checked={!!transparent} onUpdate={onTransparentChange} size="m">
            Прозрачный
          </Switch>
        )}
      </div>
      {!transparent && (
        <>
          <div className="segmented paint-modes" role="group" aria-label={`Заливка: ${title}`}>
            <button
              className={!gradient ? 'active' : ''}
              aria-pressed={!gradient}
              onClick={() => onChange({color: value.color})}
            >
              Однотонный
            </button>
            <button
              className={gradient ? 'active' : ''}
              aria-pressed={!!gradient}
              onClick={() =>
                onChange({
                  color: value.color,
                  gradient: gradient || {
                    type: 'linear',
                    color: onTransparentChange ? '#eaf2ff' : '#375ce5',
                    rotation: 0,
                  },
                })
              }
            >
              Градиент
            </button>
          </div>
          {!gradient ? (
            <div className="color-row">
              {presets.map((color) => (
                <button
                  key={color}
                  className={`swatch ${value.color === color ? 'selected' : ''}`}
                  style={{background: color}}
                  aria-label={`${title}: ${color}`}
                  aria-pressed={value.color === color}
                  onClick={() => onChange({...value, color})}
                >
                  {value.color === color && <Check size={17} />}
                </button>
              ))}
              <button
                className="paint-color palette-picker"
                onClick={() => setEditing('start')}
                aria-label={`Настроить ${title.toLowerCase()}`}
                title={value.color.toUpperCase()}
              >
                <i style={{background: value.color}} />
                <SlidersHorizontal size={16} />
              </button>
            </div>
          ) : (
            <div className="paint-colors">
              <button
                className="paint-color"
                onClick={() => setEditing('start')}
                aria-label={`Настроить ${title.toLowerCase()}: первый цвет`}
              >
                <i style={{background: value.color}} />
                <span>Цвет 1</span>
                <SlidersHorizontal size={16} />
              </button>
              <button
                className="paint-color"
                onClick={() => setEditing('end')}
                aria-label={`Настроить ${title.toLowerCase()}: второй цвет`}
              >
                <i style={{background: gradient.color}} />
                <span>Цвет 2</span>
                <SlidersHorizontal size={16} />
              </button>
            </div>
          )}
          {gradient && (
            <div className="gradient-options">
              <Select
                size="l"
                width="max"
                value={[gradient.type]}
                options={[
                  {value: 'linear', content: 'Линейный'},
                  {value: 'radial', content: 'Радиальный'},
                ]}
                onUpdate={([type]) =>
                  onChange({...value, gradient: {...gradient, type: type as QrGradient['type']}})
                }
                aria-label={`Тип градиента: ${title}`}
              />
              {gradient.type === 'linear' && (
                <label className="gradient-angle">
                  <span>
                    Угол <output>{gradient.rotation}°</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={gradient.rotation}
                    aria-label={`Угол градиента: ${title}`}
                    onChange={(event) =>
                      onChange({...value, gradient: {...gradient, rotation: Number(event.target.value)}})
                    }
                  />
                </label>
              )}
              <div
                className="gradient-sample"
                style={{background: paintCss(value.color, gradient)}}
                aria-hidden="true"
              />
            </div>
          )}
        </>
      )}
      {editing && (
        <ColorPicker
          title={`${title}${gradient ? (editing === 'start' ? ' · цвет 1' : ' · цвет 2') : ''}`}
          value={editing === 'end' && gradient ? gradient.color : value.color}
          onClose={() => setEditing(undefined)}
          onApply={(color) =>
            onChange(
              editing === 'end' && gradient ? {...value, gradient: {...gradient, color}} : {...value, color},
            )
          }
        />
      )}
    </div>
  );
}
