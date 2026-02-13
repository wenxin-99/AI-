import DashboardLayout from "@/components/DashboardLayout";
import { ProgressiveImage } from "@/components/ProgressiveImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Loader2, Send, Sparkles, Trash2, Plus, Download, Paperclip, Image as ImageIcon, Mic, Headphones, FileText, Bot, Copy, RotateCcw, Tag, Settings, X, Menu, ChevronLeft, ChevronRight, Printer, FileDown, Brain, FileSpreadsheet, File, FileType, MoreHorizontal } from "lucide-react";
import { formatFileSize } from "@/lib/formatFileSize";
import { FishCoinBalance } from "@/components/FishCoinBalance";
import { ThinkingAnimation } from "@/components/ThinkingAnimation";
import { EmptyConversationState } from "@/components/EmptyConversationState";
import { useState, useRef, useEffect, useMemo } from "react";

import { safeToast } from "@/lib/safeToast";
import { toast } from "sonner";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { SafeMarkdownWithDownload } from "@/components/SafeMarkdownWithDownload";
import { HighlightedContent } from "@/components/HighlightedContent";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import { useChatStream } from "@/hooks/useChatStream";
import { ImageWithSkeleton } from "@/components/ImageWithSkeleton";
import { ImageUploadPreview } from '@/components/ImageUploadPreview';
import { VoiceInputDialog } from '@/components/VoiceInputDialog';
import { PressToTalkButton } from '@/components/PressToTalkButton';
import { ImageLightbox } from '@/components/ImageLightbox';
import { formatAbsoluteTime, formatSmartTime } from "@/lib/timeUtils";
import { formatRelativeTime, formatDetailedTime } from "@/lib/formatTimestamp";
import { TagManagementDialog } from "@/components/TagManagementDialog";
import { VideoGenerationDialog } from "@/components/VideoGenerationDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VideoConfirmDialog } from "@/components/VideoConfirmDialog";
import { VideoTaskCard } from "@/components/VideoTaskCard";
import { ResearchTaskCard } from "@/components/ResearchTaskCard";
import { ResearchConfirmCard } from "@/components/ResearchConfirmCard";
import { VideoConfirmCard } from "@/components/VideoConfirmCard";
import { IntentConfirmCard } from "@/components/IntentConfirmCard";
import { LatexPreview } from "@/components/LatexPreview";
import { ThinkingSteps } from "@/components/ThinkingSteps";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { ChatInput, ChatInputRef, SendMessagePayload } from "@/components/ChatInput";
import { useTranslation } from 'react-i18next';
import { ChatToolPanel } from '@/components/ChatToolPanel';
import { ThinkingStep, ThinkingProcessPanel } from '@/components/ThinkingProcessPanel';
import { ThinkingProcessCard } from '@/components/ThinkingProcessCard';
import { OperationLogPanel } from '@/components/OperationLogPanel';
import { useSimulatedThinking } from '@/hooks/useSimulatedThinking';
import { useDraftManager } from '@/hooks/useDraftManager';
import { RightSidePanel } from '@/components/RightSidePanel';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useSidebarOptional } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { saveOperationLogs, loadOperationLogs, deleteOperationLogs } from '@/lib/operationLogStorage';
import { useSandboxSocket } from "../hooks/useSandboxSocket";
import SandboxPanel from "../components/SandboxPanel";

