// Deterministic mock VaultProvider for the Phase 0 spike + tests (no real vault).
// The real plugin (main.ts) supplies an app.vault-backed provider instead.
export function mockVault(noteCount = 2) {
  const notes = [];
  for (let i = 1; i <= noteCount; i++) {
    notes.push({ path: `Notes/Note-${i}.md`, basename: `Note-${i}`, mtime: 1723200000000 + i * 1000 });
  }
  return {
    getName: () => "Demo Vault (spike)",
    listNotes: () => notes,
    // Read-only bounded search over filename/path (mock has no real text corpus).
    searchNotes: (q) => {
      const query = String(q).toLowerCase();
      return notes
        .filter((n) => n.path.toLowerCase().includes(query) || n.basename.toLowerCase().includes(query))
        .map((n) => ({ path: n.path, basename: n.basename, snippet: `…${n.basename}…`, mtime: n.mtime }));
    },
    // Read-only single note; returns null for anything not in the mock set.
    readNote: (rel) => {
      const n = notes.find((x) => x.path === rel);
      if (!n) return null;
      return {
        path: n.path,
        basename: n.basename,
        frontmatter: { synthetic: true },
        mtime: n.mtime,
        content: `# ${n.basename}\n\nSynthetic mock content for ${n.path}.\n`,
      };
    },
  };
}
