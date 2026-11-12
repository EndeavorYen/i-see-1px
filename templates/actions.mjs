/* Actions shared by alignment-guard.mjs and snapshot.mjs: how to reach the state you want to measure.
   An app or a game rarely shows its interesting screens on load: open a menu, long-press a grown-ups' button,
   or set the state directly through a debug hook.
     {"click": SEL}             click (Playwright selector)
     {"press": KEY}             keyboard key
     {"waitFor": SEL}           wait until it is visible
     {"wait": MS}               plain pause (animations, timers)
     {"hold": SEL, "ms": 2000}  press and hold (long-press buttons)
     {"eval": "JS"}             run in the page; an expression, or statements (use return); may be async
   Every action also takes "waitMs" (pause after it, default 150) and "timeout". */
export async function runAction(page, act) {
  if (act.click) await page.click(act.click, { timeout: act.timeout ?? 3000 });
  if (act.press) await page.keyboard.press(act.press);
  if (act.waitFor) await page.waitForSelector(act.waitFor, { timeout: act.timeout ?? 10000 });
  if (act.hold) {
    const b = await page.locator(act.hold).first().boundingBox();
    if (!b) throw new Error(`hold: ${act.hold} is not visible`);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(act.ms ?? 1000);
    await page.mouse.up();
  }
  if (act.eval) {
    const code = /\breturn\b|;/.test(act.eval) ? act.eval : `return (${act.eval})`;
    await page.evaluate(`(async () => { ${code} })()`);
  }
  if (act.wait) await page.waitForTimeout(act.wait);
  await page.waitForTimeout(act.waitMs ?? 150);
}
