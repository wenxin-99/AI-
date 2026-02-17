import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronLeft, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RightSidePanelProps {
  children: React.ReactNode;
  title?: string;
  defaultCollapsed?: boolean;
}

export function RightSidePanel({ children, title = "AI思考步骤", defaultCollapsed = false }: RightSidePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(480);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 读取折叠状态和宽度
  useEffect(() => {
    const saved = localStorage.getItem('rightSidePanelCollapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
    const savedWidth = localStorage.getItem('rightSidePanelWidth');
    if (savedWidth) {
      const w = parseInt(savedWidth, 10);
      if (w >= 320 && w <= 900) {
        setPanelWidth(w);
      }
    }
  }, []);

  // 保存折叠状态到 localStorage
  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('rightSidePanelCollapsed', String(newState));
  };

  // 全屏切换
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // ESC 退出全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // 拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(320, Math.min(900, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('rightSidePanelWidth', String(panelWidth));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // 防止拖拽时选中文字
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing, panelWidth]);

  // 全屏模式
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* 全屏标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-8 w-8 p-0"
            title="退出全屏 (ESC)"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
        {/* 全屏内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "h-full bg-background border-l border-border transition-all ease-in-out flex-shrink-0 relative",
        "hidden xl:flex flex-col",
        isResizing ? "duration-0" : "duration-300"
      )}
      style={{ width: isCollapsed ? 48 : panelWidth }}
    >
      {/* 拖拽调整手柄 */}
      {!isCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/30 transition-colors",
            isResizing && "bg-primary/50"
          )}
        />
      )}

      {/* 折叠/展开按钮 + 全屏按钮 */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        {!isCollapsed && (
          <h3 className="text-sm font-semibold text-foreground truncate flex-1 mr-2">{title}</h3>
        )}
        <div className={cn("flex items-center gap-1", isCollapsed && "mx-auto flex-col")}>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="h-8 w-8 p-0 flex-shrink-0"
              title="全屏查看"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className="h-8 w-8 p-0 flex-shrink-0"
            title={isCollapsed ? "展开面板" : "折叠面板"}
          >
            {isCollapsed ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 面板内容 */}
      <div className={cn(
        "flex-1 overflow-y-auto transition-opacity duration-300 min-h-0",
        isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
      )}>
        {!isCollapsed && (
          <div className="p-4 h-full">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
