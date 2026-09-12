"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import UploadArea, { type SelectedFile } from "@/components/UploadArea";

/**
 * Upload form: collects product + reference files, POSTs the batch and
 * navigates to its page. Object URLs are released on removal and unmount.
 */
export default function UploadForm({ maxProducts }: { maxProducts: number }) {
  const router = useRouter();
  const [products, setProducts] = useState<SelectedFile[]>([]);
  const [references, setReferences] = useState<SelectedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filesRef = useRef({ products, references });
  useEffect(() => {
    filesRef.current = { products, references };
  }, [products, references]);
  useEffect(() => {
    return () => {
      const { products, references } = filesRef.current;
      [...products, ...references].forEach((f) => URL.revokeObjectURL(f.url));
    };
  }, []);

  const toSelected = (files: File[]) => files.map((file) => ({ file, url: URL.createObjectURL(file) }));

  const addProducts = (files: File[]) => {
    setProducts((prev) => {
      const next = [...prev, ...toSelected(files)];
      setError(next.length > maxProducts ? `At most ${maxProducts} product images per batch.` : null);
      return next;
    });
  };

  const addReferences = (files: File[]) => {
    setReferences((prev) => {
      const next = [...prev, ...toSelected(files)];
      setError(next.length > 2 ? "At most 2 reference images are allowed." : null);
      return next;
    });
  };

  const removeAt = (setter: typeof setProducts) => (index: number) => {
    setter((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((_, i) => i !== index);
    });
    setError(null);
  };

  const submit = async () => {
    if (products.length < 1) return setError("Add at least one product image.");
    if (products.length > maxProducts) return setError(`At most ${maxProducts} product images per batch.`);
    if (references.length < 1 || references.length > 2) return setError("Add 1 or 2 reference images.");

    setError(null);
    setSubmitting(true);
    const fd = new FormData();
    products.forEach((p) => fd.append("products", p.file));
    references.forEach((r) => fd.append("references", r.file));

    try {
      const res = await fetch("/api/batch", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { batchId?: string; error?: string };
      if (!res.ok || !body.batchId) {
        setError(body.error ?? `Request failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      router.push(`/b/${body.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error submitting batch.");
      setSubmitting(false);
    }
  };

  return (
    <UploadArea
      products={products}
      references={references}
      onAddProducts={addProducts}
      onAddReferences={addReferences}
      onRemoveProduct={removeAt(setProducts)}
      onRemoveReference={removeAt(setReferences)}
      onSubmit={submit}
      submitting={submitting}
      validationError={error}
    />
  );
}
