import type { ReactNode } from "react";
import { Icon } from "../components/Icon";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  keyed,
  onKeyframe,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  keyed?: boolean;
  onKeyframe?: () => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n))
              onChange(
                Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)),
              );
          }}
        />
        {suffix && <small>{suffix}</small>}
        {onKeyframe && (
          <button
            title={`Keyframe ${label}`}
            type="button"
            className={`key-button ${keyed ? "active" : ""}`}
            onClick={onKeyframe}
          >
            <Icon name="diamond" size={13} />
          </button>
        )}
      </div>
    </label>
  );
}
export function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  keyed,
  onKeyframe,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
  keyed?: boolean;
  onKeyframe?: () => void;
}) {
  return (
    <div className="slider-field">
      <div>
        <label>{label}</label>
        {onKeyframe ? (
          <button
            title={`Keyframe ${label}`}
            className={`key-button ${keyed ? "active" : ""}`}
            onClick={onKeyframe}
          >
            <Icon name="diamond" size={13} />
          </button>
        ) : null}
        <output>{format ? format(value) : Number(value.toFixed(2))}</output>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (n: boolean) => void;
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" />
    </label>
  );
}
export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="inspector-section">
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: (string | number | { value: string; label: string })[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) =>
          typeof o === "object" ? (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ) : (
            <option key={o} value={o}>
              {o}
            </option>
          ),
        )}
      </select>
    </Field>
  );
}
