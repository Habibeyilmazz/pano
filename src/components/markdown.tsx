"use client";
import Link from "next/link";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { handleOf, isInternalHref } from "@/lib/links";
import type { TaskDetail } from "@/server/tasks";

type Person = TaskDetail["people"][number];

/** Markdown without raw HTML (react-markdown escapes it); @handles become profile links. */
export default function Markdown({ text, people }: { text: string; people: Person[] }) {
  const withMentions = useMemo(
    () =>
      text.replace(/(^|[^\w.])@([\w.-]*\w)/g, (all, pre: string, h: string) => {
        const p = people.find((x) => handleOf(x.email) === h.toLowerCase());
        return p ? `${pre}[@${p.name.replace(/[\\[\]()*_`]/g, "\\$&")}](/team/${p.id})` : all;
      }),
    [text, people],
  );
  return (
    <div className="prose-pano">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            isInternalHref(href) ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {withMentions}
      </ReactMarkdown>
    </div>
  );
}

