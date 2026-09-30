// Decision records live in docs/decisions/ as Markdown; the site renders them as pages.
const files = import.meta.glob('../../docs/decisions/0*.md', { eager: true });

export const decisions = Object.entries(files)
  .map(([path, mod]) => {
    const slug = path.split('/').pop().replace(/\.md$/, '');
    const raw = mod.rawContent?.() ?? '';
    const title = (raw.match(/^#\s+\d+\.\s+(.+)$/m) ?? [])[1] ?? slug;
    const status = (raw.match(/^- Status:\s*(.+)$/m) ?? [])[1] ?? '';
    const date = (raw.match(/^- Date:\s*(.+)$/m) ?? [])[1] ?? '';
    const context = (raw.split(/^## Context\s*$/m)[1] ?? '').split(/^## /m)[0].trim().split('\n\n')[0];
    return { slug, no: slug.slice(0, 4), title, status, date, context, Content: mod.Content };
  })
  .sort((a, b) => a.no.localeCompare(b.no));
