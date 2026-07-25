export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded border border-neutral-300 bg-white px-3 py-2.5">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border border-neutral-300 bg-transparent p-0"
        />
        <span className="w-20 font-mono text-xs text-neutral-500">
          {value}
        </span>
      </span>
    </label>
  );
}
