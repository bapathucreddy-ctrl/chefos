export default function SliderControl({ accessibilityLabel, minimumValue, maximumValue, step, value, onValueChange, disabled }) {
  return <input type="range" aria-label={accessibilityLabel} min={minimumValue} max={maximumValue} step={step} value={value} disabled={disabled}
    onChange={(event) => onValueChange(Number(event.target.value))} style={{ width: "100%", minHeight: 44, margin: 0, accentColor: "#F2B134", cursor: "pointer" }} />;
}
