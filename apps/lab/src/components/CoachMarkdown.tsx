"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function CoachMarkdown({ text }: { text: string }) {
  return (
    <div className="coach-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
