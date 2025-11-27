import { useEffect, useState } from "react";
import ThinkingIndicator from "./ThinkingIndicator";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

// Hook to track transparency mode
function useTransparencyMode() {
  const [isTransparent, setIsTransparent] = useState(false);

  useEffect(() => {
    const checkTransparency = () => {
      setIsTransparent(document.body.classList.contains('transparent-mode'));
    };

    // Initial check
    checkTransparency();

    // Watch for class changes
    const observer = new MutationObserver(checkTransparency);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  return isTransparent;
}

const transparentOneDark: Record<string, any> = Object.entries(oneDark).reduce(
  (acc, [selector, style]) => {
    acc[selector] = { ...(style as any), background: "transparent" };
    return acc;
  },
  {} as Record<string, any>
);

export const MarkdownSection = ({
  content,
  isLoading,
}: {
  content: string | null;
  isLoading: boolean;
}) => {
  const isTransparent = useTransparencyMode();

  return (
    <div className="space-y-2">
      {isLoading && !content ? (
        // <p className="text-xs text-muted-foreground animate-pulse">
        //   Generating response...
        // </p>
        <div className="w-full flex flex-col items-center justify-center py-12">
          <ThinkingIndicator size="lg" />
        </div>
      ) : content ? (
        <div className="w-full text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              h1: ({ node, ...props }) => (
                <h1 className="text-lg font-bold mb-3 text-white" {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h2 className="text-base font-bold mb-2 text-white" {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 className="text-sm font-bold mb-2 text-white/90" {...props} />
              ),
              p: ({ node, ...props }) => (
                <p className="mb-3 text-sm leading-relaxed text-white/80" {...props} />
              ),
              ul: ({ node, ...props }) => (
                <ul className="list-disc ml-6 mb-3 text-sm text-white/80" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="list-decimal ml-6 mb-3 text-sm text-white/80" {...props} />
              ),
              li: ({ node, ...props }) => (
                <li className="mb-2 text-sm text-white/80" {...props} />
              ),
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto my-4">
                  <table 
                    className={`min-w-full rounded-lg ${isTransparent ? 'border-transparent' : 'border border-white/20'}`}
                    style={isTransparent ? { border: 'none' } : {}}
                    {...props} 
                  />
                </div>
              ),
              thead: ({ node, ...props }) => (
                <thead 
                  className={isTransparent ? '' : 'bg-white/10'} 
                  style={isTransparent ? { background: 'transparent' } : {}}
                  {...props} 
                />
              ),
              tbody: ({ node, ...props }) => <tbody {...props} />,
              tr: ({ node, ...props }) => (
                <tr 
                  className={isTransparent ? '' : 'border-b border-white/20'}
                  style={isTransparent ? { borderBottom: 'none' } : {}}
                  {...props} 
                />
              ),
              th: ({ node, ...props }) => (
                <th
                  className="px-4 py-3 text-left text-white font-medium"
                  {...props}
                />
              ),
              td: ({ node, ...props }) => (
                <td 
                  className={`px-4 py-3 text-white/80 ${isTransparent ? '' : 'border-r border-white/20 last:border-r-0'}`}
                  style={isTransparent ? { borderRight: 'none' } : {}}
                  {...props} 
                />
              ),
              pre: ({ node, ...props }) => (
                <pre
                  className={`overflow-x-auto rounded-lg text-white/90 text-sm whitespace-pre p-4 code-block-scroll mb-4 ${isTransparent ? '' : 'bg-white/10 border border-white/20'}`}
                  style={isTransparent ? { background: 'transparent', border: 'none' } : {}}
                  {...props}
                />
              ),
              code: ({ node, inline, className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || "");

                return !inline && match ? (
                  <SyntaxHighlighter
                    style={transparentOneDark}
                    customStyle={{
                      margin: 0,
                      padding: 0,
                      paddingBottom: "8px",
                      background: "transparent",
                    }}
                    PreTag="div"
                    language={match[1]}
                    {...props}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code 
                    className={`font-mono text-sm px-2 py-1 rounded text-white/90 ${isTransparent ? '' : 'bg-white/10'}`}
                    style={isTransparent ? { background: 'transparent' } : {}}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
};
