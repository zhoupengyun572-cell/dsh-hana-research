// 诊断：local- 前缀临时 paper 及其子数据是否残留（上轮崩溃测试后的清理完整性）。
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getResearchStore, clearResearchStoreCache } from '../lib/store.js';

const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const store = getResearchStore(join(home, 'plugin-data', 'hana-research'));
const papers = store.db.prepare("SELECT id, title FROM papers WHERE id LIKE 'local-%'").all();
console.log('local papers:', JSON.stringify(papers));
for (const p of papers) {
  const att = store.db.prepare('SELECT COUNT(*) AS c FROM attachments WHERE paper_id = ?').get(p.id).c;
  const sn = store.db.prepare('SELECT COUNT(*) AS c FROM sentence_notes WHERE paper_id = ?').get(p.id).c;
  const docs = store.db.prepare('SELECT COUNT(*) AS c FROM paper_note_documents WHERE paper_id = ?').get(p.id).c;
  const cits = store.db.prepare('SELECT COUNT(*) AS c FROM note_citations WHERE paper_id = ?').get(p.id).c;
  const ann = store.db.prepare('SELECT COUNT(*) AS c FROM annotations WHERE attachment_id IN (SELECT id FROM attachments WHERE paper_id = ?)').get(p.id).c;
  const rs = store.db.prepare('SELECT COUNT(*) AS c FROM paper_reading_state WHERE paper_id = ?').get(p.id).c;
  console.log(`${p.id}: attachments=${att} sentenceNotes=${sn} docs=${docs} citations=${cits} annotations=${ann} readingState=${rs}`);
}
const totals = store.db.prepare("SELECT (SELECT COUNT(*) FROM papers) AS papers, (SELECT COUNT(*) FROM projects) AS projects").get();
console.log('totals:', JSON.stringify(totals));
clearResearchStoreCache();
