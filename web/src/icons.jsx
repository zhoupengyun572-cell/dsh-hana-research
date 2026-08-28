// 工作区图标库：线性 SVG（stroke 风格，24 viewBox），全部带中文 title 语义。
// 不使用 emoji；图标通过 aria-label/title 提供无障碍与中文提示。
import React from 'react';

function Icon({ title, children, size = 16, className = '' }) {
  return (
    <svg
      className={'wb-icon ' + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

export const IconBack = (p) => (
  <Icon title="返回项目" {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Icon>
);
export const IconOutline = (p) => (
  <Icon title="文档目录" {...p}><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></Icon>
);
export const IconThumbnails = (p) => (
  <Icon title="页面缩略图" {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h4v4H7zM7 13h6M7 16h8" /></Icon>
);
export const IconSearch = (p) => (
  <Icon title="搜索" {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
);
export const IconAnnotations = (p) => (
  <Icon title="批注列表" {...p}><path d="M12 3v4" /><path d="M5 3v4" /><path d="M19 3v4" /><path d="M3 7h18" /><path d="M4 7v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7" /><path d="M8 11h8M8 15h5" /></Icon>
);
export const IconNote = (p) => (
  <Icon title="文献笔记" {...p}><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v3h3" /><path d="M9 11h6M9 15h6" /></Icon>
);
export const IconCollapseLeft = (p) => (
  <Icon title="折叠左侧栏" {...p}><path d="M13 5v14l-8-7z" /><path d="M18 4v16" /></Icon>
);
export const IconCollapseRight = (p) => (
  <Icon title="折叠右侧栏" {...p}><path d="M11 5v14l8-7z" /><path d="M6 4v16" /></Icon>
);
export const IconHighlighter = (p) => (
  <Icon title="高亮" {...p}><path d="m9 11-5.7 5.7a2 2 0 0 0 0 2.8l.2.2a2 2 0 0 0 2.8 0L12 14" /><path d="m9 11 4-4 4 4-4 4z" /><path d="m13 7 4-4 4 4-4 4" /></Icon>
);
export const IconUnderline = (p) => (
  <Icon title="下划线" {...p}><path d="M6 4v6a6 6 0 0 0 12 0V4" /><path d="M4 20h16" /></Icon>
);
export const IconStrike = (p) => (
  <Icon title="删除线" {...p}><path d="M16 4H9a3 3 0 0 0-2.8 4" /><path d="M14 12a4 4 0 0 1 0 8H6" /><path d="M4 12h16" /></Icon>
);
export const IconComment = (p) => (
  <Icon title="添加评论" {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>
);
export const IconQuote = (p) => (
  <Icon title="引用到笔记" {...p}><path d="M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4" /><path d="M20 11h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4" /></Icon>
);
export const IconCopy = (p) => (
  <Icon title="复制" {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>
);
export const IconSpark = (p) => (
  <Icon title="让 AI 解释" {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" /></Icon>
);
export const IconSave = (p) => (
  <Icon title="保存" {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></Icon>
);
export const IconCheck = (p) => (
  <Icon title="已保存" {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
export const IconAlert = (p) => (
  <Icon title="保存失败" {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /></Icon>
);
export const IconDownload = (p) => (
  <Icon title="导出带批注 PDF" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></Icon>
);
export const IconTheme = (p) => (
  <Icon title="主题模式" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const IconDelete = (p) => (
  <Icon title="删除" {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></Icon>
);
export const IconEdit = (p) => (
  <Icon title="编辑" {...p}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></Icon>
);
export const IconChevronDown = (p) => (
  <Icon title="展开" {...p}><path d="m6 9 6 6 6-6" /></Icon>
);
export const IconPlus = (p) => (
  <Icon title="新建" {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const IconBold = (p) => (
  <Icon title="粗体" {...p}><path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" /></Icon>
);
export const IconItalic = (p) => (
  <Icon title="斜体" {...p}><path d="M19 4h-9M14 20H5M15 4 9 20" /></Icon>
);
export const IconH = (p) => (
  <Icon title="标题" {...p}><path d="M6 4v16M18 4v16M6 12h12" /></Icon>
);
export const IconList = (p) => (
  <Icon title="列表" {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></Icon>
);
export const IconTask = (p) => (
  <Icon title="任务列表" {...p}><path d="M11 6h10M11 12h10M11 18h10" /><path d="m3 5 1 1 2-2M3 11l1 1 2-2M3 17l1 1 2-2" /></Icon>
);
export const IconBlockquote = (p) => (
  <Icon title="引用块" {...p}><path d="M6 8h4v6a2 2 0 0 1-2 2M14 8h4v6a2 2 0 0 1-2 2" /><path d="M5 3v3M19 3v3" /></Icon>
);
export const IconCode = (p) => (
  <Icon title="代码块" {...p}><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></Icon>
);
export const IconLink = (p) => (
  <Icon title="链接" {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Icon>
);
export const IconTable = (p) => (
  <Icon title="表格" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16M15 4v16" /></Icon>
);
export const IconUndo = (p) => (
  <Icon title="撤销" {...p}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></Icon>
);
export const IconRedo = (p) => (
  <Icon title="重做" {...p}><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 15-6.7L21 13" /></Icon>
);
export const IconMarkdown = (p) => (
  <Icon title="Markdown" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 15v-6l2 2 2-2v6M14 9h2l2 4 2-4h2" /></Icon>
);
export const IconFilter = (p) => (
  <Icon title="筛选" {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5z" /></Icon>
);
export const IconLocate = (p) => (
  <Icon title="定位到原文" {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Icon>
);
export const IconStale = (p) => (
  <Icon title="原定位已失效" {...p}><path d="M12 9v4M12 17h.01" /><path d="M2 12a10 10 0 1 1 20 0 10 10 0 0 1-20 0z" /></Icon>
);
export const IconPanelLeft = (p) => (
  <Icon title="左侧栏" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Icon>
);
export const IconPanelRight = (p) => (
  <Icon title="右侧栏" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></Icon>
);
export const IconStar = (p) => (
  <Icon title="收藏" {...p}><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z" /></Icon>
);
export const IconStarFilled = (p) => (
  <Icon title="取消收藏" {...p} fill="currentColor" strokeWidth="0"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z" /></Icon>
);
export const IconMore = (p) => (
  <Icon title="更多操作" {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>
);
export const IconTag = (p) => (
  <Icon title="标签" {...p}><path d="M12.6 2.9 21 11.3a2 2 0 0 1 0 2.8l-6.9 6.9a2 2 0 0 1-2.8 0L2.9 12.6A2 2 0 0 1 2.3 11L3 4.6a2 2 0 0 1 1.6-1.6l6.4-.7a2 2 0 0 1 1.6.6z" /><circle cx="8.5" cy="8.5" r="1.3" /></Icon>
);
export const IconRetry = (p) => (
  <Icon title="重试" {...p}><path d="M3 12a9 9 0 1 0 2.6-6.3" /><path d="M3 3v6h6" /></Icon>
);
