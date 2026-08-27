// 手动清理残留临时实体并报告每一步结果（诊断 cleanup 失败原因）。
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getResearchStore, clearResearchStoreCache } from '../lib/store.js';

const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const store = getResearchStore(join(home, 'plugin-data', 'hana-research'));
const log = [];
try {
  const tempProjects = store.db.prepare("SELECT id, title, created_at FROM projects WHERE title LIKE '%UI 验证项目-临时%'").all();
  log.push('临时项目: ' + JSON.stringify(tempProjects));
  const tempPapers = store.db.prepare("SELECT id, created_at FROM papers WHERE id LIKE 'local-%'").all();
  log.push('临时论文: ' + JSON.stringify(tempPapers));
  for (const p of tempProjects) {
    store.deleteProject(p.id);
    log.push('已删除项目 ' + p.id);
  }
  for (const p of tempPapers) {
    const stillLinked = store.db.prepare('SELECT 1 FROM project_papers WHERE paper_id = ? LIMIT 1').get(p.id);
    if (stillLinked) { log.push(p.id + ' 仍被项目关联，跳过'); continue; }
    const atts = store.db.prepare('SELECT id FROM attachments WHERE paper_id = ?').all(p.id);
    for (const a of atts) {
      store.db.prepare('DELETE FROM annotations WHERE attachment_id = ?').run(a.id);
      store.db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
    }
    store.db.prepare('DELETE FROM paper_reading_state WHERE paper_id = ?').run(p.id);
    store.db.prepare('DELETE FROM paper_note_documents WHERE paper_id = ?').run(p.id);
    store.db.prepare('DELETE FROM note_citations WHERE paper_id = ?').run(p.id);
    store.db.prepare('DELETE FROM sentence_notes WHERE paper_id = ?').run(p.id);
    store.db.prepare('DELETE FROM papers WHERE id = ?').run(p.id);
    log.push('已清理论文 ' + p.id);
  }
  const totals = store.db.prepare("SELECT (SELECT COUNT(*) FROM papers) AS papers, (SELECT COUNT(*) FROM projects) AS projects").get();
  log.push('清理后: ' + JSON.stringify(totals));
} catch (error) {
  log.push('ERROR: ' + String(error && error.message || error));
}
console.log(log.join('\n'));
clearResearchStoreCache();
