// Repository contract tests — identical CRUD+subscribe semantics for InMemory
// and IndexedDB (fake-indexeddb), plus factory singletons and the seed boot path.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { BaseEntity } from "@/domain/types";
import {
  __resetRepositoriesForTests,
  COLLECTIONS,
  DuplicateIdError,
  getRepository,
  IndexedDBRepository,
  InMemoryRepository,
  nextId,
  NotFoundError,
  SEED,
  seedIfEmpty,
  type ChangeEvent,
  type Repository,
} from "@/repositories";
import { __resetIdbConnectionForTests } from "@/repositories/IndexedDBRepository";

interface Thing extends BaseEntity {
  name: string;
}

const item = (id: string, name: string): Thing => ({
  id,
  name,
  createdAt: "2026-07-22T08:00:00.000Z",
  updatedAt: "2026-07-22T08:00:00.000Z",
});

function contractTests(makeRepo: () => Repository<Thing>) {
  it("create + list + get", async () => {
    const repo = makeRepo();
    await repo.create(item("x-1", "ראשון"));
    await repo.create(item("x-2", "שני"));
    expect((await repo.list()).map((t) => t.id).sort()).toEqual(["x-1", "x-2"]);
    expect((await repo.get("x-1"))?.name).toBe("ראשון");
    expect(await repo.get("missing")).toBeUndefined();
  });

  it("rejects duplicate ids", async () => {
    const repo = makeRepo();
    await repo.create(item("x-1", "א"));
    await expect(repo.create(item("x-1", "ב"))).rejects.toBeInstanceOf(DuplicateIdError);
  });

  it("update patches and preserves id; remove deletes; missing ids throw", async () => {
    const repo = makeRepo();
    await repo.create(item("x-1", "לפני"));
    const updated = await repo.update("x-1", { name: "אחרי" });
    expect(updated).toMatchObject({ id: "x-1", name: "אחרי" });
    await expect(repo.update("nope", { name: "?" })).rejects.toBeInstanceOf(NotFoundError);
    await repo.remove("x-1");
    expect(await repo.get("x-1")).toBeUndefined();
    await expect(repo.remove("x-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("clear empties the collection", async () => {
    const repo = makeRepo();
    await repo.create(item("x-1", "א"));
    await repo.clear();
    expect(await repo.list()).toEqual([]);
  });

  it("subscribe receives create/update/remove events; unsubscribe stops them", async () => {
    const repo = makeRepo();
    const events: ChangeEvent<Thing>[] = [];
    const unsub = repo.subscribe((e) => events.push(e));
    await repo.create(item("x-1", "א"));
    await repo.update("x-1", { name: "ב" });
    await repo.remove("x-1");
    expect(events.map((e) => e.type)).toEqual(["create", "update", "remove"]);
    expect(events[0]?.item?.name).toBe("א");
    unsub();
    await repo.create(item("x-2", "ג"));
    expect(events).toHaveLength(3);
  });
}

describe("InMemoryRepository", () => {
  contractTests(() => new InMemoryRepository<Thing>("things-mem"));

  it("callers cannot mutate the store by reference", async () => {
    const repo = new InMemoryRepository<Thing>("things-iso");
    await repo.create(item("x-1", "מקורי"));
    const got = await repo.get("x-1");
    if (got) got.name = "מוטציה";
    expect((await repo.get("x-1"))?.name).toBe("מקורי");
  });
});

describe("IndexedDBRepository (fake-indexeddb)", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    __resetIdbConnectionForTests();
    __resetRepositoriesForTests();
  });

  contractTests(() => new IndexedDBRepository<Thing>("tasks")); // real store name from COLLECTIONS
});

describe("deterministic id generation", () => {
  it("nextId continues the highest numeric suffix", () => {
    expect(nextId("l", ["l-1", "l-15", "l-3"])).toBe("l-16");
    expect(nextId("cu", [])).toBe("cu-1");
    expect(nextId("q", ["other-9"])).toBe("q-1");
  });
});

describe("factory + seedIfEmpty boot path", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    __resetIdbConnectionForTests();
    __resetRepositoriesForTests();
  });

  it("returns lazy singletons per collection", () => {
    expect(getRepository("leads")).toBe(getRepository("leads"));
    expect(getRepository("leads")).not.toBe(getRepository("customers"));
  });

  it("seeds every empty collection once; second run is a no-op", async () => {
    const seeded = await seedIfEmpty();
    // only collections with a non-empty seed are seeded ("notifications" is derived at boot)
    const seedable = COLLECTIONS.filter((c) => SEED[c].length > 0);
    expect(seeded.length).toBe(seedable.length);
    const leads = await getRepository("leads").list();
    expect(leads.length).toBe(SEED.leads.length);
    const again = await seedIfEmpty();
    expect(again).toEqual([]);
  });

  it("never overwrites user data", async () => {
    await seedIfEmpty();
    const repo = getRepository("leads");
    const first = (await repo.list())[0];
    expect(first).toBeDefined();
    if (!first) return;
    await repo.update(first.id, { updatedAt: "2026-08-01T00:00:00.000Z" });
    await seedIfEmpty();
    expect((await repo.get(first.id))?.updatedAt).toBe("2026-08-01T00:00:00.000Z");
  });
});