export default function Chat() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  // 安全获取侧边栏状态，如果不在SidebarProvider中则默认为打开
  const sidebarContext = useSidebarOptional();
  const isSidebarOpen = sidebarContext ? sidebarContext.state !== 'collapsed' : true;
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(() => {
    // 从 localStorage 加载用户偏好的套餐ID
    const savedPackageId = localStorage.getItem('preferredPackageId');
    return savedPackageId ? parseInt(savedPackageId, 10) : null;
  });
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ 
    role: "user" | "assistant"; 
    content: string; 
    images?: Array<{ url: string; name: string; isPlaceholder?: boolean; placeholderUrl?: string }>; 
    timestamp?: number; 
    sentAt?: number; 
    respondedAt?: number;
    isVideoConfirm?: boolean;
    videoConfirmParams?: any;
    isResearchTask?: boolean;
    researchTaskId?: number;
    researchPrompt?: string;
    isError?: boolean; // 标记是否为错误消息
    failedMessage?: { // 保存失败的用户消息，用于重试
      content: string;
      images?: Array<{ url: string; name: string }>;
      files?: Array<{ url: string; name: string }>;
    };
  }>>([]);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Array<{ url: string; name: string; progress?: number }>>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ url: string; name: string; size: number; progress?: number; error?: string; file?: File; id?: string }>>([]);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [isStreamingMessage, setIsStreamingMessage] = useState(false);
  const [isResearchMode, setIsResearchMode] = useState(false);
  const [isStartingResearch, setIsStartingResearch] = useState(false);
  const [activeResearchTaskId, setActiveResearchTaskId] = useState<number | null>(null);

  const [sandboxActiveTab, setSandboxActiveTab] = useState<"browser" | "code" | "terminal">("browser");
  const sandboxData = useSandboxSocket(activeResearchTaskId);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<Array<{ url: string; name: string }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const { sendMessage: sendStreamMessage, isStreaming, streamedContent, reset: resetStream } = useChatStream();
  const { steps: simulatedSteps, startThinking, onStreamStart, onStreamComplete, reset: resetSimulatedThinking } = useSimulatedThinking();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [managingTagsForConversation, setManagingTagsForConversation] = useState<number | null>(null);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoConfirmOpen, setVideoConfirmOpen] = useState(false);
  const [videoConfirmParams, setVideoConfirmParams] = useState<any>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isProcessingIntent, setIsProcessingIntent] = useState(false);
  const [collapsedDescriptions, setCollapsedDescriptions] = useState<Set<number>>(new Set());
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [elapsedThinkingTime, setElapsedThinkingTime] = useState<number>(0);
  const [currentThinkingSteps, setCurrentThinkingSteps] = useState<Array<{ id: string; content: string; timestamp: number }>>([]);
  const [realtimeThinkingSteps, setRealtimeThinkingSteps] = useState<ThinkingStep[]>([]); // 用于ThinkingProcessPanel
  const [operationLogs, setOperationLogs] = useState<Array<{ id: string; action: string; target?: string; operationStatus: 'running' | 'completed'; timestamp: number }>>([]);
  const [showThinkingPanel, setShowThinkingPanel] = useState(false); // 控制思考步骤面板的显示
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const [hasInputContent, setHasInputContent] = useState(false); // 跟踪输入框是否有内容
  
  // 对话草稿管理
  const { draft, saveDraft, clearDraft } = useDraftManager(selectedConversationId);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // 导出Markdown功能
  const exportToMarkdown = () => {
    if (messages.length === 0) {
      toast.error(t("chat.export.noContent"));
      return;
    }

    const conversation = conversations?.find(c => c.id === selectedConversationId);
    const title = conversation?.title || "新对话";
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    
    let markdown = `# ${title}\n\n`;
    markdown += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
    markdown += `---\n\n`;

    messages.forEach((msg, index) => {
      const role = msg.role === 'user' ? '👤 用户' : '🤖 AI助手';
      markdown += `## ${role}\n\n`;
      
      if (msg.content) {
        markdown += `${msg.content}\n\n`;
      }
      
      if (msg.images && msg.images.length > 0) {
        markdown += `### 图片\n\n`;
        msg.images.forEach((img, imgIndex) => {
          markdown += `![${img.name || `图片${imgIndex + 1}`}](${img.url})\n\n`;
        });
      }
      
      if (index < messages.length - 1) {
        markdown += `---\n\n`;
      }
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}_${timestamp}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(t("chat.export.markdownSuccess"));
  };

  // 导出Word文档功能
  const exportToWord = async () => {
    if (messages.length === 0) {
      toast.error(t("chat.export.noContent"));
      return;
    }

    const conversation = conversations?.find(c => c.id === selectedConversationId);
    const title = conversation?.title || "新对话";
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    try {
      const sections = [];
      
      // 标题
      sections.push(
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          text: `导出时间：${new Date().toLocaleString('zh-CN')}`,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: "" }) // 空行
      );

      // 对话内容
      messages.forEach((msg, index) => {
        const role = msg.role === 'user' ? '👤 用户' : '🤖 AI助手';
        
        sections.push(
          new Paragraph({
            text: role,
            heading: HeadingLevel.HEADING_2,
          })
        );
        
        if (msg.content) {
          // 将内容按行分割
          const lines = msg.content.split('\n');
          lines.forEach(line => {
            sections.push(
              new Paragraph({
                text: line || " ", // 空行也要保留
              })
            );
          });
        }
        
        if (msg.images && msg.images.length > 0) {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[包含 ${msg.images.length} 张图片]`,
                  italics: true,
                }),
              ],
            })
          );
          msg.images.forEach((img, imgIndex) => {
            sections.push(
              new Paragraph({
                text: `图片 ${imgIndex + 1}: ${img.url}`,
              })
            );
          });
        }
        
        // 添加分隔线
        if (index < messages.length - 1) {
          sections.push(
            new Paragraph({ text: "" }),
            new Paragraph({
              text: "---",
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: "" })
          );
        }
      });

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: sections,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}_${timestamp}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(t("chat.export.wordSuccess"));
    } catch (error) {
      console.error('Export to Word error:', error);
      toast.error(t("chat.export.wordFailed"));
    }
  };
  
  // 使用ref跟踪是否检测到工具调用，避免闭包问题
  const hasDetectedToolCallRef = useRef<boolean>(false);

  // 文件上传mutation（已废弃，现在使用/api/upload接口）
  // const uploadToS3Mutation = trpc.file.uploadToS3.useMutation();
  
  // 视频意图检测mutation
  const detectVideoIntentMutation = trpc.videos.detectVideoIntent.useMutation();
  
  // 视频生成mutation
  const generateVideoMutation = trpc.videos.generate.useMutation();
  // 深度研究
  const startResearchMutation = trpc.chatResearch.startFromChat.useMutation();
  
  // 推荐追问生成mutation
  const generateSuggestedQuestionsMutation = trpc.ai.generateSuggestedQuestions.useMutation();

  // 规范化图片URL：将旧域名(insights.ren)的绝对URL转换为相对路径
  const normalizeImageUrl = (url: string): string => {
    if (!url) return url;
    // 将 https://insights.ren/uploads/... 转换为 /uploads/...
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.hostname === 'insights.ren' && parsed.pathname.startsWith('/uploads/')) {
        return parsed.pathname;
      }
    } catch (e) {
      // 不是有效URL，直接返回
    }
    return url;
  };

  // 提取markdown中的图片URL，返回清理后的文本和图片列表
  const extractImagesFromMarkdown = (content: string): { cleanedContent: string; images: Array<{ url: string; name: string }> } => {
    const images: Array<{ url: string; name: string }> = [];
    // 匹配markdown图片语法：![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const cleanedContent = content.replace(imageRegex, (match, alt, url) => {
      // 如果已经是data:URL，保留
      if (url.startsWith('data:')) {
        return match;
      }
      // 添加到图片列表
      images.push({ url, name: alt || 'AI生成图片' });
      // 从文本中移除图片标记
      return '';
    });
    return { cleanedContent: cleanedContent.trim(), images };
  };

  // 图片下载函数（使用代理接口避免CORS）
  const handleImageDownload = async (imageUrl: string, imageName: string) => {
    const toastId = toast.loading("正在下载图片...");
    try {
      console.log("[Chat] Downloading image via proxy", { imageUrl, imageName });
      
      // 使用代理接口下载图片
      const result = await utils.images.proxyImage.fetch({ url: imageUrl });
      
      // 将Base64转换为Blob
      const base64Data = result.data.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.contentType });
      
      // 生成时间戳文件名：image_20260128_151230.png
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/[-:T]/g, '').replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1$2$3_$4$5$6');
      const filename = `image_${timestamp}.png`;
      
      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success("图片下载成功", { id: toastId });
      console.log("[Chat] Image downloaded successfully");
    } catch (error) {
      console.error("[Chat] Download failed:", error);
      toast.error("图片下载失败", { id: toastId });
    }
  };

  // 实时更新思考时间
  useEffect(() => {
    if (thinkingStartTime === null) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - thinkingStartTime) / 1000;
      setElapsedThinkingTime(elapsed);
    }, 100); // 每100ms更新一次

    return () => clearInterval(interval);
  }, [thinkingStartTime]);

  // 监听思考步骤更新（通过EventSource）
  useEffect(() => {
    console.log('[Chat] Initializing EventSource connection to /api/notifications/stream');
    const eventSource = new EventSource('/api/notifications/stream');
    
    eventSource.onopen = () => {
      console.log('[Chat] EventSource connection opened successfully');
    };
    
    eventSource.onmessage = (event) => {
      console.log('[Chat] EventSource message received:', event.data);
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'thinking_step_update' && data.data) {
          console.log('[Chat] Received thinking_step_update:', data.data);
          const step = data.data as ThinkingStep;
          
          // 更新实时思考步骤
          setRealtimeThinkingSteps(prev => {
            const existingIndex = prev.findIndex(s => s.id === step.id);
            if (existingIndex >= 0) {
              // 更新现有步骤
              const updated = [...prev];
              updated[existingIndex] = step;
              return updated;
            } else {
              // 添加新步骤
              return [...prev, step];
            }
          });
        }
      } catch (error) {
        console.error('[Chat] Failed to parse notification:', error);
      }
    };
    
    eventSource.onerror = (event) => {
      console.error('[Chat] EventSource connection error');
      console.error('[Chat] EventSource readyState:', eventSource.readyState);
      console.error('[Chat] Event details:', {
        type: event.type,
        target: event.target,
        eventPhase: event.eventPhase
      });
      
      // 关闭连接，稍后会自动重连（因为useEffect会重新执行）
      eventSource.close();
    };
    
    return () => {
      eventSource.close();
    };
  }, []);
  
  // 全局空格键快捷键：当输入框没有焦点时，按空格键打开语音输入对话框
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 当语音对话框已经打开时，不处理
      if (voiceDialogOpen) return;

      // 如果是空格键且没有在输入框中
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        // 只在非输入元素中触发
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON' && !target.isContentEditable) {
          e.preventDefault();
          setVoiceDialogOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [voiceDialogOpen]);

  // 处理拖拽事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开整个容器时才设置为false，避免在子元素间移动时触发
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    console.log('[DRAG DROP] Files dropped:', files.length, files.map(f => ({ name: f.name, type: f.type, size: f.size })));
    
    for (const file of files) {
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff)$/i.test(file.name);
      if (isImage) {
        console.log('[DRAG DROP] Processing image:', file.name);
        await handleImageUpload(file);
      } else {
        console.log('[DRAG DROP] Processing file:', file.name);
        await handleFileUpload(file);
      }
    }
  };

  // 图片压缩功能 - 使用 createObjectURL 代替 readAsDataURL 以避免 iOS 内存问题
  const compressImage = async (file: File): Promise<File> => {
    const maxSize = 500 * 1024; // 500KB
    if (file.size <= maxSize && ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      return file; // Small enough and standard format, no compression needed
    }

    // Use createObjectURL instead of readAsDataURL to avoid memory issues on mobile
    const objectUrl = URL.createObjectURL(file);
    
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        // Set timeout to prevent hanging on mobile (15 seconds)
        const timeout = setTimeout(() => {
          console.warn('[IMAGE UPLOAD] Image load timeout after 15s, skipping compression');
          reject(new Error('Image load timeout'));
        }, 15000);
        
        image.onload = () => {
          clearTimeout(timeout);
          resolve(image);
        };
        image.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Image load failed'));
        };
        image.src = objectUrl;
      });

      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // 计算压缩比例，保持长宽比
      const maxDimension = 1920;
      if (width > height && width > maxDimension) {
        height = (height * maxDimension) / width;
        width = maxDimension;
      } else if (height > maxDimension) {
        width = (width * maxDimension) / height;
        height = maxDimension;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');
      ctx.drawImage(img, 0, 0, width, height);

      // Always output as JPEG for best compatibility
      const outputType = (file.type === 'image/png' || file.type === 'image/gif') ? file.type : 'image/jpeg';
      const outputExt = outputType === 'image/png' ? '.png' : outputType === 'image/gif' ? '.gif' : '.jpg';
      const outputName = file.name.replace(/\.[^.]+$/, outputExt);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, outputType, 0.85);
      });

      if (!blob) throw new Error('Compression failed - no blob');

      const compressedFile = new File([blob], outputName, {
        type: outputType,
        lastModified: Date.now(),
      });
      console.log('[IMAGE UPLOAD] Compressed:', file.size, '->', blob.size, 'type:', outputType);
      return compressedFile;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  // 图片格式和大小验证
  const validateImage = (file: File): { valid: boolean; error?: string } => {
    const validFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff'];
    const maxSize = 20 * 1024 * 1024; // 20MB - mobile photos can be large

    const isImage = validFormats.includes(file.type) || file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff)$/i.test(file.name);
    if (!isImage) {
      return { valid: false, error: t('chat.upload.unsupportedFormat') };
    }

    if (file.size > maxSize) {
      return { valid: false, error: t("chat.upload.sizeLimit") };
    }

    return { valid: true };
  };

  // 处理文件上传
  const handleFileUpload = async (file: File) => {
    // 验证文件大小（10MB限制）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error(t("chat.upload.sizeLimit"));
      return;
    }

    // 生成临时ID
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    
    // 添加到上传列表，初始进度为0，保存File对象以便重试
    setUploadedFiles((prev) => [
      ...prev,
      { url: '', name: file.name, size: file.size, progress: 0, id: tempId, file } as any
    ]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 使用XMLHttpRequest以支持上传进度
      const xhr = new XMLHttpRequest();
      
      // 监听上传进度
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadedFiles((prev) =>
            prev.map((f: any) =>
              f.id === tempId ? { ...f, progress: percentComplete } : f
            )
          );
        }
      });

      // 上传完成
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error('上传失败'));
          }
        };
        xhr.onerror = () => reject(new Error('网络错误'));
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

      const result = await uploadPromise;
      
      // 更新文件URL，移除进度
      setUploadedFiles((prev) =>
        prev.map((f: any) =>
          f.id === tempId ? { url: result.url, name: file.name, size: file.size } : f
        )
      );
      
      toast.success(`${file.name} ${t("chat.upload.success")}`);
    } catch (error: any) {
      // 保留失败的文件，显示错误信息
      setUploadedFiles((prev) =>
        prev.map((f: any) =>
          f.id === tempId ? { ...f, error: error.message || '上传失败', progress: undefined } : f
        )
      );
      toast.error(`${file.name} ${t("chat.upload.failed")}: ${error.message || t("chat.upload.unknownError")}`);
    }
  };

  // 重试上传失败的文件
  const retryUpload = async (fileId: string) => {
    const fileItem = uploadedFiles.find((f: any) => f.id === fileId);
    if (!fileItem || !fileItem.file) {
      toast.error(t("chat.upload.retryFailed"));
      return;
    }

    // 清除错误状态，重置进度
    setUploadedFiles((prev) =>
      prev.map((f: any) =>
        f.id === fileId ? { ...f, error: undefined, progress: 0 } : f
      )
    );

    try {
      const formData = new FormData();
      formData.append('file', fileItem.file);

      // 使用XMLHttpRequest以支持上传进度
      const xhr = new XMLHttpRequest();
      
      // 监听上传进度
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadedFiles((prev) =>
            prev.map((f: any) =>
              f.id === fileId ? { ...f, progress: percentComplete } : f
            )
          );
        }
      });

      // 上传完成
      const uploadPromise = new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error('上传失败'));
          }
        };
        xhr.onerror = () => reject(new Error('网络错误'));
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

      const result = await uploadPromise;
      
      // 更新文件URL，移除进度
      setUploadedFiles((prev) =>
        prev.map((f: any) =>
          f.id === fileId ? { url: result.url, name: fileItem.file!.name, size: fileItem.file!.size } : f
        )
      );
      
      toast.success(`${fileItem.file.name} ${t("chat.upload.success")}`);
    } catch (error: any) {
      // 保留失败的文件，显示错误信息
      setUploadedFiles((prev) =>
        prev.map((f: any) =>
          f.id === fileId ? { ...f, error: error.message || '上传失败', progress: undefined } : f
        )
      );
      toast.error(`${fileItem.file.name} ${t("chat.upload.failed")}: ${error.message || t("chat.upload.unknownError")}`);
    }
  };

  // 处理图片上传
  const handleImageUpload = async (file: File) => {
    console.log('[IMAGE UPLOAD] handleImageUpload called with file:', file.name, file.size, file.type);
    const validation = validateImage(file);
    if (!validation.valid) {
      toast.error(validation.error!);
      return;
    }

    // 生成临时ID
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    
    // 创建临时预览URL
    const previewUrl = URL.createObjectURL(file);
    
    // 添加到上传列表，初始进度为0
    setUploadedImages((prev) => [
      ...prev,
      { url: previewUrl, name: file.name, progress: 0, id: tempId } as any
    ]);

    try {
      // Compress image for upload optimization (especially important for mobile)
      let processedFile = file;
      // Compress if file is > 500KB or non-standard format, but with timeout protection
      const needsCompression = file.size > 500 * 1024 || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
      if (needsCompression) {
        try {
          // Race between compression and timeout - if compression hangs, use original file
          processedFile = await Promise.race([
            compressImage(file),
            new Promise<File>((_, reject) => setTimeout(() => reject(new Error('Compression timeout')), 20000))
          ]);
          console.log('[IMAGE UPLOAD] Compression successful:', file.size, '->', processedFile.size);
        } catch (error: any) {
          console.warn('[IMAGE UPLOAD] Compression failed/timeout, uploading original file:', error.message);
          processedFile = file; // Use original file if compression fails
        }
      }

      try {
        console.log('[IMAGE UPLOAD] Starting S3 upload...');
        
        const formData = new FormData();
        formData.append('file', processedFile);

        // 使用XMLHttpRequest以支持上传进度
        const xhr = new XMLHttpRequest();
        
        // 监听上传进度
        // Track upload start time for debugging
        const uploadStartTime = Date.now();
        let lastProgressUpdate = 0;
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            // Only update state if progress actually changed (avoid unnecessary re-renders)
            if (percentComplete !== lastProgressUpdate) {
              lastProgressUpdate = percentComplete;
              console.log('[IMAGE UPLOAD] Progress:', percentComplete + '%', 'loaded:', e.loaded, '/', e.total);
              setUploadedImages((prev) =>
                prev.map((img: any) =>
                  img.id === tempId ? { ...img, progress: percentComplete } : img
                )
              );
            }
          } else {
            console.log('[IMAGE UPLOAD] Progress event not computable');
          }
        });
        
        xhr.upload.addEventListener('loadstart', () => {
          console.log('[IMAGE UPLOAD] Upload started for:', file.name);
        });
        
        xhr.upload.addEventListener('error', (e) => {
          console.error('[IMAGE UPLOAD] Upload error event:', e);
        });

        // 创建Promise包装XMLHttpRequest
        const uploadPromise = new Promise<any>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const result = JSON.parse(xhr.responseText);
                resolve(result);
              } catch (error) {
                reject(new Error('解析响应失败'));
              }
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                reject(new Error(error.message || '上传失败'));
              } catch {
                reject(new Error('上传失败'));
              }
            }
          };

          xhr.onerror = () => reject(new Error('网络错误'));
          xhr.ontimeout = () => reject(new Error('上传超时'));

          xhr.timeout = 120000; // 120 second timeout for mobile uploads
          xhr.open('POST', '/api/upload');
          xhr.send(formData);
        });

        const result = await uploadPromise;
        console.log('[IMAGE UPLOAD] S3 upload result:', result);

        // 替换为真实URL，移除进度
        setUploadedImages((prev) =>
          prev.map((img: any) =>
            img.id === tempId
              ? { url: result.url, name: file.name }
              : img
          )
        );
        
        // 释放临时URL
        URL.revokeObjectURL(previewUrl);
        
        toast.success(`${file.name} ${t("chat.upload.success")}`);
      } catch (error: any) {
        console.error('[IMAGE UPLOAD] Upload failed:', error);
        toast.error(`${t("chat.upload.failed")}: ${error.message || t("chat.upload.unknownError")}`);
        // 移除失败的图片
        setUploadedImages((prev) => prev.filter((img: any) => img.id !== tempId));
        URL.revokeObjectURL(previewUrl);
      }
    } catch (error: any) {
      toast.error(`${t("chat.upload.failed")}: ${error.message || t("chat.upload.unknownError")}`);
      setUploadedImages((prev) => prev.filter((img: any) => img.id !== tempId));
      URL.revokeObjectURL(previewUrl);
    }
  };

  const { data: conversations, refetch: refetchConversations } = trpc.conversation.getAll.useQuery();
  const { data: models } = trpc.aiModel.getAll.useQuery();
  const { data: modelPackages } = trpc.modelPackage.getAll.useQuery();
  const { data: balance, refetch: refetchBalance, isLoading: isLoadingBalance } = trpc.fishCoin.getBalance.useQuery();
  const { data: currentUser } = trpc.auth.me.useQuery();

  const updatePreferenceMutation = trpc.auth.updatePreference.useMutation();

  const chatModels = models?.filter((m) => m.type === "chat" && m.enabled);

  // 自动选中用户偏好的模型或套餐（优先使用套餐）
  useEffect(() => {
    if (currentUser) {
      // 优先使用套餐，如果没有套餐才使用单个模型
      if (currentUser.preferredPackageId) {
        // 如果用户有套餐偏好，确保使用套餐
        if (selectedPackageId !== currentUser.preferredPackageId) {
          setSelectedPackageId(currentUser.preferredPackageId);
        }
        // 清除selectedModelId，确保使用套餐而不是单个模型
        if (selectedModelId !== null) {
          setSelectedModelId(null);
        }
        // 清除数据库中的preferredModelId
        if (currentUser.preferredModelId) {
          updatePreferenceMutation.mutate({ preferredModelId: null, preferredPackageId: currentUser.preferredPackageId });
        }
      } else if (currentUser.preferredModelId && !selectedModelId && !selectedPackageId) {
        // 只有在没有套餐偏好时才使用单个模型偏好
        setSelectedModelId(currentUser.preferredModelId);
      }
    }
  }, [currentUser?.preferredPackageId, currentUser?.preferredModelId]);

  // 监听模型选择变化，自动记录偏好
  useEffect(() => {
    if (selectedModelId && currentUser && selectedModelId !== currentUser.preferredModelId) {
      // 保存用户选择的模型ID作为偏好，并清除套餐偏好
      updatePreferenceMutation.mutate({ preferredModelId: selectedModelId, preferredPackageId: null });
    }
  }, [selectedModelId, currentUser?.preferredModelId]);

  useEffect(() => {
    if (selectedPackageId && currentUser && selectedPackageId !== currentUser.preferredPackageId) {
      // 保存用户选择的套餐ID作为偏好，并清除模型偏好
      updatePreferenceMutation.mutate({ preferredPackageId: selectedPackageId, preferredModelId: null });
    }
  }, [selectedPackageId, currentUser?.preferredPackageId]);

  const createConversationMutation = trpc.conversation.create.useMutation({
    onSuccess: (data: any) => {
      setSelectedConversationId(data.id);
      setMessages([]);
      refetchConversations();
      toast.success(t("chat.newConversationCreated"));
    },
    onError: (error: any) => {
      toast.error(error.message || "创建对话失败");
    },
  });

  const deleteConversationMutation = trpc.conversation.delete.useMutation({
    onSuccess: (_, variables) => {
      // 清除该对话的操作日志
      deleteOperationLogs(variables.id.toString());
      
      // 只有当删除的是当前选中的对话时，才清空选中状态
      if (variables.id === selectedConversationId) {
        setSelectedConversationId(null);
        setMessages([]);
        setOperationLogs([]); // 清空当前显示的日志
      }
      refetchConversations();
      toast.success(t('chat.deleteConversation'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('common.error'));
    },
  });

  const exportPdfMutation = trpc.conversation.exportPdf.useMutation();

  const generateDocumentMutation = trpc.ai.generateDocument.useMutation();

  const generateTitleMutation = trpc.conversation.generateTitle.useMutation();

  const updatePackageMutation = trpc.conversation.updatePackage.useMutation();

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      const messageContent = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
      setMessages((prev) => [...prev, { role: "assistant", content: messageContent }]);
      refetchBalance();
      toast.success(t("chat.costMessage", { cost: data.cost, balance: data.newBalance }));
    },
    onError: (error: any) => {
      toast.error(error.message || t('common.error'));
      // 移除用户消息
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  // 流式输出时的自动滚动逻辑
  useEffect(() => {
    // 只在流式输出时才滚动
    if (!isStreaming || !messagesEndRef.current) return;
    
    // 直接滚动到底部，不检查用户位置
    // 使用instant而不是smooth，确保立即响应
    messagesEndRef.current.scrollIntoView({ behavior: 'instant', block: 'end' });
  }, [streamedContent, isStreaming]); // 只依赖streamedContent和isStreaming

  // 自动选择第一个可用模型（如果用户没有偏好）
  useEffect(() => {
    if (chatModels && chatModels.length > 0 && !selectedModelId && !currentUser?.preferredModelId) {
      // 默认选择第一个模型
      setSelectedModelId(chatModels[0].id);
    }
  }, [chatModels, selectedModelId, currentUser]);

  // 自动选中最近的对话（首次加载时）
  useEffect(() => {
    if (conversations && conversations.length > 0 && !selectedConversationId) {
      // 选中最近的对话（列表第一个）
      const latestConversation = conversations[0];
      setSelectedConversationId(latestConversation.id);
      loadConversationMessages(latestConversation.id);
    }
  }, [conversations, selectedConversationId]);

  // 使用ref跟踪上一次的对话ID，只在对话切换时恢复草稿
  const prevConversationIdRef = useRef<number | null>(null);
  
  // 当对话切换时，恢复草稿
  useEffect(() => {
    // 只在对话ID真正变化时才恢复草稿
    if (selectedConversationId !== prevConversationIdRef.current) {
      prevConversationIdRef.current = selectedConversationId;
      
      if (selectedConversationId && draft) {
        // 恢复输入框内容
        if (chatInputRef.current && draft.input) {
          chatInputRef.current.setInput(draft.input);
        }
        // 恢复上传的文件
        if (draft.files.length > 0) {
          setUploadedFiles(draft.files);
        } else {
          setUploadedFiles([]);
        }
      } else if (!selectedConversationId) {
        // 如果没有选中对话，清空输入框和文件
        if (chatInputRef.current) {
          chatInputRef.current.clear();
        }
        setUploadedFiles([]);
      }
    }
  }, [selectedConversationId, draft]);

  // 当输入内容或文件变化时，保存草稿
  useEffect(() => {
    if (!selectedConversationId) return;
    
    // 获取当前输入框的内容
    const currentInput = chatInputRef.current?.getValue() || '';
    
    // 保存草稿（防抖处理）
    const timer = setTimeout(() => {
      saveDraft(currentInput, uploadedFiles);
    }, 500); // 500ms防抖
    
    return () => clearTimeout(timer);
  }, [uploadedFiles, selectedConversationId, saveDraft]);

  const handleCreateConversation = () => {
    let pkgId = selectedPackageId;
    if (!pkgId) {
      // 自动选择第一个可用套餐
      if (modelPackages && modelPackages.length > 0) {
        pkgId = modelPackages[0].id;
        setSelectedPackageId(pkgId);
      } else {
        toast.error(t('chat.selectPackageFirst'));
        return;
      }
    }
    // 清空推荐追问
    setSuggestedQuestions([]);
    // 使用套餐创建对话，后端会自动选择套餐的主模型
    createConversationMutation.mutate({
      modelId: 0, // 占位符，后端会根据packageId选择实际模型
      title: t('chat.newConversation'),
      packageId: pkgId,
    });
  };

  // 加载对话消息历史
  const loadConversationMessages = async (conversationId: number) => {
    try {
      // 恢复该对话的操作日志
      const savedLogs = loadOperationLogs(conversationId.toString());
      setOperationLogs(savedLogs);
      
      const conversation = await utils.conversation.getById.fetch({ id: conversationId });
      if (conversation && conversation.messages) {
        const parsedMessages = JSON.parse(conversation.messages as string);
        // 转换多模态格式的消息为显示格式
        const displayMessages = parsedMessages.map((msg: any) => {
          // 处理视频任务消息
          if (msg.isResearchTask) {
              return {
                ...msg,
                isResearchTask: true,
                researchTaskId: msg.researchTaskId,
                researchPrompt: msg.researchPrompt,
              };
            }
            if (msg.isVideoTask) {
            return {
              ...msg,
              isVideoTask: true,
              videoTaskId: msg.videoTaskId,
              videoPrompt: msg.videoPrompt || msg.content,
              timestamp: msg.timestamp || msg.sentAt || msg.respondedAt || Date.now()
            };
          }
          
          if (typeof msg.content === 'object' && Array.isArray(msg.content)) {
            // 多模态格式，提取文本和图片
            let textContent = '';
            const images: Array<{ url: string; name: string }> = [];
            
            for (const part of msg.content) {
              if (part.type === 'text') {
                textContent += part.text;
              } else if (part.type === 'image_url') {
                images.push({ 
                  url: part.image_url.url, 
                  name: '图片' 
                });
              } else if (part.type === 'file_url') {
                textContent += `[文件]`;
              }
            }
            
            return { 
              ...msg, 
              content: textContent || '[图片]',
              images: images.length > 0 ? images : undefined,
              timestamp: msg.timestamp || msg.sentAt || msg.respondedAt || Date.now()
            };
          }
          return {
            ...msg,
            timestamp: msg.timestamp || msg.sentAt || msg.respondedAt || Date.now()
          };
        });
        setMessages(displayMessages);
        
        // 初始化折叠状态：将所有包含图片的消息索引添加到collapsedDescriptions
        const imageMessageIndices = displayMessages
          .map((msg: any, index: number) => msg.images && msg.images.length > 0 ? index : -1)
          .filter((index: number) => index !== -1);
        
        if (imageMessageIndices.length > 0) {
          setCollapsedDescriptions(new Set(imageMessageIndices));
        }
      }
    } catch (error: any) {
      console.error('[Load Conversation] Error:', error);
      
      // 处理对话不存在的情况
      if (error.message && error.message.includes('对话不存在')) {
        toast.error(t("chat.conversationNotFound"));
        
        // 清空当前选中的对话
        setSelectedConversationId(null);
        setMessages([]);
        
        // 刷新对话列表，移除不存在的对话
        refetchConversations();
      } else {
        toast.error("加载对话历史失败，请稍后重试");
      }
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    // 如果没有传入messageText，使用message状态（向后兼容）
    const textToSend = messageText !== undefined ? messageText : message;
    
    // 清空推荐追问
    setSuggestedQuestions([]);
    
    if (!textToSend.trim() && uploadedImages.length === 0 && uploadedFiles.length === 0) {
      toast.error(t('chat.inputPlaceholder'));
      return;
    }


    // === 深度研究模式 ===
    if (isResearchMode) {
      const researchPrompt = textToSend.trim();
      if (!researchPrompt) {
        toast.error(t('chat.research.enterPrompt'));
        return;
      }

      // 添加用户消息到对话
      const userMsg = {
        role: "user" as const,
        content: researchPrompt,
        timestamp: Date.now(),
        sentAt: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);

      // 清空输入
      setMessage("");
      chatInputRef.current?.clear();
      setHasInputContent(false);
      setUploadedImages([]);
      setUploadedFiles([]);

      try {
        // 调用后端创建研究任务
        const result = await startResearchMutation.mutateAsync({
          prompt: researchPrompt,
          conversationId: selectedConversationId ?? undefined,
        });

        // 添加研究任务卡片消息
        const researchMsg = {
          role: "assistant" as const,
          content: `<ResearchTaskCard taskId="${result.taskId}" prompt="${researchPrompt.replace(/"/g, '&quot;')}" />`,
          timestamp: Date.now(),
          isResearchTask: true,
          researchTaskId: result.taskId,
          researchPrompt: researchPrompt,
        };
        setMessages(prev => [...prev, researchMsg]);
        setActiveResearchTaskId(result.taskId);

        toast.success(t('chat.research.started', { cost: result.cost }));
        refetchBalance();
      } catch (error: any) {
        toast.error(error.message || t('chat.research.startFailed'));
        // 添加错误消息
        setMessages(prev => [...prev, {
          role: "assistant" as const,
          content: error.message || t('chat.research.startFailedRetry'),
          timestamp: Date.now(),
          isError: true,
        }]);
      }

      // 关闭研究模式
      setIsResearchMode(false);
      return; // 不走普通消息流程
    }

    // 检测图片生成意图（关键词匹配）
    const imageKeywords = ['生成图片', '制作图片', '创建图片', '生成一张图', '生成一张图片', '做一张图', '做个图片', '配上一张', '配上图片', '配图', 'generate image', 'create image', 'make image', '画一张', '继续生成', '再生成', '再来一张', '再画一张', '重新生成', '生成类似的', '生成相似的', '类似的图', '相似的图', '同样的图', '同样风格'];
    const hasImageGenerationIntent = textToSend.trim() && 
      imageKeywords.some(keyword => textToSend.toLowerCase().includes(keyword.toLowerCase()));
    
    // 检测是否是“继续生成”类型的指令（需要上下文记忆）
    const continueKeywords = ['继续生成', '再生成', '再来一张', '再画一张', '重新生成', '生成类似的', '生成相似的', '类似的图', '相似的图', '同样的图', '同样风格'];
    const isContinueGeneration = hasImageGenerationIntent && 
      continueKeywords.some(keyword => textToSend.toLowerCase().includes(keyword.toLowerCase()));
    
    // 如果是“继续生成”，从对话历史中查找最近的图片描述
    let enhancedMessage = textToSend;
    if (isContinueGeneration) {
      // 从后往前查找最近的包含图片的助手消息
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant' && msg.images && msg.images.length > 0) {
          // 提取图片描述（从消息内容中查找“图片描述：”后面的内容）
          const descMatch = msg.content.match(/图片描述：?\s*([^\n]+)/i);
          if (descMatch && descMatch[1]) {
            const previousDescription = descMatch[1].trim();
            // 将之前的描述添加到当前消息中
            enhancedMessage = `${message}（基于之前的描述：${previousDescription}）`;
            console.log('[IMAGE CONTEXT] Found previous description:', previousDescription);
            console.log('[IMAGE CONTEXT] Enhanced message:', enhancedMessage);
            break;
          }
        }
      }
    }
    
    // === 检测深度研究意图（关键词匹配） ===
    const researchKeywords = [
      '深度研究', '帮我研究', '调研一下', '研究一下', '深入研究', 'research',
      '帮我调研', '做个调研', '做个研究', '进行研究', '开展研究',
      '深入分析', '全面分析', '详细调查', '详细分析', '系统分析',
      '综合分析', '深度分析', '彻底分析',
      '写一份报告', '生成研究报告', '写一篇调研', '写个报告',
      '研究报告', '调研报告', '分析报告', '写份报告',
      '对比分析', '横向对比', '全面对比', '深度对比',
      '市场调研', '行业分析', '竞品分析', '趋势分析',
    ];
    const hasResearchIntent = textToSend.trim() &&
      uploadedImages.length === 0 &&
      uploadedFiles.length === 0 &&
      researchKeywords.some(keyword => textToSend.toLowerCase().includes(keyword.toLowerCase()));

    if (hasResearchIntent && !isResearchMode) {
      const userMessage = {
        role: 'user' as const,
        content: textToSend.trim(),
        timestamp: Date.now(),
        sentAt: Date.now(),
      };
      const confirmMessage = {
        role: 'assistant' as const,
        content: t('chat.research.intentDetected'),
        timestamp: Date.now(),
        isResearchConfirm: true,
        researchConfirmParams: {
          prompt: textToSend.trim(),
          confidence: 'high' as const,
          method: 'keyword' as const,
          originalMessage: textToSend.trim(),
        },
      };
      setMessages(prev => [...prev, userMessage, confirmMessage]);
      setMessage('');
      chatInputRef.current?.clear();
      setHasInputContent(false);
      return;
    }

        // 检测视频生成意图（仅在包含关键词时检测，避免不必要的API调用）
    const videoKeywords = ['视频', '生成视频', '制作视频', '创建视频', 'video', '动画', '短视频'];
    console.log("[Video Debug] textToSend:", textToSend, "uploadedImages:", uploadedImages.length, "uploadedFiles:", uploadedFiles.length, "hasKeyword:", videoKeywords.some(keyword => textToSend.toLowerCase().includes(keyword.toLowerCase())));
    const shouldCheckVideoIntent = textToSend.trim() && 
      uploadedImages.length === 0 && 
      uploadedFiles.length === 0 &&
      videoKeywords.some(keyword => textToSend.toLowerCase().includes(keyword.toLowerCase()));
    
    if (shouldCheckVideoIntent) {
      try {
        const intentResult = await detectVideoIntentMutation.mutateAsync({ message: textToSend.trim() });
        
        if (intentResult.isVideoRequest && intentResult.confidence !== 'low') {
          // 检测到视频生成意图，在对话框中显示确认消息
          const userMessage = {
            role: 'user' as const,
            content: textToSend.trim(),
            timestamp: Date.now()
          };
          
          const confirmMessage = {
            role: 'assistant' as const,
            content: t('chat.video.intentDetected'),
            timestamp: Date.now(),
            isVideoConfirm: true,
            videoConfirmParams: intentResult
          };
          
          setMessages(prev => [...prev, userMessage, confirmMessage]);
          setMessage(''); // 清空输入框
          return; // 阻止正常消息发送
        }
      } catch (error: any) {
        // 意图检测失败，继续正常消息发送
        // 不显示错误提示，因为这是一个辅助功能，失败不应该影响用户正常使用
        console.log('[VIDEO INTENT] Detection skipped:', error?.message || '未知错误');
        // 如果是配额用完，静默失败，不影响后续流程
      }
    }

    // 如果没有选中对话，自动创建新对话
    let conversationId = selectedConversationId;
    if (!conversationId) {
      try{
        const newConv = await new Promise<{id: number}>((resolve, reject) => {
          createConversationMutation.mutate(
            {
              modelId: selectedModelId || currentUser?.preferredModelId || chatModels?.[0]?.id || 1,
              title: textToSend.trim() || "新对话",
              packageId: selectedPackageId || undefined,
            },
            {
              onSuccess: (data) => {
                resolve(data);
              },
              onError: (error) => {
                reject(error);
              },
            }
          );
        });
        conversationId = newConv.id;
        setSelectedConversationId(newConv.id);
        await refetchConversations();
      } catch (error) {
        toast.error("创建对话失败");
        return;
      }
    }

    if (!selectedModelId && !selectedPackageId) {
      toast.error("请选择AI模型或模型套餐");
      return;
    }

    // 构建用户消息内容（支持多模态：文本 + 图片 + 文件）
    let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string }; file_url?: { url: string; mime_type?: string } }>;
    
    // 如果检测到图片生成意图，忽略上传的图片，只使用文本提示
    const shouldIgnoreUploadedImages = hasImageGenerationIntent && uploadedImages.length > 0;
    
    // 如果有图片或文件，使用多模态格式（但图片生成意图时忽略图片）
    if ((uploadedImages.length > 0 && !shouldIgnoreUploadedImages) || uploadedFiles.length > 0) {
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string }; file_url?: { url: string; mime_type?: string } }> = [];
      
      // 添加文本内容（使用enhancedMessage以支持上下文记忆）
      if (enhancedMessage.trim()) {
        contentParts.push({ type: "text", text: enhancedMessage });
      }
      
      // 添加图片（除非是图片生成意图）
      if (!shouldIgnoreUploadedImages) {
        uploadedImages.forEach(img => {
          contentParts.push({
            type: "image_url",
            image_url: { url: img.url }
          });
        });
      }
      
      // 添加文件（作为文本说明，因为LLM不直接支持文件）
      if (uploadedFiles.length > 0) {
        const fileText = uploadedFiles.map(file => `[File: ${file.name}](${file.url})`).join('\n');
        contentParts.push({ type: "text", text: fileText });
      }
      
      messageContent = contentParts;
    } else {
      // 只有文本，使用简单字符串格式（使用enhancedMessage以支持上下文记忆）
      messageContent = enhancedMessage;
    }

    // 添加用户消息到界面（显示用）
    // 为前端显示构造纯文本内容
    let displayContent = textToSend.trim();
    if (uploadedFiles.length > 0) {
      const fileText = uploadedFiles.map(file => `[文件: ${file.name}]`).join('\n');
      displayContent = displayContent ? displayContent + '\n' + fileText : fileText;
    }
    // 如果没有文本内容但有图片，显示默认文本
    if (!displayContent && uploadedImages.length > 0) {
      displayContent = '[图片]';
    }
    
    const sentAt = Date.now();
    const userMessageForDisplay = { 
      role: "user" as const, 
      content: displayContent,
      images: uploadedImages.length > 0 ? uploadedImages : undefined,
      files: uploadedFiles.length > 0 ? uploadedFiles : undefined, // 保存文件信息
      timestamp: sentAt,
      sentAt
    };
    const userMessageForAPI = { role: "user" as const, content: messageContent };
    
    // 添加用户消息到UI
    setMessages((prev) => [...prev, userMessageForDisplay]);
    
    // 强制滚动到底部(发送消息后)
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
    
    // 清空输入框和上传的文件
    setMessage("");
    setUploadedImages([]);
    setUploadedFiles([]);
    
    // 清除当前对话的草稿
    clearDraft();
    
    // 设置流式显示状态
    setIsStreamingMessage(true);
    setThinkingStartTime(Date.now());
    setElapsedThinkingTime(0);
    
    // 启动模拟思考流程
    startThinking();
    
    // 如果包含图片，显示图片识别加载状态
    const hasImages = uploadedImages.length > 0;
    const initialAssistantContent = hasImages 
      ? `🔍 正在识别图片${uploadedImages.length > 1 ? `（${uploadedImages.length}张）` : ''}…` 
      : "";
    
    // 添加助手消息占位符
    setMessages((prev) => [...prev, { role: "assistant", content: initialAssistantContent, timestamp: Date.now() }]);
    
    // 再次滚动到底部(添加助手占位符后)
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
    
    resetStream();

    // 检查是否包含视觉内容（图片）
    const hasVisionContent = Array.isArray(userMessageForAPI.content) && 
      userMessageForAPI.content.some(item => item.type === 'image_url');

    // 重置工具调用检测标志
    hasDetectedToolCallRef.current = false;

    // 使用流式 API发送消息（使用多模态格式）
    await sendStreamMessage(
      selectedModelId ?? 0, // 如果使用套餐，传递0作为占位符，后端会根据packageId选择实际模型
      [...messages, userMessageForAPI],
      conversationId,
      {
        onStart: (data) => {
          console.log("Stream started:", data);
          // 初始化思考步骤（清空上次对话的思考步骤）
          setCurrentThinkingSteps([]);
          setRealtimeThinkingSteps([]);
          setOperationLogs([]); // 清空操作日志
          setThinkingStartTime(Date.now());
          // 重置工具调用检测标志
          hasDetectedToolCallRef.current = false;
          // 通知模拟思考流程：流式传输开始
          onStreamStart();
        },
        onContent: (content) => {
          // 如果已经检测到工具调用，忽略后续的content chunk
          if (hasDetectedToolCallRef.current) {
            return;
          }

          // 更新最后一条消息（助手消息）的内容
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              // 确保 content 是字符串
              const contentStr = typeof content === 'string' ? content : String(content);
              
              // 累积内容
              const accumulatedContent = (lastMessage.content || "") + contentStr;
              
              // 检测累积内容中是否包含完整的JSON工具调用
              const hasToolCall = accumulatedContent.includes('"action"') && 
                                  (accumulatedContent.includes('dalle.text2im') || 
                                   accumulatedContent.includes('text2im'));
              
              if (hasToolCall) {
                // 检测到工具调用，设置标志位，清空内容
                hasDetectedToolCallRef.current = true;
                lastMessage.content = '';
                console.log('[IMAGE GENERATION] Tool call detected, clearing content');
              } else {
                // 正常累积内容
                lastMessage.content = accumulatedContent;
              }
            }
            return newMessages;
          });
        },
        onFallback: (data) => {
          // 处理备用模型事件
          if (data.usedFallback) {
            toast.success(`🔄 ${data.fallbackReason || '已自动切换到支持图片的模型'}`, {
              duration: 8000,
              position: 'top-center',
            });
          }
        },
        onThinking: (data) => {
          // 处理思考步骤事件
          console.log('[Chat] Thinking step:', data);
          
          // 为currentThinkingSteps创建简单对象
          const simpleStep = {
            id: `step-${Date.now()}-${Math.random()}`,
            content: data.step,
            timestamp: data.timestamp,
          };
          setCurrentThinkingSteps((prev) => [...prev, simpleStep]);
          
          // 为realtimeThinkingSteps创建符合ThinkingStep类型的对象
          const now = Date.now();
          const thinkingStep: ThinkingStep = {
            id: `step-${now}-${Math.random()}`,
            name: data.step,
            details: data.details, // 添加详细内容
            status: 'completed',
            startTime: data.timestamp,
            endTime: now,
          };
          setRealtimeThinkingSteps((prev) => {
            // 更新上一个步骤的endTime为当前步骤的到达时间
            if (prev.length > 0) {
              const updated = [...prev];
              const lastStep = { ...updated[updated.length - 1] };
              if (!lastStep.endTime || lastStep.endTime === lastStep.startTime) {
                lastStep.endTime = now;
                updated[updated.length - 1] = lastStep;
              }
              return [...updated, thinkingStep];
            }
            return [...prev, thinkingStep];
          });
        },
        onOperation: (data) => {
          // 处理操作状态事件
          console.log('[Chat] Operation status:', data);
          const operationLog = {
            id: `op-${Date.now()}-${Math.random()}`,
            action: data.action,
            target: data.target,
            operationStatus: data.operationStatus,
            timestamp: data.timestamp,
          };
          
          setOperationLogs((prev) => {
            // 如果是同一个操作的更新（running -> completed）
            const existingIndex = prev.findIndex(log => 
              log.action === data.action && 
              log.target === data.target &&
              log.operationStatus === 'running'
            );
            
            let newLogs;
            if (existingIndex >= 0 && data.operationStatus === 'completed') {
              // 更新现有操作为完成状态
              const updated = [...prev];
              updated[existingIndex] = operationLog;
              newLogs = updated;
            } else {
              // 添加新操作
              newLogs = [...prev, operationLog];
            }
            
            // 保存到localStorage
            if (selectedConversationId) {
              saveOperationLogs(selectedConversationId.toString(), newLogs);
            }
            
            return newLogs;
          });
        },
        onIntentConfirm: (data) => {
          // 处理意图确认事件
          console.log('[Chat] Intent confirmation:', data);
          setIsStreamingMessage(false);
          
          // 添加意图确认消息
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              role: 'assistant' as const,
              content: '',
              timestamp: Date.now(),
              isIntentConfirm: true,
              intentConfirmData: data,
            },
          ]);
        },
          onImagePlaceholder: (data) => {
          // 处理占位图事件，先显示模糊图
          console.log('[Chat] Placeholder image received:', data);
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              // 添加占位图，标记为isPlaceholder
              if (!lastMessage.images) {
                lastMessage.images = [];
              }
              lastMessage.images.push({ 
                url: data.placeholderUrl, 
                name: data.prompt,
                isPlaceholder: true // 标记为占位图
              });
              
              // 默认折叠图片描述
              setCollapsedDescriptions(prev => {
                const newSet = new Set(prev);
                newSet.add(newMessages.length - 1);
                return newSet;
              });
            }
            return newMessages;
          });
        },
        onImage: (data) => {
          // 处理高清图片事件，替换占位图
          console.log('[Chat] High-resolution image generated:', data);
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              // 将图片URL添加到消息内容中
              lastMessage.content += `

![AI_IMG](${data.imageUrl})`;
              
              // 替换占位图为高清图
              if (lastMessage.images) {
                const placeholderIndex = lastMessage.images.findIndex((img: any) => img.isPlaceholder);
                if (placeholderIndex !== -1) {
                  // 找到占位图，替换为高清图
                  lastMessage.images[placeholderIndex] = { 
                    url: data.imageUrl, 
                    name: data.prompt,
                    placeholderUrl: data.placeholderUrl // 保留占位图URL用于渐进加载
                  };
                } else {
                  // 没有占位图，直接添加
                  lastMessage.images.push({ url: data.imageUrl, name: data.prompt });
                }
              } else {
                lastMessage.images = [{ url: data.imageUrl, name: data.prompt }];
              }
              
              // 默认折叠图片描述
              setCollapsedDescriptions(prev => {
                const newSet = new Set(prev);
                newSet.add(newMessages.length - 1);
                return newSet;
              });
            }
            return newMessages;
          });
        },
        onDone: (data) => {
          setIsStreamingMessage(false);
          const respondedAt = Date.now();
          
          // 保存思考步骤到最后一条消息
          const thinkingStepsToSave = currentThinkingSteps.length > 0 ? [...currentThinkingSteps] : undefined;
          
          // 清除思考状态
          setThinkingStartTime(null);
          setCurrentThinkingSteps([]);
          // 不再清空realtimeThinkingSteps，让用户可以随时查看之前的思考步骤
          // realtimeThinkingSteps将在下次发送消息时清空（onStart回调中）
          
          // 通知模拟思考流程：流式传输完成
          onStreamComplete();
          
          // 更新最后一条助手消息，添加respondedAt、sentAt和thinkingSteps
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              lastMessage.respondedAt = respondedAt;
              // 找到对应的用户消息的sentAt
              const userMessage = newMessages[newMessages.length - 2];
              if (userMessage && userMessage.role === "user" && userMessage.sentAt) {
                lastMessage.sentAt = userMessage.sentAt;
              }
              // 添加思考步骤
              if (thinkingStepsToSave) {
                (lastMessage as any).thinkingSteps = thinkingStepsToSave;
              }
            }
            return newMessages;
          });
          refetchBalance();
          // toast.success(`消耗 ${data.newBalance} 🐟币`); // 移除成功提示，避免干扰
          
          // 异步生成标题，不阻塞当前流程
          if (conversationId) {
            // 获取用户消息内容
            const userMessageContent = messages.find(m => m.role === "user")?.content || "";
            // 异步生成标题，不阻塞当前流程
            generateTitleMutation.mutate(
              {
                conversationId,
                userMessage: userMessageContent,
              },
              {
                onSuccess: () => {
                  // 刷新对话列表以显示新标题
                  refetchConversations();
                },
                onError: (error: any) => {
                  console.error('生成标题失败:', error);
                },
              }
            );
          }
          
          // 生成推荐追问（使用streamedContent作为AI回复内容）
          if (streamedContent) {
            // 获取用户消息内容
            const userMessageContent = messages.find(m => m.role === "user")?.content || "";
            generateSuggestedQuestions(streamedContent, userMessageContent);
          }
        },
        onError: (error) => {
          setIsStreamingMessage(false);
          
          // 显示用户友好的错误提示
          let userFriendlyError = '';
          let errorIcon = '⚠️';
          
          if (error.includes('配额已用完') || error.includes('今日对话配额已用完')) {
            userFriendlyError = t('chat.errors.quotaExceeded');
            errorIcon = '🚨';
          } else if (error.includes('LLM stream invoke failed')) {
            userFriendlyError = t('chat.errors.serverError');
          } else if (error.includes('余额不足')) {
            userFriendlyError = t('chat.errors.insufficientBalance');
            errorIcon = '🐟';
          } else if (error.includes('请选择')) {
            userFriendlyError = error;
          } else {
            userFriendlyError = t('chat.errors.unknownError');
          }
          
          // 在toast中显示错误
          toast.error(userFriendlyError, {
            duration: 8000, // 配额错误显示更长时间
          });
          
          // 在对话框中显示错误消息，替换占位的助手消息
          setMessages((prev) => {
            const newMessages = [...prev];
            // 检查最后一条是否是助手消息
            if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
              // 获取失败的用户消息（倍数第二条）
              const failedUserMessage = newMessages.length >= 2 && newMessages[newMessages.length - 2].role === 'user' 
                ? newMessages[newMessages.length - 2] 
                : null;
              
              // 替换为错误消息，而不是移除
              newMessages[newMessages.length - 1] = {
                role: 'assistant',
                content: `${errorIcon} **错误**\n\n${userFriendlyError}`,
                timestamp: Date.now(),
                isError: true, // 标记为错误消息
                failedMessage: failedUserMessage ? {
                  content: typeof failedUserMessage.content === 'string' ? failedUserMessage.content : '',
                  images: failedUserMessage.images,
                  files: (failedUserMessage as any).files, // 保存文件信息
                } : undefined,
              };
            }
            return newMessages;
          });
        },
      },
      selectedPackageId ?? undefined,
      hasVisionContent
    );
  };

  // 生成推荐追问
  const generateSuggestedQuestions = async (assistantResponse: string, userMessage?: string) => {
    try {
      // 构建历史对话上下文（最近10条消息）
      const conversationHistory = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      
      // 调用后端API生成智能推荐追问
      generateSuggestedQuestionsMutation.mutate(
        {
          assistantResponse,
          userMessage,
          conversationHistory,
        },
        {
          onSuccess: (result) => {
            if (result.questions && result.questions.length > 0) {
              setSuggestedQuestions(result.questions);
            }
          },
          onError: (error) => {
            console.error('生成推荐追问失败:', error);
            // 失败时使用默认问题
            setSuggestedQuestions([
              "能详细解释一下吗？",
              "还有其他相关的信息吗？",
              "这个结果的依据是什么？"
            ]);
          },
        }
      );
    } catch (error) {
      console.error('生成推荐追问失败:', error);
    }
  };

  const handleDeleteConversation = (id: number) => {
    if (confirm(t('chat.confirmDelete'))) {
      deleteConversationMutation.mutate({ id });
    }
  };

  const handleClearHistory = () => {
    if (confirm('确定要清空当前对话的所有消息吗？')) {
      setMessages([]);
      toast.success('已清空对话历史');
    }
  };

  const handleExportConversation = async (id: number) => {
    try {
      const result = await utils.conversation.exportMarkdown.fetch({ id });
      const blob = new Blob([result.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("对话已导出为Markdown格式");
    } catch (error: any) {
      toast.error(error.message || "导出对话失败");
    }
  };

  const handleExportPdf = async (id: number) => {
    try {
      toast.info("正在生成PDF...");
      const result = await exportPdfMutation.mutateAsync({ id });
      
      // 直接下载S3上的PDF文件
      const a = document.createElement("a");
      a.href = result.url;
      a.download = result.filename;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      toast.success("对话已导出为PDF格式");
    } catch (error: any) {
      toast.error(error.message || "导出PDF失败");
    }
  };

  // 快捷键支持
  useKeyboardShortcuts([
    {
      key: "Enter",
      ctrl: true,
      handler: () => {
        const value = chatInputRef.current?.getValue() || "";
        if (value.trim() || uploadedImages.length > 0 || uploadedFiles.length > 0) {
          handleSendMessage(value);
          chatInputRef.current?.clear();
        }
      },
      description: "发送消息",
    },
    {
      key: "n",
      ctrl: true,
      handler: () => {
        if (selectedModelId || selectedPackageId) {
          createConversationMutation.mutate({
            modelId: selectedModelId || modelPackages?.[0]?.primaryModelId || chatModels?.[0]?.id || 1,
            title: "新对话",
          });
        } else {
          toast.error("请先选择AI模型或套餐");
        }
      },
      description: "新建对话",
    },
    {
      key: "?",
      shift: true,
      handler: () => setShowShortcutsHelp(true),
      description: "显示快捷键帮助",
    },
  ]);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  return (
    <DashboardLayout>
      {/* 超宽屏三栏布局容器 */}
      <div className="flex h-[calc(100dvh-3.5rem)] md:h-[calc(100vh-4rem)] max-h-[calc(100dvh-3.5rem)] md:max-h-[calc(100vh-4rem)] overflow-hidden">
        {/* 中间主要内容区域 */}
        <div 
          ref={chatContainerRef}
          className="flex flex-col flex-1 overflow-hidden relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 全屏拖拽遮罩层 */}
        {isDragging && (
          <div className="absolute inset-0 bg-primary/5 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-background/95 border-2 border-dashed border-primary rounded-2xl p-8 md:p-12 shadow-2xl">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-lg md:text-xl font-semibold text-primary mb-1">释放以上传文件</p>
                  <p className="text-sm text-muted-foreground">支持图片、PDF、Word、Excel等格式</p>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 顶部工具栏 */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-3 md:mb-4 flex-shrink-0 gap-2 md:gap-3">
          <div className="flex items-center gap-3 md:gap-4 flex-shrink-0 w-full md:w-auto">
            {/* 移动端汉堡菜单按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden flex-shrink-0"
              onClick={() => setShowMobileSidebar(true)} style={{marginRight: '-8px', marginBottom: '-2px', marginLeft: '-13px'}}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-xl md:text-2xl font-bold flex-shrink-0 hidden md:block" style={{marginLeft: '66px'}}></h1>
            <div className="hidden md:flex flex-shrink-0 ml-auto md:ml-0">
              <FishCoinBalance
                showSyncButton={true}
                onBalanceUpdate={() => refetchBalance()} 
                balance={balance?.balance}
                loading={isLoadingBalance}
                size="sm"
                showIcon={true}
              />
            </div>
            {/* 移动端套餐选择器 */}
            <div className="md:hidden flex-1 min-w-0">
              <Select
                value={selectedPackageId?.toString() || ""}
                onValueChange={async (value) => {
                  if (value) {
                    const newPackageId = Number(value);
                    setSelectedPackageId(newPackageId);
                    setSelectedModelId(null);
                    localStorage.setItem('preferredPackageId', newPackageId.toString());
                    if (selectedConversationId) {
                      try {
                        await updatePackageMutation.mutateAsync({
                          id: selectedConversationId,
                          packageId: newPackageId,
                        });
                        toast.success("已切换到新套餐");
                      } catch (error) {
                        console.error("更新对话套餐失败:", error);
                        toast.error("切换套餐失败");
                      }
                    }
                  }
                }}
              >
                <SelectTrigger className="text-sm h-[34px] w-full" style={{paddingLeft: '8px', paddingRight: '4px'}}>
                  <div className="font-medium truncate">
                    {selectedPackageId
                      ? modelPackages?.find((p: any) => p.id === selectedPackageId)?.displayName || '选择套餐'
                      : '选择套餐'}
                  </div>
                </SelectTrigger>
                <SelectContent className="w-[280px]">
                  {modelPackages && modelPackages
                    .filter((pkg: any) => pkg.enabled)
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((pkg: any) => (
                      <SelectItem key={pkg.id} value={pkg.id.toString()} className="py-3 cursor-pointer">
                        <div className="flex flex-col items-start w-full">
                          <div className="font-medium mb-1">{pkg.displayName}</div>
                          <div className="text-xs text-muted-foreground">{pkg.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {/* 移动端思考步骤按钮（只在有思考步骤时显示） */}
            {realtimeThinkingSteps.length > 0 && (
              <Sheet open={showThinkingPanel} onOpenChange={setShowThinkingPanel}>
                <SheetTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="md:hidden h-8 w-8 p-0 flex-shrink-0 relative"
                    title={t('chat.viewThinkingSteps')}
                  >
                    <Brain className="h-4 w-4" />
                    {/* 小红点提示 */}
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[90vw] sm:w-[400px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{t('chat.thinkingSteps')}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <ThinkingProcessPanel steps={realtimeThinkingSteps} />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            {/* 移动端新对话按钮（右上角图标） */}
            <Button
              onClick={handleCreateConversation}
              size="sm"
              className="md:hidden h-8 w-8 p-0 flex-shrink-0 ml-auto"
              title={t('chat.newConversation')}
              disabled={createConversationMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>

          </div>
          <div className="hidden md:flex items-center gap-2 w-full md:w-auto flex-wrap md:flex-nowrap">
            
            {/* 语音对话入口 */}
            <Link href="/voice-chat">
              <Button
                size="sm"
                variant="outline"
                className="hidden md:flex items-center gap-1.5 h-8"
                title="语音对话"
              >
                <Headphones className="h-3.5 w-3.5" />
                <span className="text-xs">语音对话</span>
              </Button>
            </Link>
            {/* 模型档次选择器 */}
            <Select
              value={selectedPackageId?.toString() || ""}
              onValueChange={async (value) => {
                if (value) {
                  const newPackageId = Number(value);
                  setSelectedPackageId(newPackageId);
                  setSelectedModelId(null); // 清除单个模型选择
                  
                  // 保存用户偏好到 localStorage
                  localStorage.setItem('preferredPackageId', newPackageId.toString());
                  
                  // 如果当前有活跃对话，更新对话的套餐ID
                  if (selectedConversationId) {
                    try {
                      await updatePackageMutation.mutateAsync({
                        id: selectedConversationId,
                        packageId: newPackageId,
                      });
                      toast.success("已切换到新套餐，后续消息将使用新套餐的模型");
                    } catch (error) {
                      console.error("更新对话套餐失败:", error);
                      toast.error("切换套餐失败，请重试");
                    }
                  }
                }
              }}
            >
              <SelectTrigger 
                className="text-sm md:text-base h-auto py-2 w-[160px] h-[37px] mt-0 mr-0 mb-0 ml-0 md:w-56 md:h-auto md:mt-0 md:mr-0 md:mb-0 md:ml-0" 
                style={{paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '10px'}}
              >
                <div className="flex flex-col items-start gap-0.5 w-full">
                  <div className="font-medium">
                    {selectedPackageId
                      ? modelPackages?.find((p: any) => p.id === selectedPackageId)?.displayName || '选择套餐'
                      : '选择AI模型套餐'}
                  </div>
                  {selectedPackageId && (
                    <div className="text-xs text-muted-foreground truncate max-w-full">
                      {modelPackages?.find((p: any) => p.id === selectedPackageId)?.description || ''}
                    </div>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent className="w-[280px]">
                {modelPackages && modelPackages
                  .filter((pkg: any) => pkg.enabled)
                  .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                  .map((pkg: any) => (
                    <SelectItem 
                      key={pkg.id} 
                      value={pkg.id.toString()}
                      className="py-3 cursor-pointer"
                    >
                      <div className="flex flex-col items-start w-full">
                        <div className="font-medium mb-1">{pkg.displayName}</div>
                        <div className="text-xs text-muted-foreground">{pkg.description}</div>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreateConversation} disabled={createConversationMutation.isPending} className="hidden md:flex">
              <Plus className="mr-2 h-4 w-4" />
              {t('chat.newConversation')}
            </Button>
            {/* 桌面端思考步骤按钮（只在有思考步骤时显示） */}
            {realtimeThinkingSteps.length > 0 && (
              <Sheet open={showThinkingPanel} onOpenChange={setShowThinkingPanel}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    className="hidden md:flex relative"
                  >
                    <Brain className="mr-2 h-4 w-4" />
                    {t('chat.thinkingSteps')}
                    {/* 小红点提示 */}
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[90vw] sm:w-[400px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{t('chat.thinkingSteps')}</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <ThinkingProcessPanel steps={realtimeThinkingSteps} />
                  </div>
                </SheetContent>
              </Sheet>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  className="hidden md:flex"
                  disabled={messages.length === 0} style={{fontSize: '15px', borderRadius: '13px', opacity: '1.3', borderWidth: '1px'}}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  导出对话
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" />
                  打印为PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToMarkdown}>
                  <FileText className="mr-2 h-4 w-4" />
                  导出为Markdown
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToWord}>
                  <FileDown className="mr-2 h-4 w-4" />
                  导出为Word
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* 移动端对话列表抽屉 */}
          {showMobileSidebar && (
            <div className="fixed inset-0 z-50 md:hidden">
              {/* 背景遮罩 */}
              <div 
                className="absolute inset-0 bg-black/50" 
                onClick={() => setShowMobileSidebar(false)}
              />
              {/* 侧边栏内容 */}
              <Card className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] flex flex-col shadow-xl">
                <CardContent className="p-4 overflow-y-auto flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">对话历史</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMobileSidebar(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <FishCoinBalance
                      showSyncButton={true}
                      onBalanceUpdate={() => refetchBalance()}
                      balance={balance?.balance}
                      loading={isLoadingBalance}
                      size="sm"
                      showIcon={true}
                    />
                    <Link href="/voice-chat">
                      <Button size="sm" variant="outline" className="flex items-center gap-1.5 h-8">
                        <Headphones className="h-3.5 w-3.5" />
                        <span className="text-xs">语音对话</span>
                      </Button>
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {conversations?.map((conv) => (
                      <div
                        key={conv.id}
                        className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center justify-between group ${
                          selectedConversationId === conv.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => {
                          setSelectedConversationId(conv.id);
                          loadConversationMessages(conv.id);
                          setShowMobileSidebar(false);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" title={conv.title}>{conv.title}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs opacity-70">
                              {new Date(conv.createdAt).toLocaleDateString("zh-CN")}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* 对话列表 - 桌面端显示 */}
          {/* 折叠后的展开按钮 */}
          {isHistoryCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsHistoryCollapsed(false)}
              className="hidden md:flex h-10 w-10 p-0 flex-shrink-0 rounded-full"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
          
          {!isHistoryCollapsed && (
          <Card className="hidden md:flex w-64 flex-shrink-0 overflow-hidden flex-col">
            <CardContent className="p-4 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">对话历史</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsHistoryCollapsed(true)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {conversations?.map((conv) => (
                  <div
                    key={conv.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors flex items-center justify-between group ${
                      selectedConversationId === conv.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => {
                      setSelectedConversationId(conv.id);
                      // 加载对话历史消息
                      loadConversationMessages(conv.id);
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" title={conv.title}>{conv.title}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs opacity-70">
                          {new Date(conv.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                        {conv.tags && conv.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {conv.tags.slice(0, 2).map((tag: any) => (
                              <span
                                key={tag.id}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: tag.color + '20', color: tag.color }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {conv.tags.length > 2 && (
                              <span className="text-xs opacity-70">+{conv.tags.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div 
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-transparent h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            setManagingTagsForConversation(conv.id);
                            setShowTagManagement(true);
                          }}>
                            <Tag className="h-4 w-4 mr-2" />
                            管理标签
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportConversation(conv.id)}>
                            <Download className="h-4 w-4 mr-2" />
                            导出为Markdown
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportPdf(conv.id)}>
                            <Download className="h-4 w-4 mr-2" />
                            导出为PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteConversation(conv.id);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            删除对话
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
                {(!conversations || conversations.length === 0) && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    暂无对话历史
                    <br />
                    {t("chat.clickNewToStart")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* 对话区域 */}
          <Card className="flex-1 flex flex-col overflow-hidden" style={{paddingTop: '0px', paddingBottom: '0px'}}>
            <CardContent className="px-0 pt-2 pb-2 flex flex-col flex-1 min-h-0" style={{paddingBottom: '26px'}}>
              {/* 消息列表 */}
              <div 
                ref={messagesContainerRef}
                className={cn(
                  "flex-1 overflow-y-auto overflow-x-hidden mb-2 md:mb-2 space-y-1 md:space-y-1 relative scroll-smooth md:mx-auto md:w-full transition-all duration-300 ease-in-out",
                  isSidebarOpen && !isHistoryCollapsed ? "md:max-w-[850px]" : isSidebarOpen || !isHistoryCollapsed ? "md:max-w-[1100px]" : "md:max-w-[1600px]"
                )}
                style={{ overflowAnchor: 'auto' }}
                onScroll={(e) => {
                  const target = e.target as HTMLDivElement;
                  const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 200;
                  setShowScrollToBottom(!isNearBottom);
                }}
              >
                {messages.length === 0 && !selectedConversationId && (
                  <EmptyConversationState
                    onSelectTemplate={(template) => {
                      // 将模板填充到输入框
                      chatInputRef.current?.setInput(template);
                      chatInputRef.current?.focus();
                    }}
                  />
                )}
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} group ${index === messages.length - 1 ? "animate-fade-in" : ""} px-1 md:px-2`}
                  >
                    <div className={cn(
                      "flex flex-col gap-0.5 relative",
                      msg.role === "user" 
                        ? cn(
                            "max-w-[85%]",
                            isSidebarOpen ? "md:max-w-[70%]" : "md:max-w-[80%]"
                          )
                        : "w-full max-w-full"
                    )} style={{ wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                      <div className="py-2 md:py-3">
                        {/* 模拟思考流程卡片 - 只在移动端显示，且只在最后一条assistant消息中显示 */}
                        {msg.role === "assistant" && index === messages.length - 1 && simulatedSteps.length > 0 && (
                          <div className="xl:hidden mb-3">
                            <ThinkingProcessCard steps={simulatedSteps} />
                          </div>
                        )}
                        
                        {/* 思考步骤 - 只在assistant消息中显示 */}
                        {msg.role === "assistant" && (msg as any).thinkingSteps && (
                          <ThinkingSteps
                            steps={(msg as any).thinkingSteps}
                            isThinking={false}
                            startTime={(msg as any).sentAt}
                          />
                        )}
                        {/* 时间戳 - 移到消息气泡内部 */}
                        {msg.timestamp && (
                          <div 
                            className={`text-[10px] text-muted-foreground/60 mb-1 ${
                              msg.role === "user" ? "text-right" : "text-left"
                            }`}
                            title={formatDetailedTime(msg.timestamp)}
                          >
                            {formatRelativeTime(msg.timestamp)}
                          </div>
                        )}
                        {/* 消息操作按钮（hover显示，移动端隐藏） */}
                        <div className={`hidden md:flex absolute ${msg.role === "user" ? "left-0 -translate-x-full" : "right-0 translate-x-full"} top-2 opacity-0 group-hover:opacity-100 transition-opacity gap-1 px-2`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              toast.success(t('chat.copy'));
                            }}
                            title={t('chat.copy')}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {msg.role === "assistant" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => {
                                  // TODO: 实现重新生成功能
                                  toast.info(t('chat.regenerate'));
                                }}
                                title={t('chat.regenerate')}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    title={t("chat.downloadBtn")}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem onClick={async () => {
                                    const blob = new Blob([msg.content], { type: "text/plain" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `message-${Date.now()}.md`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    toast.success("已下载");
                                  }}>
                                    下载为Markdown
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={async () => {
                                    let progress = 0;
                                    const toastId = "generate-doc";
                                    
                                    toast.loading(`正在生成Word文档... 0%`, { id: toastId });
                                    const progressInterval = setInterval(() => {
                                      progress += 10;
                                      if (progress <= 90) {
                                        toast.loading(`正在生成Word文档... ${progress}%`, { id: toastId });
                                      }
                                    }, 200);
                                    
                                    generateDocumentMutation.mutate({
                                      title: `对话内容-${new Date().toLocaleDateString('zh-CN')}`,
                                      content: msg.content,
                                    }, {
                                      onSuccess: (result) => {
                                        clearInterval(progressInterval);
                                        toast.success("文档生成成功！正在下载...", { id: toastId });
                                        const a = document.createElement("a");
                                        a.href = result.url;
                                        a.download = result.fileName;
                                        a.click();
                                        
                                        setTimeout(() => {
                                          toast.success("文档下载完成！", { id: toastId });
                                        }, 500);
                                      },
                                      onError: (error: any) => {
                                        clearInterval(progressInterval);
                                        toast.error(error.message || "文档生成失败", { id: toastId });
                                      }
                                    });
                                  }}>
                                    下载为Word
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={async () => {
                                    if (selectedConversationId) {
                                      exportPdfMutation.mutate({ id: selectedConversationId });
                                    } else {
                                      toast.error("请先保存对话");
                                    }
                                  }}>
                                    下载为PDF
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(t('chat.confirmDelete'))) {
                                setMessages(prev => prev.filter((_, i) => i !== index));
                                toast.success(t('chat.delete'));
                              }
                            }}
                            title={t('chat.delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {msg.role === "assistant" ? (
                          <div className="flex flex-col w-full max-w-[850px] ml-0 pl-0">
                            {/* AI头像 - 圆形动感图标（移动到顶部左侧） */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <img 
                                  src="/ai-avatar.png" 
                                  alt="AI" 
                                  className="w-7 h-7 rounded-full flex-shrink-0 object-cover"
                                />
                                <span className="text-sm text-muted-foreground">{t("chat.aiAssistant")}</span>
                                {msg.timestamp && (
                                  <span className="text-xs text-muted-foreground/70">
                                    {formatSmartTime(msg.timestamp)}
                                  </span>
                                )}
                              </div>
                              {/* 复制按钮 */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content);
                                  toast.success(t('chat.copied'));
                                }}
                                title={t('chat.copy')}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            {/* 移除冗余图标，保持单一头像设计 */}
                            <div className="flex-1 min-w-0 space-y-2 overflow-visible text-[15px] leading-relaxed text-foreground/90 min-h-[24px] md:border-l-4 md:border-blue-500 md:pl-4" style={{ wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                              {/* 检查是否是意图确认消息 */}
                              {(msg as any).isIntentConfirm ? (
                                <IntentConfirmCard
                                  intent={(msg as any).intentConfirmData.intent}
                                  confidence={(msg as any).intentConfirmData.confidence}
                                  reasoning={(msg as any).intentConfirmData.reasoning}
                                  imageUrl={(msg as any).intentConfirmData.imageUrl}
                                  onConfirm={async (intent) => {
                                    setIsProcessingIntent(true);
                                    try {
                                      const imageUrl = (msg as any).intentConfirmData.imageUrl;
                                      
                                      // 移除确认卡片
                                      setMessages(prev => prev.filter(m => m.timestamp !== msg.timestamp));
                                      
                                      // 根据意图类型触发相应功能
                                      if (intent === 'image_generation') {
                                        // 触发图片生成：使用LLM分析图片并生成描述
                                        toast.info(t('chat.video.analyzingImage'));
                                        
                                        // 构造一个特殊的用户消息，包含图片和生成指令
                                        const generationMessage = {
                                          role: 'user' as const,
                                          content: [
                                            {
                                              type: 'text',
                                              text: '请分析这张图片的内容、风格和主题，然后生成一张类似风格的图片。'
                                            },
                                            {
                                              type: 'image_url',
                                              image_url: { url: imageUrl }
                                            }
                                          ]
                                        };
                                        
                                        // 添加用户消息到界面
                                        const userMsg = {
                                          id: Date.now(),
                                          role: 'user' as const,
                                          content: '生成类似风格的图片',
                                          timestamp: Date.now(),
                                          sentAt: Date.now(),
                                          images: [{ url: imageUrl, name: '参考图片' }]
                                        };
                                        setMessages(prev => [...prev, userMsg]);
                                        
                                        // 添加助手消息占位
                                        const assistantMsg = {
                                          id: Date.now() + 1,
                                          role: 'assistant' as const,
                                          content: '',
                                          timestamp: Date.now()
                                        };
                                        setMessages(prev => [...prev, assistantMsg]);
                                        setIsStreamingMessage(true);
                                        
                                        // 调用流式API生成图片
                                        await sendStreamMessage(
                                          selectedModelId ?? 0,
                                          [...messages, userMsg, generationMessage],
                                          selectedConversationId ?? undefined,
                                          {
                                            onStart: (data) => {
                                              console.log('[Intent Confirm] Image generation started');
                                            },
                                            onContent: (content) => {
                                              setMessages((prev) => {
                                                const newMessages = [...prev];
                                                const lastMessage = newMessages[newMessages.length - 1];
                                                if (lastMessage && lastMessage.role === "assistant") {
                                                  lastMessage.content = (lastMessage.content || "") + content;
                                                }
                                                return newMessages;
                                              });
                                            },
                                            onImagePlaceholder: (data) => {
                                              setMessages((prev) => {
                                                const newMessages = [...prev];
                                                const lastMessage = newMessages[newMessages.length - 1];
                                                if (lastMessage && lastMessage.role === "assistant") {
                                                  if (!lastMessage.images) lastMessage.images = [];
                                                  lastMessage.images.push({ 
                                                    url: data.placeholderUrl, 
                                                    name: data.prompt,
                                                    isPlaceholder: true
                                                  });
                                                }
                                                return newMessages;
                                              });
                                            },
                                            onImage: (data) => {
                                              setMessages((prev) => {
                                                const newMessages = [...prev];
                                                const lastMessage = newMessages[newMessages.length - 1];
                                                if (lastMessage && lastMessage.role === "assistant") {
                                                  if (lastMessage.images) {
                                                    const placeholderIndex = lastMessage.images.findIndex((img: any) => img.isPlaceholder);
                                                    if (placeholderIndex !== -1) {
                                                      lastMessage.images[placeholderIndex] = { 
                                                        url: data.imageUrl, 
                                                        name: data.prompt,
                                                        placeholderUrl: data.placeholderUrl
                                                      };
                                                    } else {
                                                      lastMessage.images.push({ url: data.imageUrl, name: data.prompt });
                                                    }
                                                  } else {
                                                    lastMessage.images = [{ url: data.imageUrl, name: data.prompt }];
                                                  }
                                                }
                                                return newMessages;
                                              });
                                            },
                                            onDone: () => {
                                              setIsStreamingMessage(false);
                                              refetchBalance();
                                              toast.success('图片生成完成！');
                                            },
                                            onError: (error) => {
                                              setIsStreamingMessage(false);
                                              toast.error(error || '图片生成失败');
                                            }
                                          },
                                          selectedPackageId ?? undefined,
                                          true // hasVisionContent
                                        );
                                        
                                      } else if (intent === 'video_generation') {
                                        // 触发视频生成：使用LLM分析图片并生成视频描述
                                        toast.info(t('chat.video.analyzing'));
                                        
                                        // 调用LLM分析图片并生成描述
                                        const descriptionResponse = await fetch('/api/chat/stream', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          credentials: 'include',
                                          body: JSON.stringify({
                                            modelId: selectedModelId ?? 0,
                                            messages: [
                                              {
                                                role: 'user',
                                                content: [
                                                  {
                                                    type: 'text',
                                                    text: '请用一句话描述这张图片的内容和场景，用于生成视频。只返回描述文字，不要其他内容。'
                                                  },
                                                  {
                                                    type: 'image_url',
                                                    image_url: { url: imageUrl }
                                                  }
                                                ]
                                              }
                                            ],
                                            packageId: selectedPackageId,
                                            hasVisionContent: true
                                          })
                                        });
                                        
                                        if (!descriptionResponse.ok) {
                                          throw new Error('分析图片失败');
                                        }
                                        
                                        // 读取流式响应获取描述
                                        const reader = descriptionResponse.body?.getReader();
                                        const decoder = new TextDecoder();
                                        let description = '';
                                        
                                        if (reader) {
                                          while (true) {
                                            const { done, value } = await reader.read();
                                            if (done) break;
                                            
                                            const chunk = decoder.decode(value);
                                            const lines = chunk.split('\n');
                                            
                                            for (const line of lines) {
                                              if (line.startsWith('data: ')) {
                                                try {
                                                  const data = JSON.parse(line.slice(6));
                                                  if (data.type === 'content') {
                                                    description += data.content;
                                                  }
                                                } catch (e) {
                                                  // 忽略解析错误
                                                }
                                              }
                                            }
                                          }
                                        }
                                        
                                        // 生成视频
                                        const result = await generateVideoMutation.mutateAsync({
                                          prompt: description || t('chat.video.defaultPrompt'),
                                          duration: 5
                                        });
                                        
                                        // 添加视频任务卡片到消息流
                                        const videoTaskMessage = {
                                          id: Date.now(),
                                          role: 'assistant' as const,
                                          content: `<VideoTaskCard taskId="${result.taskId}" prompt="${description.replace(/"/g, '&quot;')}" />`,
                                          timestamp: Date.now(),
                                          isVideoTask: true,
                                          videoTaskId: result.taskId,
                                          videoPrompt: description
                                        };
                                        
                                        setMessages(prev => [...prev, videoTaskMessage]);
                                        toast.success(t('chat.videoTaskCreated', { taskId: result.taskId }));
                                        refetchBalance();
                                        
                                      } else if (intent === 'document_processing') {
                                        // 触发文档处理：使用LLM识别并分析文档
                                        toast.info('正在识别并分析文档...');
                                        
                                        // 构造一个特殊的用户消息，包含图片和处理指令
                                        const processingMessage = {
                                          role: 'user' as const,
                                          content: [
                                            {
                                              type: 'text',
                                              text: '请识别并分析这份文档的内容，提取关键信息。'
                                            },
                                            {
                                              type: 'image_url',
                                              image_url: { url: imageUrl }
                                            }
                                          ]
                                        };
                                        
                                        // 添加用户消息到界面
                                        const userMsg = {
                                          id: Date.now(),
                                          role: 'user' as const,
                                          content: '处理文档',
                                          timestamp: Date.now(),
                                          sentAt: Date.now(),
                                          images: [{ url: imageUrl, name: '文档图片' }]
                                        };
                                        setMessages(prev => [...prev, userMsg]);
                                        
                                        // 添加助手消息占位
                                        const assistantMsg = {
                                          id: Date.now() + 1,
                                          role: 'assistant' as const,
                                          content: '',
                                          timestamp: Date.now()
                                        };
                                        setMessages(prev => [...prev, assistantMsg]);
                                        setIsStreamingMessage(true);
                                        
                                        // 调用流式API处理文档
                                        await sendStreamMessage(
                                          selectedModelId ?? 0,
                                          [...messages, userMsg, processingMessage],
                                          selectedConversationId ?? undefined,
                                          {
                                            onStart: (data) => {
                                              console.log('[Intent Confirm] Document processing started');
                                            },
                                            onContent: (content) => {
                                              setMessages((prev) => {
                                                const newMessages = [...prev];
                                                const lastMessage = newMessages[newMessages.length - 1];
                                                if (lastMessage && lastMessage.role === "assistant") {
                                                  lastMessage.content = (lastMessage.content || "") + content;
                                                }
                                                return newMessages;
                                              });
                                            },
                                            onDone: () => {
                                              setIsStreamingMessage(false);
                                              refetchBalance();
                                              toast.success('文档处理完成！');
                                            },
                                            onError: (error) => {
                                              setIsStreamingMessage(false);
                                              toast.error(error || '文档处理失败');
                                            }
                                          },
                                          selectedPackageId ?? undefined,
                                          true // hasVisionContent
                                        );
                                      }
                                    } catch (error: any) {
                                      toast.error(error.message || '操作失败');
                                    } finally {
                                      setIsProcessingIntent(false);
                                    }
                                  }}
                                  onCancel={() => {
                                    toast.info('已取消操作');
                                  }}
                                  isProcessing={isProcessingIntent}
                                />
                              ) : (msg as any).isResearchConfirm ? (
                                <ResearchConfirmCard
                                  params={(msg as any).researchConfirmParams}
                                  cost={10}
                                  onConfirm={async (prompt) => {
                                    setIsStartingResearch(true);
                                    try {
                                      const result = await startResearchMutation.mutateAsync({
                                        prompt: prompt,
                                        conversationId: selectedConversationId ?? undefined,
                                      });
                                      const researchMsg = {
                                        role: "assistant" as const,
                                        content: `<ResearchTaskCard taskId="${result.taskId}" prompt="${prompt.replace(/"/g, '&quot;')}" />`,
                                        timestamp: Date.now(),
                                        isResearchTask: true,
                                        researchTaskId: result.taskId,
                                        researchPrompt: prompt,
                                      };
                                      // Remove the confirm card and add the research task card
                                      setMessages(prev => prev.filter(m => !(m as any).isResearchConfirm).concat(researchMsg));
                                      setActiveResearchTaskId(result.taskId);
                                      toast.success(t('chat.research.started', { cost: result.cost }));
                                      refetchBalance();
                                    } catch (error: any) {
                                      toast.error(error.message || t('chat.research.startFailed'));
                                      setMessages(prev => [...prev, {
                                        role: "assistant" as const,
                                        content: error.message || t('chat.research.startFailedRetry'),
                                        timestamp: Date.now(),
                                        isError: true,
                                      }]);
                                    } finally {
                                      setIsStartingResearch(false);
                                    }
                                  }}
                                  onCancel={() => {
                                    toast.info(t('chat.research.cancelled'));
                                  }}
                                  isStarting={isStartingResearch}
                                />
                              ) : (msg as any).isVideoConfirm ? (
                                <VideoConfirmCard
                                  params={(msg as any).videoConfirmParams}
                                  onConfirm={async (params) => {
                                    setIsGeneratingVideo(true);
                                    try {
                                      const videoParams = {
                                        prompt: params.prompt,
                                        duration: (params.duration === 10 ? 10 : 5) as 5 | 10
                                      };
                                      const result = await generateVideoMutation.mutateAsync(videoParams);
                                      
                                      // 移除确认卡片消息
                                      setMessages(prev => prev.filter(m => m.id !== msg.id));
                                      
                                      // 添加视频任务卡片到消息流
                                      const videoTaskMessage = {
                                        id: Date.now(),
                                        role: 'assistant' as const,
                                        content: `<VideoTaskCard taskId="${result.taskId}" prompt="${params.prompt.replace(/"/g, '&quot;')}" />`,
                                        timestamp: Date.now(),
                                        isVideoTask: true,
                                        videoTaskId: result.taskId,
                                        videoPrompt: params.prompt
                                      };
                                      
                                      setMessages(prev => [...prev, videoTaskMessage]);
                                      toast.success(`视频生成任务已创建！任务ID: ${result.taskId}`);
                                      // 刷新余额
                                      refetchBalance();
                                    } catch (error: any) {
                                      toast.error(error.message || t('chat.videoGenFailed'));
                                    } finally {
                                      setIsGeneratingVideo(false);
                                    }
                                  }}
                                  onCancel={() => {
                                    // 移除确认卡片消息
                                    setMessages(prev => prev.filter(m => m.id !== msg.id));
                                    toast.info(t('chat.videoCancelled'));
                                  }}
                                  isGenerating={isGeneratingVideo}
                                />
                              ) : (msg as any).isResearchTask ? (
                                <ResearchTaskCard
                                  taskId={(msg as any).researchTaskId}
                                  prompt={(msg as any).researchPrompt || msg.content}
                                  onOpenSandbox={(id) => setActiveResearchTaskId(id)}
                                />
                              ) : (msg as any).isVideoTask ? (
                                <VideoTaskCard
                                  taskId={(msg as any).videoTaskId}
                                  prompt={(msg as any).videoPrompt}
                                />
                              ) : (
                                <div className="w-full ml-0 pl-0 space-y-3">
                                  {/* 图片区域（全宽，位于顶部） */}
                                  {msg.images && msg.images.length > 0 && (
                                    <div className="w-full ml-0 pl-0 mb-3">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[600px]">
                                        {msg.images.map((img, imgIndex) => (
                                          <div key={imgIndex} className="relative group w-full">
                                            <ProgressiveImage
                                              src={normalizeImageUrl(img.url)}
                                              placeholderSrc={img.placeholderUrl ? normalizeImageUrl(img.placeholderUrl) : undefined}
                                              alt={img.name}
                                              className="w-full h-auto max-w-[400px] max-h-[400px] object-contain cursor-pointer rounded-xl border border-gray-100"
                                              onClick={() => {
                                                setLightboxImages(msg.images!.map(i => ({...i, url: normalizeImageUrl(i.url)})));
                                                setLightboxIndex(imgIndex);
                                                setLightboxOpen(true);
                                              }}
                                            />
                                            {/* 下载按钮 - 移动端始终显示 */}
                                            <button
                                              onClick={() => handleImageDownload(normalizeImageUrl(img.url), img.name)}
                                              className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                              title={t('chat.downloadImage')} style={{backgroundColor: '#ada4a4', paddingLeft: '15px', marginTop: '-8px', marginRight: '-6px', height: '30px'}}
                                            >
                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                              </svg>
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* 显示文本内容 */}
                                  {msg.content && msg.content !== '[图片]' && (() => {
                                    // 检测是否是错误消息
                                    const isErrorMessage = (msg as any).isError;
                                    
                                    // 检测是否包含图片描述（不依赖msg.images，因为onImage事件可能未触发）
                                    const hasImageDescription = 
                                      msg.content.includes('图片描述') || 
                                      msg.content.includes('![AI_IMG]') ||
                                      msg.content.includes('正在为您生成图片');
                                    
                                    return (
                                      <div className={`w-full ml-0 pl-0 space-y-2 ${
                                        isErrorMessage 
                                          ? 'bg-destructive/5 border border-destructive/20 rounded-lg p-4 md:p-5' 
                                          : ''
                                      }`}>
                                        {/* 图片描述标题和折叠按钮 */}
                                        {hasImageDescription && (
                                        <div className="flex items-center justify-between border-b border-border pb-2">
                                          <span className="text-sm font-medium">{t("chat.imageDescription")}</span>
                                          <button
                                            onClick={() => {
                                              setCollapsedDescriptions(prev => {
                                                const newSet = new Set(prev);
                                                const msgIndex = messages.indexOf(msg);
                                                if (newSet.has(msgIndex)) {
                                                  newSet.delete(msgIndex);
                                                } else {
                                                  newSet.add(msgIndex);
                                                }
                                                return newSet;
                                              });
                                            }}
                                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                                          >
                                            {collapsedDescriptions.has(messages.indexOf(msg)) ? (
                                              <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                                <span>{t("chat.expand")}</span>
                                              </>
                                            ) : (
                                              <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                </svg>
                                                <span>{t("chat.collapse")}</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      )}
                                      {/* 图片描述内容 */}
                                      {!collapsedDescriptions.has(messages.indexOf(msg)) && (
                                        <div className="pt-2">
                                          <HighlightedContent 
                                            hasImages={msg.images && msg.images.length > 0}
                                            content={(() => {
                                              // 清理内容：移除markdown图片链接、加载提示、重复标题
                                              let cleanedContent = msg.content;
                                              // 移除所有markdown图片链接 ![...](...)  
                                              cleanedContent = cleanedContent.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
                                              // 移除加载提示
                                              cleanedContent = cleanedContent.replace(/🎨\s*正在为您生成图片，请稍候\.\.\.?/g, '');
                                              cleanedContent = cleanedContent.replace(/🔍\s*正在识别图片.*?…/g, '');
                                              // 移除重复的“图片描述：”标题（markdown加粗格式）
                                              cleanedContent = cleanedContent.replace(/\*\*图片描述：?\s*\*\*/g, '');
                                              // 移除普通的“图片描述：”标题
                                              cleanedContent = cleanedContent.replace(/图片描述：?\s*/g, '');
                                              // 移除多余的空行
                                              cleanedContent = cleanedContent.trim();
                                              return cleanedContent;
                                            })()}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                  })()}
                                  
                                  {/* 重试按钮 - 只在错误消息中显示 */}
                                  {(msg as any).isError && (msg as any).failedMessage && (
                                    <div className="mt-4 pt-4 border-t border-border">
                      <Button
                        variant="outline"
                        size="default"
                        onClick={async () => {
                          const failedMsg = (msg as any).failedMessage;
                          
                          // 移除错误消息和对应的用户消息
                          setMessages(prev => {
                            const newMessages = [...prev];
                            const errorIndex = newMessages.indexOf(msg);
                            if (errorIndex > 0 && newMessages[errorIndex - 1].role === 'user') {
                              // 移除用户消息和错误消息
                              newMessages.splice(errorIndex - 1, 2);
                            } else {
                              // 只移除错误消息
                              newMessages.splice(errorIndex, 1);
                            }
                            return newMessages;
                          });
                          
                          // 恢复图片和文件到状态
                          if (failedMsg.images && Array.isArray(failedMsg.images)) {
                            setUploadedImages(failedMsg.images);
                          }
                          if (failedMsg.files && Array.isArray(failedMsg.files)) {
                            setUploadedFiles(failedMsg.files);
                          }
                          
                          // 等待状态更新后自动发送消息
                          setTimeout(() => {
                            handleSendMessage(failedMsg.content || '');
                          }, 100);
                          
                          toast.info(t('chat.errors.retrying'));
                        }}
                                        className="gap-2 hover:bg-primary hover:text-primary-foreground transition-colors md:px-6 md:py-2"
                                      >
                                        <RotateCcw className="h-4 w-4" />
                                        <span className="font-medium">{t('chat.errors.retryButton')}</span>
                                      </Button>
                                    </div>
                                  )}
                                  
                                  {/* 如果没有msg.images，则从 markdown 中提取图片（向后兼容） */}
                                  {!msg.images && (() => {
                                    const { images: extractedImages } = extractImagesFromMarkdown(msg.content);
                                    return (
                                      <>
                                        {extractedImages.length > 0 && (
                                          <div className="flex flex-wrap gap-2">
                                            {extractedImages.map((img, imgIndex) => (
                                              <ImageWithSkeleton
                                                key={imgIndex}
                                                src={normalizeImageUrl(img.url)}
                                                alt={img.name}
                                                thumbnail={true}
                                                onClick={() => {
                                                  setLightboxImages(extractedImages.map(i => ({...i, url: normalizeImageUrl(i.url)})));
                                                  setLightboxIndex(imgIndex);
                                                  setLightboxOpen(true);
                                                }}
                                                onDownload={handleImageDownload}
                                              />
                                            ))}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2 text-[15px] leading-relaxed" style={{ wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word', maxWidth: '100%' }}>
                            {/* 显示图片缩略图 */}
                            {msg.images && msg.images.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {msg.images.map((img, imgIndex) => (
                                  <ImageWithSkeleton
                                    key={imgIndex}
                                    src={normalizeImageUrl(img.url)}
                                    alt={img.name}
                                    thumbnail={true}
                                    onClick={() => {
                                      setLightboxImages(msg.images!.map(i => ({...i, url: normalizeImageUrl(i.url)})));
                                      setLightboxIndex(imgIndex);
                                      setLightboxOpen(true);
                                    }}
                                    onDownload={handleImageDownload}
                                  />
                                ))}
                              </div>
                            )}
                            {/* 显示文本内容 */}
                            {msg.content && msg.content !== '[图片]' && (
                              <div className="space-y-2">
                                {/* 图片描述标题和折叠按钮 */}
                                {msg.images && msg.images.length > 0 && (
                                  <div className="flex items-center justify-between border-b border-border pb-2">
                                    <span className="text-sm font-medium">图片描述：</span>
                                    <button
                                      onClick={() => {
                                        setCollapsedDescriptions(prev => {
                                          const newSet = new Set(prev);
                                          const msgIndex = messages.indexOf(msg);
                                          if (newSet.has(msgIndex)) {
                                            newSet.delete(msgIndex);
                                          } else {
                                            newSet.add(msgIndex);
                                          }
                                          return newSet;
                                        });
                                      }}
                                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                                    >
                                      {collapsedDescriptions.has(messages.indexOf(msg)) ? (
                                        <>
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                          </svg>
                                          <span>展开</span>
                                        </>
                                      ) : (
                                        <>
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                          </svg>
                                          <span>收起</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                )}
                                {/* 图片描述内容 */}
                                {!collapsedDescriptions.has(messages.indexOf(msg)) && (
                                  <div className="pt-2">
                                    <SafeMarkdownWithDownload content={msg.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '')} />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* 显示思考时间 */}
                      {msg.role === "assistant" && msg.sentAt && msg.respondedAt && (
                        <div className="flex items-center gap-2 px-1 mt-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <span>·</span>
                            <span>{t("chat.thinkingTime")}: {Math.max(0, (msg.respondedAt - msg.sentAt) / 1000).toFixed(2)}s</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isStreamingMessage && (
                  <div className="flex justify-start">
                    <div className="w-full">
                      {/* 思考步骤 */}
                      {currentThinkingSteps.length > 0 && (
                        <ThinkingSteps
                          steps={currentThinkingSteps}
                          isThinking={isStreamingMessage}
                          startTime={thinkingStartTime || undefined}
                        />
                      )}
                      {/* 流式渲染的AI回复内容 */}
                      {streamedContent && (
                        <div className="bg-muted rounded-lg p-4 md:p-4 sm:p-3 md:border-l-4 md:border-blue-500"> {/* 移动端减小padding到12px */}
                          <div className="flex-1 min-w-0">
                            <SafeMarkdownWithDownload content={streamedContent.replace(/!\[[^\]]*\]\([^)]+\)/g, '')} />
                          </div>
                        </div>
                      )}
                      {/* 加载指示器（只在没有内容时显示） */}
                      {!streamedContent && (
                        <ThinkingAnimation elapsedTime={elapsedThinkingTime} />
                      )}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
                
                {/* 滚动到底部按钮 - 玉瑰态风格 */}
                {showScrollToBottom && (
                  <button
                    onClick={() => {
                      messagesContainerRef.current?.scrollTo({
                        top: messagesContainerRef.current.scrollHeight,
                        behavior: 'smooth'
                      });
                    }}
                    className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 w-8 h-8 bg-white/90 hover:bg-white backdrop-blur-sm border border-gray-200 rounded-full shadow-md transition-all duration-300 hover:shadow-lg flex items-center justify-center"
                    title={t('chat.scrollToBottom')}
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 输入框 - 移动端固定在底部 */}
                <div className={cn(
                  "shrink-0 space-y-2 md:space-y-3 px-1 md:px-2 pb-safe border-t border-border/50 md:border-t-0 pt-2 md:mx-auto md:w-full md:pb-2 md:mb-6 transition-all duration-300 ease-in-out",
                  isSidebarOpen ? "md:max-w-[900px]" : "md:max-w-[1400px]"
                )}>
                  {/* 移动端底部安全区垫补 */}
                  <style>{`
                    @supports (padding-bottom: env(safe-area-inset-bottom)) {
                      .pb-safe {
                        padding-bottom: calc(env(safe-area-inset-bottom) + 8px);
                      }
                    }
                    @supports not (padding-bottom: env(safe-area-inset-bottom)) {
                      .pb-safe {
                        padding-bottom: 8px;
                      }
                    }
                    /* 桌面端强制使用极小的padding */
                    @media (min-width: 768px) {
                      .pb-safe {
                        padding-bottom: 2px !important;
                      }
                    }
                  `}</style>
                  {/* 推荐追问 */}
                  {suggestedQuestions.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {suggestedQuestions.map((question, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          className="text-sm"
                          onClick={() => {
                            chatInputRef.current?.setInput(question);
                            setSuggestedQuestions([]);
                            chatInputRef.current?.focus();
                          }}
                        >
                          {question}
                        </Button>
                      ))}
                    </div>
                  )}
                  
                  {/* 当前使用的模型信息提示 - 已隐藏 */}
                  {false && selectedPackageId && (() => {
                    const currentPackage = modelPackages?.find((p: any) => p.id === selectedPackageId);
                    if (!currentPackage) return null;
                    
                    return (
                      <div className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg">
                        <Bot className="h-3.5 w-3.5" />
                        <span>
                          当前使用：<span className="font-medium text-foreground">{currentPackage?.displayName}</span>
                        </span>
                      </div>
                    );
                  })()}
                  
                  {/* 输入框容器 - 移动端优化 */}
                  <div 
                    className={`relative flex flex-col gap-2 px-3 md:px-3 py-2 md:py-2 rounded-2xl border transition-all shadow-sm ${
                      isDragging 
                        ? 'border-primary bg-primary/5 border-2' 
                        : 'border-input bg-card hover:border-primary/50'
                    }`}
                    style={{marginBottom: '-27px', paddingRight: '12px', paddingBottom: '13px'}}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // 只有当离开容器本身时才设置为false
                      if (e.currentTarget === e.target) {
                        setIsDragging(false);
                      }
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                      
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length === 0) return;
                      
                      // 处理每个文件
                      for (const file of files) {
                        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff)$/i.test(file.name);
                        if (isImage) {
                          await handleImageUpload(file);
                        } else {
                          await handleFileUpload(file);
                        }
                      }
                    }}
                  >
                    
                    {/* 已上传的图片预览 */}
                    {uploadedImages.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {uploadedImages.map((img: any, idx) => (
                          <ImageUploadPreview
                            key={idx}
                            url={img.url}
                            name={img.name}
                            progress={img.progress}
                            onRemove={() => setUploadedImages(uploadedImages.filter((_, i) => i !== idx))}
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* 批量上传进度提示 */}
                    {uploadedFiles.length > 0 && (() => {
                      const uploadingCount = uploadedFiles.filter((f: any) => f.progress !== undefined && f.progress < 100).length;
                      const totalCount = uploadedFiles.length;
                      return uploadingCount > 0 ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex-1">
                            <div className="text-xs text-blue-700 font-medium mb-1">
                              {t('chat.uploadProgress', { current: totalCount - uploadingCount, total: totalCount })}
                            </div>
                            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-600 transition-all duration-300"
                                style={{ width: `${((totalCount - uploadingCount) / totalCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}
                    
                    {/* 已上传的文件列表 */}
                    {uploadedFiles.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {uploadedFiles.map((file, idx) => {
                          const { Icon, colorClass, bgClass } = (() => {
                            const extension = file.name.split('.').pop()?.toLowerCase() || '';
                            switch (extension) {
                              case 'pdf':
                                return { Icon: FileText, colorClass: 'text-red-600', bgClass: 'bg-red-50' };
                              case 'doc':
                              case 'docx':
                                return { Icon: FileText, colorClass: 'text-blue-600', bgClass: 'bg-blue-50' };
                              case 'xls':
                              case 'xlsx':
                                return { Icon: FileSpreadsheet, colorClass: 'text-green-600', bgClass: 'bg-green-50' };
                              case 'ppt':
                              case 'pptx':
                                return { Icon: FileType, colorClass: 'text-orange-600', bgClass: 'bg-orange-50' };
                              case 'txt':
                                return { Icon: FileText, colorClass: 'text-gray-600', bgClass: 'bg-gray-50' };
                              default:
                                return { Icon: File, colorClass: 'text-gray-500', bgClass: 'bg-gray-50' };
                            }
                          })();
                          
                          return (
                            <div key={idx} className={`flex flex-col gap-1 px-3 py-2 ${file.error ? 'bg-red-50 border-red-300' : bgClass} rounded-lg group border ${file.error ? 'border-red-300' : 'border-border/50'} min-w-[200px]`}>
                              <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${file.error ? 'text-red-600' : colorClass} flex-shrink-0`} />
                                <span className="text-xs font-medium truncate flex-1">{file.name}</span>
                                <button
                                  onClick={() => setUploadedFiles(uploadedFiles.filter((_, i) => i !== idx))}
                                  className="text-destructive opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                              
                              {/* 文件大小和进度条 */}
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
                                {file.progress !== undefined && file.progress < 100 && (
                                  <div className="flex-1 flex items-center gap-1">
                                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full ${colorClass.replace('text-', 'bg-')} transition-all duration-300`}
                                        style={{ width: `${file.progress}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">{file.progress}%</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* 错误提示和重试按钮 */}
                              {file.error && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] text-red-600 flex-1">{file.error}</span>
                                  <button
                                    onClick={() => retryUpload(file.id!)}
                                    className="text-[10px] text-blue-600 hover:text-blue-700 font-medium underline"
                                  >
                                    {t('chat.retry')}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* LaTeX实时预览 - 使用 chatInputRef 获取当前输入值 */}
                    {chatInputRef.current?.getValue()?.trim() && (
                      <LatexPreview text={chatInputRef.current.getValue()} className="mb-2" />
                    )}
                    
                    {/* 图片风格选择器 */}
                    <div className="flex flex-col gap-2">
                      {/* 风格选择器切换按钮 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowStyleSelector(!showStyleSelector)}
                        className="self-start text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                        type="button"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M12 2v20M2 12h20"/><path d="m19 19-2-2m0 0-2-2m2 2-2 2m2-2 2-2"/><path d="M5 5l2 2m0 0 2 2M7 7 5 9m2-2 2-2"/></svg>
                        {selectedStyle ? t('chat.styleSelector.currentStyle', { style: selectedStyle }) : t('chat.styleSelector.title')}
                      </Button>
                      
                      {/* 风格按钮组 */}
                      {showStyleSelector && (
                        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
                          <TooltipProvider>
                            {[
                              { id: 'realistic', prompt: 'photorealistic, high quality, detailed', preview: '/style-previews/realistic.png' },
                              { id: 'cartoon', prompt: 'cartoon style, vibrant colors, playful', preview: '/style-previews/cartoon.png' },
                              { id: 'watercolor', prompt: 'watercolor painting, soft colors, artistic', preview: '/style-previews/watercolor.png' },
                              { id: 'oil', prompt: 'oil painting, rich textures, classic art style', preview: '/style-previews/oil-painting.png' },
                              { id: 'sketch', prompt: 'pencil sketch, black and white, hand-drawn', preview: '/style-previews/sketch.png' },
                              { id: 'cyberpunk', prompt: 'cyberpunk style, neon lights, futuristic', preview: '/style-previews/cyberpunk.png' },
                              { id: 'anime', prompt: 'anime style, manga art, Japanese animation', preview: '/style-previews/anime.png' },
                              { id: '3d', prompt: '3D render, CGI, high quality rendering', preview: '/style-previews/3d-render.png' },
                            ].map((style) => (
                              <Tooltip key={style.id} delayDuration={300}>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant={selectedStyle === t(`chat.styleSelector.styles.${style.id}`) ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => {
                                      const styleLabel = t(`chat.styleSelector.styles.${style.id}`);
                                      setSelectedStyle(styleLabel);
                                      // 将风格描述添加到消息中
                                      const currentMessage = chatInputRef.current?.getValue()?.trim() || "";
                                      if (currentMessage && !currentMessage.includes(style.prompt)) {
                                        chatInputRef.current?.setInput(`${currentMessage}, ${style.prompt}`);
                                      } else if (!currentMessage) {
                                        chatInputRef.current?.setInput(style.prompt);
                                      }
                                    }}
                                    className="text-xs h-7 px-2"
                                    type="button"
                                  >
                                    {t(`chat.styleSelector.styles.${style.id}`)}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="p-0 border-0 bg-transparent shadow-2xl">
                                  <img 
                                    src={style.preview} 
                                    alt={t(`chat.styleSelector.styles.${style.id}`)} 
                                    className="w-48 h-48 object-cover rounded-lg shadow-xl"
                                  />
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedStyle(null);
                              setShowStyleSelector(false);
                            }}
                            className="text-xs h-7 px-2 text-muted-foreground"
                            type="button"
                          >
                            {t('chat.styleSelector.clear')}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {/* 深度研究模式提示 */}
                    {isResearchMode && (
                      <div className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                        <Brain className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">{t('chat.research.modeEnabled')}</span>
                        <button 
                          onClick={() => setIsResearchMode(false)}
                          className="ml-auto text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {/* 底部输入区域 */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                      {/* 附件上传 */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 md:h-10 md:w-10 rounded-full hover:bg-accent flex-shrink-0"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        disabled={isStreamingMessage}
                        title={t('chat.uploadAttachment')}
                        type="button"
                      >
                        <Paperclip className="h-5 w-5" />
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.heic,.heif,.pdf,.doc,.docx,.txt,.xlsx,.xls,.ppt,.pptx"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          console.log('[FILE INPUT] Files selected:', files.length, files.map(f => ({ name: f.name, type: f.type, size: f.size })));
                          for (const file of files) {
                            // Check by MIME type first, then by file extension for iOS compatibility
                            const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff)$/i.test(file.name);
                            if (isImage) {
                              await handleImageUpload(file);
                            } else {
                              await handleFileUpload(file);
                            }
                          }
                          e.target.value = '';
                        }}
                      />

                      {/* 视频生成按钮已隐藏，现在通过对话提示词直接生成视频 */}
                      {/* <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 md:h-9 md:w-9 rounded-full flex-shrink-0 hover:bg-accent"
                        onClick={() => setVideoDialogOpen(true)}
                        disabled={isStreamingMessage}
                        title={t('chat.video.generate')}
                        type="button"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                      </Button> */}
                    
                    {/* 深度研究模式切换按钮 - 带 Tooltip 引导说明 */}
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isResearchMode ? "default" : "ghost"}
                            size="icon"
                            className={`h-9 w-9 md:h-10 md:w-10 rounded-full flex-shrink-0 transition-all ${
                              isResearchMode 
                                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 scale-105" 
                                : "hover:bg-accent"
                            }`}
                            onClick={() => setIsResearchMode(!isResearchMode)}
                            disabled={isStreamingMessage}
                            type="button"
                          >
                            <Brain className={`h-5 w-5 ${isResearchMode ? "animate-pulse" : ""}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs p-3">
                          <div className="space-y-1.5">
                            <p className="font-semibold text-sm">{t('chat.research.tooltipTitle')}</p>
                            <p className="text-xs text-muted-foreground">{t('chat.research.tooltipDesc')}</p>
                            <p className="text-xs text-yellow-600 dark:text-yellow-400">{t('chat.research.tooltipCost')}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {/* 中间输入区域 - 移动端优化 */}
                    <ChatInput
                      ref={chatInputRef}
                      onChange={(value) => {
                        // 更新输入框内容状态
                        setHasInputContent(value.trim().length > 0);
                      }}
                      onSend={(payload: SendMessagePayload) => {
                        // 从 ChatInput 接收文本和附件
                        // 如果有附件，更新附件状态
                        if (payload.attachments) {
                          if (payload.attachments.images.length > 0) {
                            setUploadedImages(payload.attachments.images);
                          }
                          if (payload.attachments.files.length > 0) {
                            setUploadedFiles(payload.attachments.files);
                          }
                        }
                        // 直接传递text给handleSendMessage，避免异步状态更新问题
                        handleSendMessage(payload.text);
                      }}
                      onPaste={async (e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        
                        // 检查是否粘贴了图片
                        let hasImage = false;
                        for (let i = 0; i < items.length; i++) {
                          const item = items[i];
                          if (item.type.startsWith('image/')) {
                            e.preventDefault();
                            hasImage = true;
                            const file = item.getAsFile();
                            if (file) {
                              await handleImageUpload(file);
                            }
                            break;
                          }
                        }
                        
                        // 如果没有图片，检查是否粘贴了大量文本
                        if (!hasImage) {
                          const text = e.clipboardData?.getData('text');
                          if (text && text.length > 5000) {
                            e.preventDefault();
                            
                            // 创建txt文件
                            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                            const fileName = `pasted-text-${timestamp}.txt`;
                            const file = new (File as any)([blob], fileName, { type: 'text/plain' });
                            
                            // 上传文件
                            toast.info(t('chat.paste.autoPackaging', { chars: text.length }));
                            await handleFileUpload(file);
                            
                            // 清空输入框（如果有内容）
                            chatInputRef.current?.clear();
                          }
                        }
                      }}
                      disabled={isStreamingMessage}
                      uploadedImages={uploadedImages}
                      uploadedFiles={uploadedFiles}
                    />
                    
                      {/* 语音输入 - 按住说话（右侧位置，方便右手点击） */}
                      <PressToTalkButton
                        onTranscribed={(text) => {
                          // 使用 chatInputRef 追加文本
                          const currentValue = chatInputRef.current?.getValue() || "";
                          chatInputRef.current?.setInput(currentValue + text);
                        }}
                        disabled={isStreamingMessage}
                        language="zh"
                      />
                    
                      {/* 右侧发送按钮 */}
                      <Button
                        onClick={() => {
                          const value = chatInputRef.current?.getValue() || "";
                          if (value.trim() || uploadedImages.length > 0 || uploadedFiles.length > 0) {
                            // 直接传递text给handleSendMessage，避免异步状态更新问题
                            handleSendMessage(value);
                            chatInputRef.current?.clear();
                            // 重置输入框内容状态
                            setHasInputContent(false);
                            // 清空附件状态将由 handleSendMessage 处理
                          }
                        }}
                        disabled={isStreamingMessage || (!hasInputContent && uploadedImages.length === 0 && uploadedFiles.length === 0)}
                        size="icon"
                        className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-primary hover:bg-primary/90 flex-shrink-0 shadow-lg transition-all hover:scale-105"
                        type="button"
                      >
                        {isStreamingMessage ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
            </CardContent>
          </Card>
        </div>
        </div>

        {/* 右侧辅助面板（显示AI思考步骤） */}
        <RightSidePanel title={activeResearchTaskId ? t('chat.research.sandbox') : t('chat.thinkingSteps')} defaultCollapsed={false}>
          {activeResearchTaskId ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium">{t('chat.research.taskLabel', { id: activeResearchTaskId })}</span>
                </div>
                <button
                  onClick={() => setActiveResearchTaskId(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                >
                  {t('chat.research.backToThinking')}
                </button>
              </div>
              <div className="flex-1 min-h-0">{sandboxData && <SandboxPanel browser={sandboxData.browser} code={sandboxData.code} terminal={sandboxData.terminal} activeTab={sandboxActiveTab} onTabChange={setSandboxActiveTab} isConnected={sandboxData.isConnected} />}</div>
            </div>
          ) : (
          <div className="space-y-4">
            {/* 模拟思考流程卡片 */}
            {simulatedSteps.length > 0 && (
              <ThinkingProcessCard steps={simulatedSteps} />
            )}
            
            {/* 原有的详细思考步骤 */}
            {realtimeThinkingSteps.length > 0 && (
              <ThinkingProcessPanel steps={realtimeThinkingSteps} />
            )}
            
            {/* AI实时操作日志 */}
            {operationLogs.length > 0 && (
              <OperationLogPanel 
                logs={operationLogs} 
                onClear={() => {
                  setOperationLogs([]);
                  if (selectedConversationId) {
                    saveOperationLogs(selectedConversationId.toString(), []);
                  }
                }}
              />
            )}
            
            {/* 空状态 */}
            {simulatedSteps.length === 0 && realtimeThinkingSteps.length === 0 && operationLogs.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                <p>{t('chat.sandboxPlaceholder')}</p>
                <p>{t("chat.thinkingStepsPlaceholder")}</p>
              </div>
            )}
          </div>
          )}
        </RightSidePanel>
      </div>

      {/* 快捷键帮助 */}
      <KeyboardShortcutsHelp open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp} />
      
      {/* 语音输入对话框 */}
      <VoiceInputDialog
        open={voiceDialogOpen}
        onOpenChange={setVoiceDialogOpen}
        onTranscribed={(text) => {
          // 使用 chatInputRef 追加文本
          const currentValue = chatInputRef.current?.getValue() || "";
          chatInputRef.current?.setInput(currentValue + text);
          setVoiceDialogOpen(false);
        }}
      />

      {/* 视频生成对话框 */}
      <VideoGenerationDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        conversationId={selectedConversationId}
      />

      {/* 视频生成确认对话框 */}
      {videoConfirmParams && (
        <VideoConfirmDialog
          open={videoConfirmOpen}
          onOpenChange={setVideoConfirmOpen}
          videoParams={videoConfirmParams}
          balance={parseFloat(balance?.balance || '0')}
          cost={videoConfirmParams.duration === 5 ? 30 : 50}
          onConfirm={async (params) => {
            setVideoConfirmOpen(false); // 立即关闭对话框,避免重复点击
            setIsGeneratingVideo(true);
            try {
              // 确保duration为5或10
              const videoParams = {
                ...params,
                duration: (params.duration === 10 ? 10 : 5) as 5 | 10
              };
              const result = await generateVideoMutation.mutateAsync(videoParams);
              
              // 添加视频任务卡片到消息流
              const videoTaskMessage = {
                id: Date.now(),
                role: 'assistant' as const,
                content: `<VideoTaskCard taskId="${result.taskId}" prompt="${params.prompt.replace(/"/g, '&quot;')}" />`,
                timestamp: Date.now(),
                isVideoTask: true,
                videoTaskId: result.taskId,
                videoPrompt: params.prompt
              };
              
              setMessages(prev => [...prev, videoTaskMessage]);
              
              toast.success(`视频生成任务已创建！任务ID: ${result.taskId}`);
              setVideoConfirmOpen(false);
              setMessage(''); // 清空输入框
              // 刷新余额
              refetchBalance();
            } catch (error: any) {
              toast.error(error.message || '视频生成失败');
            } finally {
              setIsGeneratingVideo(false);
            }
          }}
          isGenerating={isGeneratingVideo}
        />
      )}
      
      {/* 标签管理对话框 */}
      <TagManagementDialog
        open={showTagManagement}
        onOpenChange={setShowTagManagement}
        conversationId={managingTagsForConversation}
      />
      
      {/* 图片灯箱预览 */}
      {lightboxOpen && (
        <ImageLightbox
          images={lightboxImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onPrevious={() => setLightboxIndex((prev) => (prev - 1 + lightboxImages.length) % lightboxImages.length)}
          onNext={() => setLightboxIndex((prev) => (prev + 1) % lightboxImages.length)}
          onDownload={handleImageDownload}
        />
      )}
    </DashboardLayout>
  );
}
