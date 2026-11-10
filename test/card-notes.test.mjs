/**
 * Rolled results that live only in a card's note tags (Spell Prism, Mirror Image).
 * Run: node test/card-notes.test.mjs
 */
import assert from "node:assert/strict";
import { rolledNotes, cardItemId } from "../scripts/chat/CardNotes.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const card = `<div class="pf1 chat-card item-card" data-actor-id="04d2" data-item-id="FBQLnygarkmOqhkJ" data-action-id="h4ef">
<div class="flexcol property-group gm-sensitive effect-notes "><label>Effect Notes</label><div class="flexrow tag-list">
<span class="tag" data-tooltip="Source: Spell Prism">Spell Prism: spell slot recharged on natural 20. <a class="inline-roll inline-result" data-tooltip="1d20"><i class="fa-solid fa-dice-d20" inert></i>2</a></span>
<span class="tag" data-tooltip="Source: Greater Spell Penetration">Greater Spell Penetration Check <a class="inline-roll inline-result" data-tooltip="1d20 + 15 + 4"><i class="fa-solid fa-dice-d20" inert></i>36</a></span>
<span class="tag">Spell resistance applies</span></div></div></div>`;

t("every tag with an inline roll is read as one line, others are not", () =>
  assert.deepEqual(rolledNotes(card), ["Spell Prism: spell slot recharged on natural 20. 2", "Greater Spell Penetration Check 36"]));
t("Mirror Image's images come out as a number and a word", () =>
  assert.deepEqual(rolledNotes(`<span class="tag"><a class="inline-roll inline-result">8</a> Images</span>`), ["8 Images"]));
t("no content, no notes", () => { assert.deepEqual(rolledNotes(""), []); assert.deepEqual(rolledNotes(undefined), []); });
t("entities decode and a trailing period goes", () =>
  assert.deepEqual(rolledNotes(`<span class="tag">Fire &amp; ice &lt;3&gt; &quot;x&quot; it&#39;s <a class="inline-roll">4</a>.</span>`), [`Fire & ice <3> "x" it's 4`]));
t("the card's item id comes from system.item, else the markup", () => {
  assert.equal(cardItemId({ system: { item: "Actor.04d2.Item.FBQLnygarkmOqhkJ" } }), "FBQLnygarkmOqhkJ");
  assert.equal(cardItemId({ content: card }), "FBQLnygarkmOqhkJ");
  assert.equal(cardItemId({ content: "<p>hi</p>" }), null);
});

console.log(`${pass} assertions passed.`);
