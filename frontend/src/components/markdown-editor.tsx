"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

function insertAround(
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string
): { next: string; nextStart: number; nextEnd: number } {
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
  return { next, nextStart: start + prefix.length, nextEnd: end + prefix.length };
}

function insertLinePrefix(
  value: string,
  pos: number,
  prefix: string
): { next: string; nextStart: number; nextEnd: number } {
  const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  return { next, nextStart: pos + prefix.length, nextEnd: pos + prefix.length };
}

const SEP = <span className="mx-0.5 h-4 w-px self-center bg-[var(--color-border)]" />;

export function MarkdownEditor({ value, onChange, placeholder, rows = 12 }: MarkdownEditorProps) {
  const [preview, setPreview] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function wrap(prefix: string, suffix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const { next, nextStart, nextEnd } = insertAround(value, s, e, prefix, suffix);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = nextStart;
      ta.selectionEnd = nextEnd;
      ta.focus();
    });
  }

  function linePrefix(prefix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s } = ta;
    const { next, nextStart } = insertLinePrefix(value, s, prefix);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = nextStart;
      ta.selectionEnd = nextStart;
      ta.focus();
    });
  }

  const btn =
    "flex h-7 min-w-[26px] items-center justify-center rounded px-1 text-[12.5px] leading-none text-[var(--color-muted)] transition-colors select-none hover:bg-[#efefec] hover:text-[var(--color-ink)]";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] bg-[#fafaf8] px-2 py-1.5">
        <button type="button" onClick={() => wrap("**", "**")} className={btn} title="Жирный">
          <strong>Ж</strong>
        </button>
        <button type="button" onClick={() => wrap("*", "*")} className={btn} title="Курсив">
          <em>К</em>
        </button>
        <button type="button" onClick={() => wrap("~~", "~~")} className={btn} title="Зачёркнутый">
          <s>З</s>
        </button>
        <button type="button" onClick={() => wrap("<u>", "</u>")} className={btn} title="Подчёркнутый">
          <u>П</u>
        </button>
        {SEP}
        <button type="button" onClick={() => linePrefix("# ")} className={btn} title="Заголовок 1">
          H1
        </button>
        <button type="button" onClick={() => linePrefix("## ")} className={btn} title="Заголовок 2">
          H2
        </button>
        <button type="button" onClick={() => linePrefix("### ")} className={btn} title="Заголовок 3">
          H3
        </button>
        {SEP}
        <button type="button" onClick={() => linePrefix("- ")} className={btn} title="Маркированный список">
          •—
        </button>
        <button type="button" onClick={() => linePrefix("1. ")} className={btn} title="Нумерованный список">
          1.
        </button>
        <button type="button" onClick={() => linePrefix("> ")} className={btn} title="Цитата">
          ❝
        </button>
        {SEP}
        <button
          type="button"
          onClick={() => wrap('<div align="center">', "</div>")}
          className={btn}
          title="По центру"
        >
          ≡c
        </button>
        <button
          type="button"
          onClick={() => wrap('<div align="right">', "</div>")}
          className={btn}
          title="По правому краю"
        >
          ≡→
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={`rounded px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
            preview
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "text-[var(--color-muted)] hover:bg-[#efefec] hover:text-[var(--color-ink)]"
          }`}
          title="Переключить просмотр"
        >
          {preview ? "Правка" : "Просмотр"}
        </button>
      </div>

      {preview ? (
        <div
          className="md-preview min-h-[200px] px-3 py-3 text-[13.5px] leading-relaxed text-[var(--color-ink)]"
          style={{ minHeight: `${rows * 1.625 * 13.5}px` }}
        >
          {value ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {value}
            </ReactMarkdown>
          ) : (
            <span className="italic text-[var(--color-faint)]">{placeholder ?? "Пусто"}</span>
          )}
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-y px-3 py-3 text-[13.5px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-faint)] focus:outline-none"
        />
      )}
    </div>
  );
}
