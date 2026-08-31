import { buildAnswerKeysPdf, buildClassSetPdf, buildStudentSheetPdf } from '../src/lib/bandedWorksheetPdf';
import { buildVariants, VARIANTS, type BankedQuestion } from '../src/lib/bandedWorksheet';
import { crossVariantCoverage, itemStandards } from '../src/lib/bandedStandardsCoverage';
import { getAllTopics } from '../src/data/nysTopics';
import fs from 'fs';

const topics = getAllTopics().filter(t => t.topic?.standard).slice(0, 6).map(t => t.topic.name);
console.log('topics used:', topics.map((n,i)=>`${n}`).join(' | '));

let n = 0;
const mk = (band: any, topicNames: string[], ans: string): BankedQuestion => ({
  id: `q${++n}`, band, answer_group: `g${n}`, prompt_text: `Question ${n} on ${band}`,
  answer_text: ans, prompt_image_url: null, answer_image_url: null, difficulty: null, topicNames,
});
const pools: any = { foundation: [], core: [], extension: [], depth: [] };
for (const b of ['foundation','core','extension','depth']) {
  for (let i=0;i<12;i++) {
    // vary tagging: every 5th untagged, every 7th double-tagged
    const t = i % 5 === 0 ? [] : (i % 7 === 3 ? [topics[i%topics.length], topics[(i+1)%topics.length]] : [topics[i%topics.length]]);
    pools[b].push(mk(b, t, `${i+1}`));
  }
}
const { variants, anchors } = buildVariants(pools as any) as any;
VARIANTS.forEach(L => {
  const v = variants.find((x:any)=>x.variant===L);
  console.log(L, 'anchorPos', v.anchorPositions.join(','), 'anchorIds', v.anchorPositions.map((p:number)=>v.items[p-1].id).join(','), 'check', v.check,
    'groups-dup', new Set(v.items.map((q:any)=>q.answer_group)).size !== v.items.length);
});
const cross = crossVariantCoverage(variants, anchors ?? variants[0].anchorPositions.map((p:number)=>variants[0].items[p-1]));
console.log('cross rows', cross.rows.map(r=>`${r.code}:${VARIANTS.map(L=>r.perVariant[L]).join('/')}${r.onAnchor?'*':''}`).join(' '));
console.log('anchor standards', [...new Set(variants[0].anchorPositions.map((p:number)=>itemStandards(variants[0].items[p-1]).map(s=>s.code).join('+')))]);
console.log('distinct', cross.distinctStandards, 'everyBand', cross.atEveryBand, 'oneBand', cross.atOneBandOnly);

fs.writeFileSync('/tmp/bv/keys.pdf', Buffer.from(buildAnswerKeysPdf(variants, { title: 'Geometry Practice' }).output('arraybuffer')));
fs.writeFileSync('/tmp/bv/sheet_off.pdf', Buffer.from(buildStudentSheetPdf({studentName:'Maria Gonzalez', variant:'C', items:variants[2].items, check:variants[2].check}, { title:'Geometry Practice' }).output('arraybuffer')));
fs.writeFileSync('/tmp/bv/sheet_on.pdf', Buffer.from(buildStudentSheetPdf({studentName:'Maria Gonzalez', variant:'C', items:variants[2].items, check:variants[2].check}, { title:'Geometry Practice', showStandardsFooter:true }).output('arraybuffer')));
