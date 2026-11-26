import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("学生档案和分班调整页从 studentHistory 导入了 tierLabel 与 TIER_ORDER", () => {
  const src = readFileSync(new URL("../js/ui/app.js", import.meta.url), "utf8");
  const m = src.match(/import \{([^}]+)\} from "\.\.\/domain\/studentHistory\.js(?:\?[^"]*)?"/);
  assert.ok(m, "app.js 应导入 studentHistory");
  assert.match(m[1], /\btierLabel\b/);
  assert.match(m[1], /\bTIER_ORDER\b/);
  assert.match(src, /tierLabel\(/);
  assert.match(src, /TIER_ORDER\.filter/);
});
