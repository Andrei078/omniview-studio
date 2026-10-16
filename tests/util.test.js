import { describe, expect, it } from "vitest";
import { fmtB, parseCSV, markdown, onColor, h } from "../js/util.js";

describe("util", () => {
  it("formats sizes", () => { expect(fmtB(512)).toBe("512 B"); expect(fmtB(1536)).toBe("2 KB"); expect(fmtB(5 * 1048576)).toBe("5.0 MB"); expect(fmtB(3 * 1073741824)).toBe("3.00 GB"); });
  it("parses CSV with quotes, CRLF, tabs and semicolons", () => {
    expect(parseCSV('a,"b,c"\n"x""y",2\n')).toEqual([["a", "b,c"], ['x"y', "2"]]);
    expect(parseCSV("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCSV("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCSV("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCSV("")).toEqual([]);
  });
  it("renders Markdown and escapes raw HTML", () => {
    const out = markdown("# T\n\n**b** *i* `c`\n\n- a\n- b\n\n1. x\n\n> q\n\n```\n<b>\n```\n[l](https://e.com)");
    expect(out).toContain("<h1>T</h1>"); expect(out).toContain("<b>b</b>"); expect(out).toContain("<i>i</i>"); expect(out).toContain("<ul>"); expect(out).toContain("<ol>"); expect(out).toContain("<blockquote>q</blockquote>"); expect(out).toContain("&lt;b&gt;"); expect(out).toContain('href="https://e.com"');
    expect(markdown("<script>alert(1)</script>")).not.toContain("<script>");
    expect(markdown("[x](javascript:alert(1))")).not.toContain("href");
  });
  it("picks readable text color for accents", () => { expect(onColor("#ffffff")).toBe("#0c1022"); expect(onColor("#101010")).toBe("#ffffff"); });
  it("h() builds elements, skipping false attributes but keeping aria-*", () => {
    const e = h("button", { class: "x", disabled: false, "aria-pressed": false, "data-id": 3 }, "hi", null, ["a", "b"]);
    expect(e.className).toBe("x"); expect(e.hasAttribute("disabled")).toBe(false); expect(e.getAttribute("aria-pressed")).toBe("false"); expect(e.dataset.id).toBe("3"); expect(e.textContent).toBe("hiab");
  });
});
