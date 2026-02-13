import { Streamdown } from "streamdown";
import { CodeBlock } from "@/components/CodeBlock";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { smartFixLatex } from "@/lib/latexUtils";
import { detectLanguage } from "@/lib/languageDetector";

interface SafeMarkdownProps {
  children: string;
  className?: string;
}

/**
 * SafeMarkdown组件
 * 
 * 用于安全地渲染Markdown内容，避免HTML嵌套错误（如<p>包含<div>）
 * 
 * 特性：
 * - 支持代码块复制和下载
 * - 支持GitHub Flavored Markdown
 * - 支持LaTeX数学公式渲染（行内：$...$，块级：$$...$$）
 * - 支持Prism.js语法高亮
 * 
 * 使用方法：
 * <SafeMarkdown>{markdownContent}</SafeMarkdown>
 */
export function SafeMarkdown({ children, className = "" }: SafeMarkdownProps) {
  // 自动修复未被$包裹的LaTeX命令
  const fixedContent = smartFixLatex(children);
  
  // 处理流式输出中未闭合的代码块
  // 检测是否有未闭合的 ``` 代码块，如果有则补上闭合标记
  const processedContent = useMemo(() => {
    let text = fixedContent;
    // 计算 ``` 出现的次数
    const fenceMatches = text.match(/^```/gm);
    const fenceCount = fenceMatches ? fenceMatches.length : 0;
    // 如果 ``` 出现奇数次，说明有未闭合的代码块
    if (fenceCount % 2 !== 0) {
      text = text + "\n```";
    }
    return text;
  }, [fixedContent]);
  
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // 修复段落渲染，避免<p>内嵌套块级元素
          p({ node, children, ...props }) {
            return <div className="markdown-paragraph whitespace-pre-wrap break-words max-w-full overflow-wrap-anywhere" style={{ wordBreak: 'break-word' }} {...props}>{children}</div>;
          },
          // 确保加粗和斜体正常渲染
          strong({ node, children, ...props }) {
            return <strong className="font-bold" {...props}>{children}</strong>;
          },
          em({ node, children, ...props }) {
            return <em className="italic" {...props}>{children}</em>;
          },
          code({ node, className, children, ...props }: any) {
            const inline = !className; // 内联代码没有className
            const match = /language-(\w+)/.exec(className || "");
            let language = match ? match[1] : "";
            const codeContent = String(children).replace(/\n$/, "");
            
            // 如果没有指定语言或语言为text，尝试自动检测
            if (!language || language === "text") {
              const detectedLang = detectLanguage(codeContent);
              if (detectedLang) {
                language = detectedLang;
              }
            }
            
            // 解析高亮行语法：```language{1,3-5}
            const highlightMatch = /language-\w+\{([\d,-]+)\}/.exec(className || "");
            const highlightLines = highlightMatch ? highlightMatch[1] : undefined;
            
            return !inline ? (
              <CodeBlock language={language} highlightLines={highlightLines}>{codeContent}</CodeBlock>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
