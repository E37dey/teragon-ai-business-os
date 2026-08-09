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
  };
}
