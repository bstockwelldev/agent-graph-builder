import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { NameIdFields, idFromName, idIssue } from "./resource-fields";

afterEach(cleanup);

function Harness({ editing = false }: { editing?: boolean }) {
  const [form, setForm] = useState({ name: editing ? "Support" : "", id: editing ? "support_x1" : "agent_1234abcd" });
  return (
    <>
      <NameIdFields idPrefix="t" name={form.name} id={form.id} editing={editing} fallback="agent" onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} />
      <output data-testid="id">{form.id}</output>
    </>
  );
}

// resource-forms-consistency-plan.md, slice 2 (C1).
describe("resource fields", () => {
  it("derives ids from names", () => {
    expect(idFromName("Support Flow: v2!", "ab12", "agent")).toBe("support_flow_v2_ab12");
    expect(idFromName("Café crème", "ab12", "agent")).toBe("cafe_creme_ab12");
    expect(idFromName("!!!", "ab12", "agent")).toBe("agent_ab12");
    expect(idIssue("ok_id-1.2")).toBeNull();
    expect(idIssue(" ")).toBe("Add an id.");
    expect(idIssue("has space")).toMatch(/^Ids use/);
  });

  it("puts Name first and focused, with the id following it until customized", () => {
    render(<Harness />);
    const name = screen.getByLabelText("Name");
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute("aria-required")).toBe("true");
    fireEvent.change(name, { target: { value: "Support desk" } });
    expect(screen.getByTestId("id").textContent).toMatch(/^support_desk_[0-9a-f]{4}$/);

    fireEvent.click(screen.getByRole("button", { name: "Customize id" }));
    fireEvent.change(screen.getByLabelText("Id"), { target: { value: "desk" } });
    fireEvent.change(name, { target: { value: "Support desk 2" } });
    expect(screen.getByTestId("id").textContent).toBe("desk");
  });

  it("shows an existing id read-only, with a copy button", () => {
    render(<Harness editing />);
    expect(screen.queryByLabelText("Id")).toBeNull();
    expect(screen.getByText("support_x1", { selector: "code" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy id support_x1" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
    expect(screen.getByTestId("id").textContent).toBe("support_x1");
  });
});
