// 汇总笔记默认模板（十节结构化骨架；仅首次新建且从未保存时注入，已有内容绝不覆盖）。
// 独立纯 JS 模块：Node 测试可直接导入（tiptap-config.jsx 是 JSX，测试环境无法加载）。
export const SUMMARY_TEMPLATE_JSON = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '核心问题' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '理论基础' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '研究假设' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '研究方法' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '样本与测量' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '主要结果' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '结论' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '局限' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '对当前项目的启示' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '待验证问题' }] },
    { type: 'paragraph' },
  ],
};
