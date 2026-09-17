import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useResourceList } from "./use-resource-list";

type Item = { id: string; name: string };

function makeClient(initial: Item[] = []) {
  let items = [...initial];
  return {
    list: vi.fn(async () => [...items]),
    create: vi.fn(async (resource: Item) => {
      items = [...items, resource];
      return resource;
    }),
    update: vi.fn(async (resource: Item) => {
      items = items.map((item) => (item.id === resource.id ? resource : item));
      return resource;
    }),
    delete: vi.fn(async (id: string) => {
      items = items.filter((item) => item.id !== id);
      return { deleted: true };
    }),
  };
}

describe("useResourceList", () => {
  it("loads the initial list", async () => {
    const client = makeClient([{ id: "a", name: "A" }]);
    const { result } = renderHook(() => useResourceList<Item>(client));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([{ id: "a", name: "A" }]);
    expect(client.list).toHaveBeenCalledTimes(1);
  });

  it("save() creates a new item and appends it", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useResourceList<Item>(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ id: "b", name: "B" }, true);
    });

    expect(client.create).toHaveBeenCalledWith({ id: "b", name: "B" });
    expect(result.current.items).toEqual([{ id: "b", name: "B" }]);
  });

  it("save() with isNew=false updates an existing item in place", async () => {
    const client = makeClient([{ id: "a", name: "A" }]);
    const { result } = renderHook(() => useResourceList<Item>(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ id: "a", name: "A renamed" }, false);
    });

    expect(client.update).toHaveBeenCalledWith({ id: "a", name: "A renamed" });
    expect(result.current.items).toEqual([{ id: "a", name: "A renamed" }]);
  });

  it("remove() deletes an item from the list", async () => {
    const client = makeClient([{ id: "a", name: "A" }]);
    const { result } = renderHook(() => useResourceList<Item>(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("a");
    });

    expect(client.delete).toHaveBeenCalledWith("a");
    expect(result.current.items).toEqual([]);
  });

  it("surfaces a save error via saveError and clears it on demand", async () => {
    const client = makeClient();
    client.create.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useResourceList<Item>(client));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.save({ id: "x", name: "X" }, true)).rejects.toThrow("boom");
    });

    expect(result.current.saveError).toBe("boom");
    act(() => result.current.clearSaveError());
    expect(result.current.saveError).toBeNull();
  });
});
