"use client";

export default function PrintButton({ label = "列印" }: { label?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      🖨️ {label}
    </button>
  );
}
