// S13.4 (PR D) — MemoryEntriesWorkspace UI: create persists and appears, archive
// hides, search filters, invalid input shows an error with no false success,
// accessible names, and NO network/Obsidian call during CRUD.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/app/queryClient";
import { AuthProvider } from "@/auth/AuthProvider";
import { MemoryEntriesWorkspace } from "@/modules/memory/MemoryEntriesWorkspace";
import { __resetRepositoriesForTests } from "@/repositories";
import { __resetIdbConnectionForTests } from "@/repositories/IndexedDBRepository";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetIdbConnectionForTests();
  __resetRepositoriesForTests();
  queryClient.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  return render(
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryEntriesWorkspace />
      </QueryClientProvider>
    </AuthProvider>,
  );
}

async function createEntry(title: string, content: string): Promise<void> {
  fireEvent.click(screen.getByTestId("memory-new"));
  fireEvent.change(screen.getByLabelText("כותרת הזיכרון"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("תוכן הזיכרון"), { target: { value: content } });
  fireEvent.click(screen.getByTestId("memory-save"));
  await waitFor(() =>
    expect(screen.getAllByTestId("memory-entry-row").some((r) => within(r).queryByText(title))).toBe(true),
  );
}

describe("MemoryEntriesWorkspace — real persistent CRUD UI", () => {
  it("shows the honest local-only notice and accessible controls", () => {
    mount();
    expect(screen.getByText(/ללא Obsidian או שירות ענן/)).toBeTruthy();
    expect(screen.getByLabelText("חיפוש בזיכרון המקומי")).toBeTruthy();
    expect(screen.getByLabelText("סינון לפי קטגוריה")).toBeTruthy();
    expect(screen.getByTestId("memory-new")).toBeTruthy();
  });

  it("create persists and appears in the list (no network/Obsidian call)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in test"));
    mount();
    // starts empty (no seed in unit) → honest empty state
    await screen.findByText(/אין זיכרונות להצגה/);
    await createEntry("החלטת מוצר", "לשמור אישור אנושי לכל כתיבה");
    expect(fetchSpy).not.toHaveBeenCalled(); // purely local, no network
  });

  it("archive removes from the default view; search filters the list", async () => {
    mount();
    await createEntry("אלפא", "תוכן אלפא");
    await createEntry("בטא", "תוכן בטא");
    // search narrows to one
    fireEvent.change(screen.getByLabelText("חיפוש בזיכרון המקומי"), { target: { value: "אלפא" } });
    await waitFor(() => expect(screen.getAllByTestId("memory-entry-row").length).toBe(1));
    fireEvent.change(screen.getByLabelText("חיפוש בזיכרון המקומי"), { target: { value: "" } });
    await waitFor(() => expect(screen.getAllByTestId("memory-entry-row").length).toBe(2));
    // archive the first row → default view drops it
    const rowAlpha = screen.getAllByTestId("memory-entry-row").find((r) => within(r).queryByText("אלפא"))!;
    fireEvent.click(within(rowAlpha).getByTestId("memory-archive"));
    await waitFor(() => expect(screen.getAllByTestId("memory-entry-row").length).toBe(1));
    // reveal archived → both visible again (one restorable)
    fireEvent.click(screen.getByLabelText("הצגת פריטים בארכיון"));
    await waitFor(() => expect(screen.getAllByTestId("memory-entry-row").length).toBe(2));
    expect(screen.getAllByTestId("memory-restore").length).toBe(1);
  });

  it("invalid input shows an error and creates no record (no false success)", async () => {
    mount();
    fireEvent.click(screen.getByTestId("memory-new"));
    // empty title → save
    fireEvent.change(screen.getByLabelText("תוכן הזיכרון"), { target: { value: "יש תוכן אך אין כותרת" } });
    fireEvent.click(screen.getByTestId("memory-save"));
    await screen.findByRole("alert");
    expect(screen.queryAllByTestId("memory-entry-row").length).toBe(0); // nothing created
    expect(screen.getByTestId("memory-editor")).toBeTruthy(); // editor stays open (no false success)
  });
});
