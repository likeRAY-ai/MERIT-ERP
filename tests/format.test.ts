import { test } from "node:test";
import assert from "node:assert/strict";
import { chineseAmount } from "../src/lib/format";

test("金額大寫", () => {
  assert.equal(chineseAmount(0), "零元整");
  assert.equal(chineseAmount(5), "伍元整");
  assert.equal(chineseAmount(10), "壹拾元整");
  assert.equal(chineseAmount(105), "壹佰零伍元整");
  assert.equal(chineseAmount(1005), "壹仟零伍元整");
  assert.equal(chineseAmount(12345), "壹萬貳仟參佰肆拾伍元整");
  assert.equal(chineseAmount(10000), "壹萬元整");
  assert.equal(chineseAmount(100500), "壹拾萬零伍佰元整");
  assert.equal(chineseAmount(1020000), "壹佰零貳萬元整");
  assert.equal(chineseAmount(100000001), "壹億零壹元整");
  assert.equal(chineseAmount(-300), "負參佰元整");
});
