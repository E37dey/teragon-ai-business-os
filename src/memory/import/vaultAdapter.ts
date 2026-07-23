// TERAGON AI BUSINESS OS — MarkdownVaultAdapter implementation (Wave 6, W6-B).
// Implements the W6-A seam (src/memory/adapters/MemoryRepository.ts):
// importVault → staged secure pipeline → PROPOSALS ONLY → MemoryImportJob;
// exportVault → governed export (audit + checksum) → MemoryExportJob.
import type { MemoryExportJob, MemoryImportJob } from "@/domain/memory";
import type { MarkdownVaultAdapter } from "@/memory/adapters/MemoryRepository";
import type { MemoryStores } from "@/memory/repositories/memoryStores";
import type { AgentStores } from "@/repositories/agentStores";
import type { MemoryProposalWorkflow } from "@/memory/core/proposalWorkflow";
import type { Clock } from "@/agents/runlog";
import { runExport, type Downloader } from "@/memory/export/exporter";
import { commitImport, prepareImport, type ImportFileInput } from "./pipeline";

export interface ObsidianVaultAdapterDeps {
  stores: MemoryStores;
  agentStores: AgentStores;
  workflow: MemoryProposalWorkflow;
  requestedById: string;
  requestedByName: string;
  clock?: Clock;
  downloader?: Downloader;
}

export class ObsidianVaultAdapter implements MarkdownVaultAdapter {
  private readonly deps: ObsidianVaultAdapterDeps;

  constructor(deps: ObsidianVaultAdapterDeps) {
    this.deps = deps;
  }

  async importVault(files: ReadonlyArray<{ path: string; content: string }>): Promise<MemoryImportJob> {
    const enc = new TextEncoder();
    const inputs: ImportFileInput[] = files.map((f) => ({ name: f.path, bytes: enc.encode(f.content) }));
    const records = await this.deps.workflow.listBridgedRecords();
    const preview = await prepareImport(inputs, records);
    const result = await commitImport(
      {
        preview,
        selectedPaths: preview.files.map((f) => f.path),
        requestedById: this.deps.requestedById,
        requestedByName: this.deps.requestedByName,
      },
      {
        stores: this.deps.stores,
        agentStores: this.deps.agentStores,
        workflow: this.deps.workflow,
        ...(this.deps.clock ? { clock: this.deps.clock } : {}),
      },
    );
    return result.job;
  }

  async exportVault(): Promise<MemoryExportJob> {
    const records = await this.deps.workflow.listBridgedRecords();
    const { job } = await runExport(
      {
        scope: { kind: "vault" },
        requestedById: this.deps.requestedById,
        requestedByName: this.deps.requestedByName,
        download: this.deps.downloader !== undefined,
      },
      {
        stores: this.deps.stores,
        agentStores: this.deps.agentStores,
        records,
        ...(this.deps.clock ? { clock: this.deps.clock } : {}),
        ...(this.deps.downloader ? { downloader: this.deps.downloader } : {}),
      },
    );
    return job;
  }
}
