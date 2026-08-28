// 清理临时验证实体（兜底模式，不依赖传入 ID 或宿主 API）：
// 1) 删除所有标题为「UI 验证项目-临时」/「UI 按钮体检-临时」/「UI 工作台按钮-临时」的项目（deleteProject 级联全部子数据）
// 2) 删除所有 local- 前缀且不再属于任何项目的临时论文及其附件/批注/笔记
// 三重防护（明确命名 + local- 前缀 + 无项目关联），真实用户数据不受影响。
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getResearchStore, clearResearchStoreCache } from '../lib/store.js';

const TEMP_PROJECT_PATTERNS = ['%UI 验证项目-临时%', '%UI 按钮体检-临时%', '%UI 工作台按钮-临时%'];

function resolveDataDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return join(home, 'plugin-data', 'hana-research');
}

export default async function cleanupTempEntities() {
  const store = getResearchStore(resolveDataDir());
  const removed = { projects: 0, papers: 0 };
  try {
    const clauses = TEMP_PROJECT_PATTERNS.map(() => 'title LIKE ?').join(' OR ');
    const tempProjects = store.db.prepare(`SELECT id FROM projects WHERE ${clauses}`).all(...TEMP_PROJECT_PATTERNS);
    for (const row of tempProjects) {
      try {
        store.deleteProject(row.id);
        removed.projects += 1;
      } catch { /* 已删除或删除失败，继续 */ }
    }
    const tempPapers = store.db.prepare("SELECT id FROM papers WHERE id LIKE 'local-%'").all();
    for (const row of tempPapers) {
      const stillLinked = store.db.prepare('SELECT 1 FROM project_papers WHERE paper_id = ? LIMIT 1').get(row.id);
      if (stillLinked) continue; // 仍被真实项目关联：绝不删除
      const attachments = store.db.prepare('SELECT id FROM attachments WHERE paper_id = ?').all(row.id);
      for (const a of attachments) {
        store.db.prepare('DELETE FROM annotations WHERE attachment_id = ?').run(a.id);
        store.db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
      }
      store.db.prepare('DELETE FROM paper_reading_state WHERE paper_id = ?').run(row.id);
      store.db.prepare('DELETE FROM paper_note_documents WHERE paper_id = ?').run(row.id);
      store.db.prepare('DELETE FROM note_citations WHERE paper_id = ?').run(row.id);
      store.db.prepare('DELETE FROM sentence_notes WHERE paper_id = ?').run(row.id);
      store.db.prepare('DELETE FROM papers WHERE id = ?').run(row.id);
      removed.papers += 1;
    }
  } finally {
    clearResearchStoreCache();
  }
  return removed;
}
