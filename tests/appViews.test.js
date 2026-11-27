import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("app.js 的页面映射函数都必须有定义，避免开局后主界面空白", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  const map = src.match(/const map = \{([\s\S]*?)\};/)
    || src.match(/const VIEW_MAP = \(\) => \(\{([\s\S]*?)\}\);/);
  assert.ok(map, "找不到 render() 里的页面映射");
  const names = [...map[1].matchAll(/:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.ok(names.includes("viewGrades"), "映射里应有 viewGrades");
  assert.ok(names.length >= 10, `映射条目过少：${names.join(",")}`);
  for (const name of names) {
    assert.match(src, new RegExp(`function ${name}\\s*\\(`), `缺少 ${name}，开局渲染会中断并留下空白教室`);
  }
});
