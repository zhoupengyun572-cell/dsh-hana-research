const ROB_LABELS = {
  low: '低风险', some_concerns: '部分担忧', high: '高风险', moderate: '中等风险',
  serious: '严重风险', critical: '极严重风险', no_information: '信息不足', pending: '未评定',
};
const CERTAINTY = { 1: '极低', 2: '低', 3: '中等', 4: '高' };

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildQualityExport(project, overview, format = 'json') {
  const safeTitle = String(project?.title || '研究项目').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 70) || '研究项目';
  if (format === 'json') return {
    contentType: 'application/json; charset=utf-8', fileName: `${safeTitle}-质量评定.json`,
    body: JSON.stringify({ exportedAt: new Date().toISOString(), project, methodology: { riskOfBiasTemplate: overview.template, gradeDomains: overview.gradeDomains }, overview }, null, 2),
  };
  if (format === 'grade-csv') {
    const header = ['结局','重要性','研究设计','研究数','参与者','效应估计',...overview.gradeDomains.map(item=>item.label),'建议确定性','确认确定性','确认说明'];
    const rows = overview.gradeOutcomes.map(item => [item.title,item.importance,item.studyDesign,item.studies ?? '',item.participants ?? '',item.effectEstimate,
      ...overview.gradeDomains.map(domain => { const value=item.domains[domain.id]; return value ? `${value.level > 0 ? '+' : ''}${value.level}${value.rationale ? `：${value.rationale}` : ''}` : '0'; }),
      CERTAINTY[item.suggestedCertainty], item.confirmedCertainty ? CERTAINTY[item.confirmedCertainty] : '未确认', item.confirmationNote]);
    return { contentType:'text/csv; charset=utf-8',fileName:`${safeTitle}-GRADE证据概况.csv`,body:'\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n') };
  }
  const header = ['文献','评定结局',...overview.template.domains.map(item=>item.label),'总体判断','冲突数','完成状态'];
  const rows = overview.papers.map(item => [item.title,item.outcomeLabel,...item.domains.map(domain=>ROB_LABELS[domain.finalJudgment] || '未形成最终判断'),ROB_LABELS[item.overall] || '未完成',item.conflicts,item.complete?'已完成':'进行中']);
  return { contentType:'text/csv; charset=utf-8',fileName:`${safeTitle}-风险偏倚评定.csv`,body:'\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n') };
}
