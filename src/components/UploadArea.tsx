"use client";

import { useRef, useState, type DragEvent } from "react";

export interface SelectedFile {
  file: File;
  url: string; // object URL for preview
}

interface UploadAreaProps {
  products: SelectedFile[];
  references: SelectedFile[];
  maxProducts: number;
  onAddProducts: (files: File[]) => void;
  onAddReferences: (files: File[]) => void;
  onRemoveProduct: (index: number) => void;
  onRemoveReference: (index: number) => void;
  onSubmit: () => void;
  submitting: boolean;
  validationError: string | null;
}

function Thumb({ item, onRemove }: { item: SelectedFile; onRemove: () => void }) {
  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={item.file.name} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.file.name}`}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/80 text-xs leading-none text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

function DropZone({
  label,
  hint,
  count,
  countLabel,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  count: string;
  countLabel: string;
  items: SelectedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length) onAdd(files);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setActive(false);
    pick(e.dataTransfer.files);
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">
          {label} <span className="font-normal text-ink-3">{hint}</span>
        </h2>
        <span className="font-mono text-xs text-ink-3">{countLabel}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        role="button"
        tabIndex={0}
        data-active={active}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
        className="dropzone flex cursor-pointer flex-col items-center justify-center px-4 py-8 text-center text-sm text-ink-2"
      >
        <span className="text-xl" aria-hidden>
          +
        </span>
        <span className="mt-1">Drop images here or click to choose</span>
        <span className="mt-1 text-xs text-ink-3">{count}</span>
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((p, i) => (
            <Thumb key={p.url} item={p} onRemove={() => onRemove(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function UploadArea({
  products,
  references,
  maxProducts,
  onAddProducts,
  onAddReferences,
  onRemoveProduct,
  onRemoveReference,
  onSubmit,
  submitting,
  validationError,
}: UploadAreaProps) {
  const canSubmit =
    products.length >= 1 &&
    products.length <= maxProducts &&
    references.length >= 1 &&
    references.length <= 2 &&
    !submitting;

  return (
    <div className="space-y-5 fade-up">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DropZone
          label="Products"
          hint="what to feature"
          count={`JPEG, PNG or WebP · up to ${maxProducts}`}
          countLabel={`${products.length} selected`}
          items={products}
          onAdd={onAddProducts}
          onRemove={onRemoveProduct}
        />
        <DropZone
          label="Reference"
          hint="the look to match"
          count="1 or 2 images: setting, palette, mood"
          countLabel={`${references.length} / 2`}
          items={references}
          onAdd={onAddReferences}
          onRemove={onRemoveReference}
        />
      </div>

      {validationError && (
        <p role="alert" className="rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-warn">
          {validationError}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button type="button" onClick={onSubmit} disabled={!canSubmit} className="btn btn-primary">
          {submitting ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Starting…
            </>
          ) : (
            <>Generate {products.length > 1 ? `${products.length} posts` : "post"}</>
          )}
        </button>
        <p className="text-xs text-ink-3">Nothing is uploaded until you press Generate.</p>
      </div>
    </div>
  );
}
