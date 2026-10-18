import assert from 'node:assert/strict';
import { collectFormattingInputs, applyFormattingWithAnchors, normalizeFormattingOperations, assertTextPreserved } from '../src/formatting';
import { applyEnhancementsToDoc } from '../src/illustration';
import { renderDocToHtml, renderDocToMarkdown } from '../src/renderer';
import { THEME_PRESETS, MODERN_THEME_PRESETS } from '../src/theme-presets';
import { DEFAULT_COLORS, DEFAULT_TYPO } from '../src/theme';
import type { Doc, Block } from '../src/types';
const para = (text: string): Block => ({ type: 'paragraph', children: [{ type: 'text', content: text }] });
const doc: Doc = { title: '让信息回到中心', blocks: [
  { type: 'heading', level: 2, children: [{ type: 'text', content: '清晰，是一种秩序' }] },
  para('阅读是输入，思考才是真正的消化。读完一章后停下来，用自己的语言复述核心观点，并记录仍然没有理解的问题。'),
  para('先确定目标。'), para('再快速浏览。'), para('最后精读重点。'),
  { type: 'paragraph', children: [{ type: 'link', content: '参考资料', href: 'https://example.com' }] },
  { type: 'code', code: 'const a = 1;', language: 'typescript' },
  ...Array.from({ length: 9 }, () => para('为信息留出空间。'))
] };
const original = structuredClone(doc);
const inputs = collectFormattingInputs(doc);
const candidate = inputs[1].emphasisCandidates!.find(c => c.text === '思考才是真正的消化。')!;
assert.ok(candidate);
const operations = normalizeFormattingOperations([
  { op: 'emphasize-inline', blockId: 'blk_1', candidateId: candidate.id },
  { op: 'group-steps', blockIds: ['blk_2', 'blk_3', 'blk_4'] },
  ...Array.from({ length: 9 }, (_, i) => ({ op: 'convert', blockId: `blk_${i + 7}`, to: 'emphasis' })),
  { op: 'convert', blockId: 'blk_0', to: 'callout' },
  { op: 'insert-divider', afterBlockId: 'blk_15' }
], inputs);
const result = applyFormattingWithAnchors(doc, operations);
assert.deepEqual(doc, original);
assert.ok(assertTextPreserved(doc, result.doc));
assert.match(renderDocToMarkdown(result.doc), /\*\*思考才是真正的消化。\*\*/);
assert.equal(result.anchorOf.size, doc.blocks.length);
assert.equal(result.anchorOf.get(2), result.anchorOf.get(4));
assert.deepEqual(result.doc.blocks[0], doc.blocks[0]);
assert.deepEqual(normalizeFormattingOperations(operations, inputs), operations);
const cards = operations.filter(o => o.op === 'convert').map(o => Number(o.blockId.slice(4)));
assert.ok(cards.every((n, i) => !i || n - cards[i - 1] >= 4));
const malformed: unknown[] = [null, 3, {}, { op: 'convert', blockId: 4 }, { op: 'convert', blockId: 'blk_1', to: 'heading', level: 8 }, { op: 'group-steps', blockIds: ['blk_0', 'blk_1'] }, { op: 'group-steps', blockIds: ['blk_2', 'blk_4'] }, { op: 'emphasize-inline', blockId: 'blk_1', candidateId: 'invented' }];
assert.deepEqual(normalizeFormattingOperations(malformed, inputs), []);
assert.deepEqual(applyFormattingWithAnchors(doc, malformed as any).doc, doc);
const enhanced = applyEnhancementsToDoc(doc, operations, [{ afterBlockId: 'blk_3', dataUri: 'data:image/png;base64,AA==', alt: '配图' }]);
const imageIndex = enhanced.blocks.findIndex(b => b.type === 'image');
assert.equal(enhanced.blocks[imageIndex - 1].type, 'steps');
const split: Doc = { blocks: [{ type: 'paragraph', children: [{ type: 'text', content: '阅读是输入，思考才是' }, { type: 'text', content: '真正的消化。读完一章后停下来，用自己的语言复述核心观点，并记录仍然没有理解的问题。' }] }] };
const splitCandidate = collectFormattingInputs(split)[0].emphasisCandidates!.find(c => c.text === candidate.text)!;
const splitResult = applyFormattingWithAnchors(split, [{ op: 'emphasize-inline', blockId: 'blk_0', candidateId: splitCandidate.id }]).doc;
assert.ok(assertTextPreserved(split, splitResult));
const english = collectFormattingInputs({ blocks: [para('Read with intent. Thinking makes it stick. After every chapter, restate the central idea in your own words and write down the questions that remain unanswered.')] });
assert.ok(english[0].emphasisCandidates!.some(c => c.text === 'Thinking makes it stick.'));
for (const preset of THEME_PRESETS) {
  const html = renderDocToHtml(result.doc, { themeId: preset.id, colors: { ...DEFAULT_COLORS, ...preset.colors }, typography: { ...DEFAULT_TYPO, ...preset.typography } });
  assert.match(html, /<strong/);
  assert.doesNotMatch(html, /undefined|NaN/);
  if (MODERN_THEME_PRESETS.includes(preset)) assert.doesNotMatch(html, /<svg|display:flex|box-shadow/);
}
console.log(`Passed: ${THEME_PRESETS.length} themes, emphasis, malformed plans, card density, text preservation and illustration anchors.`);
