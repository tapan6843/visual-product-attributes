"use client";

import { FormEvent, useState } from "react";
import type { ExtractionResult } from "@/lib/product-schema";

type FormState = {
  productId: string;
  skuId: string;
  categoryHint: string;
  frontUrl: string;
  backUrl: string;
};

const initialForm: FormState = {
  productId: "DRESS-104",
  skuId: "DRESS-104-BLK",
  categoryHint: "dress",
  frontUrl: "https://example.com/dress-front.jpg",
  backUrl: "https://example.com/dress-back.jpg"
};

export default function Home() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: form.productId,
          skuId: form.skuId,
          categoryHint: form.categoryHint || undefined,
          images: [
            { id: "front", url: form.frontUrl, view: "front" },
            { id: "back", url: form.backUrl, view: "back" }
          ]
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Extraction failed");
      }

      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Hackathon prototype</p>
        <h1>Visual Product Attributes</h1>
        <p>Convert clothing SKU images into structured, confidence-scored visual metadata.</p>
      </header>

      <div className="workspace">
        <form className="panel" onSubmit={submit}>
          <h2>Product input</h2>
          {Object.entries(form).map(([key, value]) => (
            <label key={key}>
              <span>{key.replace(/([A-Z])/g, " $1")}</span>
              <input
                type={key.toLowerCase().includes("url") ? "url" : "text"}
                value={value}
                required={key !== "categoryHint"}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </label>
          ))}
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setForm(initialForm)}>
              Load example
            </button>
            <button type="submit" disabled={loading}>
              {loading ? "Analyzing images…" : "Extract attributes"}
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="panel results" aria-live="polite">
          <h2>Extraction result</h2>
          {!result ? (
            <p className="empty">Submit the example to preview the structured result.</p>
          ) : (
            <>
              <div className="description">
                <span>Generated description</span>
                <p>{result.visualDescription}</p>
              </div>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Attribute</th>
                      <th>Value</th>
                      <th>Status</th>
                      <th>Confidence</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.attributes.map((attribute) => (
                      <tr key={attribute.name}>
                        <td>{attribute.name}</td>
                        <td>{attribute.value ?? "—"}</td>
                        <td>{attribute.status}</td>
                        <td>{Math.round(attribute.confidence * 100)}%</td>
                        <td>{attribute.evidenceImageIds.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>View JSON</summary>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </details>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

