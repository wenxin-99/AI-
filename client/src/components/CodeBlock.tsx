import { useState, useEffect, useRef, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Prism from "prismjs";
import { VirtualCodeBlock } from "./VirtualCodeBlock";

// 导入Prism.js核心样式和高亮行插件
import "prismjs/themes/prism-tomorrow.css"; // 使用tomorrow主题，提供彩色语法高亮
import "prismjs/plugins/line-highlight/prism-line-highlight.css";
import "prismjs/plugins/line-highlight/prism-line-highlight";

// 导入常用编程语言支持
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
// import "prismjs/components/prism-php"; // 暂时禁用PHP，因为tokenizePlaceholders bug导致所有代码块高亮失败
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";

// 移动开发语言
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-objectivec";

// 数据科学语言
import "prismjs/components/prism-r";
import "prismjs/components/prism-matlab";
import "prismjs/components/prism-julia";

// 其他常用语言
import "prismjs/components/prism-scala";
import "prismjs/components/prism-perl";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-haskell";

// 修复Prism.js的Python语言定义bug
// 某些版本的Prism在string-interpolation的inside.rest属性缺失，导致高亮失败
// 解决方案：完全移除string-interpolation功能，保留其他Python语法高亮
if (Prism.languages.python && (Prism.languages.python as any)['string-interpolation']) {
  const stringInterp = (Prism.languages.python as any)['string-interpolation'];
  if (stringInterp.inside && !stringInterp.inside.rest) {
    // 删除有问题的string-interpolation，保留其他功能
    delete (Prism.languages.python as any)['string-interpolation'];
    console.log('[CodeBlock] Removed buggy string-interpolation from Python language definition');
  }
}

interface CodeBlockProps {
  language?: string;
  children: string;
  highlightLines?: string; // 高亮行范围，例如："1,3-5,7"
}

export const CodeBlock = memo(function CodeBlock({ language = "text", children, highlightLines }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [contentHash, setContentHash] = useState(""); // 用于检测内容变化
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null); // 当前高亮的行号
  // 移动端强制隐藏行号列，根据GPT参考建议
  const [showLineNumbers, setShowLineNumbers] = useState(typeof window !== 'undefined' && window.innerWidth >= 768); // 只在桌面端显示行号
  const codeRef = useRef<HTMLElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 语言映射：将常见别名映射到Prism支持的语言
  const languageMap: Record<string, string> = {
    // 基础语言
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    sh: "bash",
    yml: "yaml",
    md: "markdown",
    
    // 移动开发语言
    kt: "kotlin",
    objc: "objectivec",
    "objective-c": "objectivec",
    "obj-c": "objectivec",
    
    // 数据科学语言
    // R和MATLAB不需要别名，直接使用小写即可
    
    // 其他语言
    hs: "haskell",
  };

  const prismLanguage = useMemo(() => languageMap[language] || language, [language]);

  // 计算代码行数（使用useMemo缓存）
  const lineCount = useMemo(() => children.split('\n').length, [children]);
  const shouldShowCollapseButton = lineCount > 20;
  const isLongCode = lineCount > 100; // 超过100行认为是超长代码
  const useVirtualScroll = lineCount > 1000; // 超过1000行启用虚拟滚动

  // 计算行高（根据字体大小）
  const lineHeight = typeof window !== 'undefined' && window.innerWidth <= 768 ? 18 : 21; // 移动端11px字体约18px行高，桌面端14px字体约21px行高
  const containerHeight = isCollapsed ? 300 : 600; // 与原有max-height保  // 使用IntersectionObserver延迟加载（减少初始渲染压力）
  useEffect(() => {
    if (!containerRef.current) return;

    // 立即设置为可见，确保代码块能立即高亮
    setIsVisible(true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
          }
        });
      },
      {
        rootMargin: '100px', // 提前100px开始加载
        threshold: 0.1
      }
    );

    observer.observe(containerRef.current);

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [isVisible]);

  // 检测内容变化，重置高亮状态
  useEffect(() => {
    const newHash = children.slice(0, 100); // 使用前100个字符作为hash
    if (newHash !== contentHash) {
      setContentHash(newHash);
      setIsHighlighted(false); // 内容变化时重置高亮状态
    }
  }, [children, contentHash])  // 延迟高亮机制（添加防抖减少闪烁）
  useEffect(() => {
    if (!isVisible) return;
    // 如果已经高亮过，不再重复高亮（避免流式输出时闪烁）
    if (isHighlighted) return;

    const loadAndHighlight = () => {
      if (!prismLanguage || prismLanguage === "text") {
        setIsHighlighted(true);
        return;
      }

      setIsHighlighting(true);

      try {
        // 所有语言支持已在顶部静态导入，直接使用Prism.highlightElement
        // 对于超长代码，使用requestIdleCallback延迟高亮
        if (isLongCode && 'requestIdleCallback' in window) {
          requestIdleCallback(() => {
            if (codeRef.current) {
              Prism.highlightElement(codeRef.current);
              setIsHighlighted(true);
              setIsHighlighting(false);
            }
          }, { timeout: 2000 });
        } else {
          // 短代码直接高亮
          if (codeRef.current) {
            Prism.highlightElement(codeRef.current);
            setIsHighlighted(true);
            setIsHighlighting(false);
          }
        }
      } catch (error) {
        console.warn(`Failed to highlight code with Prism: ${prismLanguage}`, error);
        setIsHighlighted(true);
        setIsHighlighting(false);
      }
    };

    // 添加防抖：延迟300ms再高亮，等待流式输出完成
    const debounceTimer = setTimeout(() => {
      loadAndHighlight();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [isVisible, prismLanguage, isLongCode, children, isHighlighted]); // 添加isHighlighted依赖

  // 初始化时自动折叠超过20行的代码（移动端不自动折叠）
  useEffect(() => {
    if (shouldShowCollapseButton) {
      // 检测是否为移动端
      const isMobile = window.innerWidth < 768;
      // 移动端默认展开，桌面端默认折叠
      setIsCollapsed(!isMobile);
    }
  }, [shouldShowCollapseButton]);

  // 复制代码
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      toast.success("代码已复制");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("复制失败");
    }
  };

  // 下载为补丁文件
  const handleDownload = () => {
    try {
      let content = children;
      let filename = `code-${Date.now()}`;
      let ext = prismLanguage || "txt";

      // 如果是diff/patch类型，确保格式正确
      if (prismLanguage === "diff" || prismLanguage === "patch") {
        ext = "patch";
        filename = `fix-${Date.now()}`;

        // 如果没有diff头部，添加一个通用头部
        if (!content.startsWith("---") && !content.startsWith("diff")) {
          content = `--- a/file\n+++ b/file\n${content}`;
        }
      }

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.${ext}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`文件已下载：${filename}.${ext}`);
    } catch (error) {
      toast.error("下载失败");
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="relative group my-1.5 md:my-2"
      style={{ 
        minHeight: isHighlighting ? '100px' : 'auto', // 高亮时保持最小高度，避免跳动
        contain: 'layout style', // CSS containment优化，隔离布局和样式变化
        willChange: isHighlighting ? 'height' : 'auto' // 提示浏览器优化高度变化
      }}
    >
      {/* Mac终端风格头部栏 */}
      <div className="code-block-header flex items-center justify-between px-3 md:px-4 py-2 md:py-2.5 bg-[#1e1e1e] dark:bg-[#1a1a1a] rounded-t-lg border-b border-white/5">
        {/* 左侧：Mac风格控制点 + 语言标签 */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mac风格控制点（红/黄/绿） */}
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#27c93f]" />
          </div>
          
          {/* 语言标签 */}
          <span className="text-xs md:text-sm font-mono font-medium text-gray-300">
            {prismLanguage || "text"}
          </span>
          
          {/* 额外信息 */}
          {shouldShowCollapseButton && (
            <span className="hidden md:inline text-xs text-gray-500">
              {lineCount} lines
            </span>
          )}
          {isHighlighting && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
            </span>
          )}
        </div>
        
        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-1 md:gap-2">
          {shouldShowCollapseButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-7 md:h-8 px-2 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/10"
            >
              {isCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 md:h-8 px-2 md:px-3 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/10"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 md:mr-1" />
                <span className="hidden md:inline">已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 md:mr-1" />
                <span className="hidden md:inline">复制</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="hidden md:flex h-8 px-3 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/10"
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            下载
          </Button>
        </div>
      </div>

      {/* 代码内容 - 根据代码长度选择普通渲染或虚拟滚动 */}
      <div className="relative">
        {useVirtualScroll && isVisible ? (
          // 超长代码：使用虚拟滚动
          <div className="bg-black/5 dark:bg-white/5 rounded-b-md">
            <VirtualCodeBlock
              code={children}
              language={prismLanguage}
              lineHeight={lineHeight}
              containerHeight={containerHeight}
              showLineNumbers={showLineNumbers}
              onLineClick={(lineNumber) => {
                setHighlightedLine(lineNumber);
              }}
            />
          </div>
        ) : (
          // 普通代码：使用原有渲染方式，添加行号列
          <>
            <div 
              className={`
                !mt-0 !mb-0 !rounded-t-none bg-[#1e1e1e] dark:bg-[#0d1117]
                overflow-x-auto overflow-y-auto
                code-block-with-lines
                ${isCollapsed ? 'max-h-[300px]' : 'max-h-[600px]'}
                rounded-b-lg
              `}
              style={{ 
                maxWidth: '100%',
                display: 'grid',
                gridTemplateColumns: showLineNumbers ? 'auto 1fr' : '1fr',
                gap: '0',
                fontSize: window.innerWidth < 768 ? '11px' : '13px', // 移动端11px，桌面端13px
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                minHeight: isCollapsed ? '100px' : 'auto',
                gridAutoRows: 'min-content'
              }}
            >
              {showLineNumbers && (
                <div className="line-numbers" style={{
                  padding: window.innerWidth < 768 
                    ? '0.5rem 0.125rem 0.5rem 0.25rem'  // 移动端：进一步减小padding
                    : '0.75rem 0.5rem 0.75rem 0.75rem', // 桌面端：保持原padding
                  textAlign: 'right',
                  userSelect: 'none',
                  borderRight: '1px solid rgba(128, 128, 128, 0.2)',
                  color: 'rgba(128, 128, 128, 0.6)',
                  fontSize: window.innerWidth < 768 ? '10px' : '12px', // 移动端更小的行号字体
                  minWidth: window.innerWidth < 768
                    ? (lineCount > 99 ? '2rem' : '1.5rem')  // 移动端：更紧凑
                    : (lineCount > 999 ? '3.5rem' : lineCount > 99 ? '3rem' : '2.5rem') // 桌面端：保持原宽度
                }}>
                  {children.split('\n').map((_, index) => (
                    <div
                      key={index}
                      onClick={() => {
                        setHighlightedLine(index + 1);
                        window.location.hash = `L${index + 1}`;
                      }}
                      style={{
                        lineHeight: 'var(--code-line-height, 1.5)',
                        cursor: 'pointer',
                        backgroundColor: highlightedLine === index + 1 ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                        padding: '0 0.25rem',
                        marginLeft: '-0.25rem',
                        marginRight: '-0.25rem',
                        transition: 'background-color 0.15s ease'
                      }}
                      className="hover:bg-muted/30"
                    >
                      {index + 1}
                    </div>
                  ))}
                </div>
              )}
              <div className="relative overflow-x-auto">
                {/* 横向滚动提示 - 移动端显示 */}
                <div className="md:hidden absolute right-0 top-0 bottom-0 w-12 pointer-events-none bg-gradient-to-l from-[#1e1e1e] via-[#1e1e1e]/80 to-transparent z-10" />
                <pre 
                  ref={preRef}
                  className="code-block-pre"
                  style={{ 
                    margin: 0,
                    padding: window.innerWidth < 768 
                      ? '12px'  // 移动端：紧凑padding
                      : '16px',  // 桌面端：舒适padding
                    whiteSpace: 'pre', // 使用pre保持代码格式，不强制换行
                    overflowX: 'auto', // 横向滚动
                    background: 'transparent',
                    maxWidth: '100%',
                    width: 'max-content', // 允许内容超出容器宽度
                    minWidth: '100%', // 确保至少占满容器
                    minHeight: 'fit-content',
                    height: 'auto'
                  }}
                  data-line={highlightLines}
                >
                <code 
                  ref={codeRef} 
                  className={`language-${prismLanguage}`}
                  style={{
                    color: 'inherit', // 继承父元素颜色，确俜Prism样式能正确应用
                    opacity: 1 // 确保不透明
                  }}
                >
                  {children}
                </code>
              </pre>
            </div>

          </div>
          </>
        )}
      </div>
    </div>
  );
});
