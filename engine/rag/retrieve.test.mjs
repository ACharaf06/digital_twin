import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRetriever, searchable } from "./retrieve.mjs";

// A four-passage index with hand-made 4-d vectors. The French passage shares
// no words with the English question that should find it, so only the dense
// half of retrieval can reach it.
const passage = (id, source, lang, text) => ({
  id,
  source,
  label: `doc ${id}`,
  title: `Doc ${id}`,
  about: "",
  topic: id,
  lang,
  page: 1,
  pageEnd: 1,
  text,
});
const CHUNKS = [
  passage("a", "a.pdf", "fr", "Le chat dort toute la journée sur le canapé du salon."),
  passage("b", "b.pdf", "en", "Quarterly revenue in Nice grew while operating costs stayed flat."),
  passage("c", "c.pdf", "en", "Whisk the eggs, then fold in the flour slowly."),
  // an interview transcript: pleasantries that must never be cited
  passage("d", "d.pdf", "en", "Thanks, that's really helpful. Okay, merci beaucoup, bonjour."),
];
const VECTORS = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0.6, 0.8, 0],
];

let dir, mock, openaiBase;
const calls = [];

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "twin-index-"));
  writeFileSync(
    join(dir, "index.json"),
    JSON.stringify({
      version: 1,
      embedProvider: "openai",
      embedModel: "test-embed",
      embedDimensions: 4,
      dims: 4,
      chunks: CHUNKS,
    }),
  );
  writeFileSync(
    join(dir, "index-vectors.bin"),
    Buffer.from(new Float32Array(VECTORS.flat()).buffer),
  );
  mock = createServer(async (request, response) => {
    const body = [];
    for await (const chunk of request) body.push(chunk);
    const payload = JSON.parse(Buffer.concat(body).toString());
    calls.push({ url: request.url, auth: request.headers.authorization, payload });
    // Questions about the cat land on the French passage, and thanks land right
    // on the transcript -- as a real multilingual model would put "merci" near an
    // acknowledgements page. Anything else is orthogonal to every passage.
    const embedding = /cat/i.test(payload.input)
      ? [0.9, 0.1, 0, 0]
      : /merci|thank/i.test(payload.input)
        ? [0, 0.6, 0.8, 0]
        : [0, 0, 0, 1];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ index: 0, embedding }] }));
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  openaiBase = `http://127.0.0.1:${mock.address().port}/v1`;
});

after(() => {
  mock.close();
  rmSync(dir, { recursive: true, force: true });
});

const open = (options = {}) =>
  createRetriever({
    dir: pathToFileURL(`${dir}/`),
    openaiBase,
    openaiKey: "test-key",
    ...options,
  });

test("an English question reaches a French passage it shares no words with", async () => {
  const retriever = open();
  assert.equal(retriever.embedProvider, "openai");
  const [hit] = await retriever.retrieve("Where does the cat sleep?");
  assert.equal(hit?.source, "a.pdf");
  // embedded with the model and size recorded in the index, not engine config
  assert.deepEqual(calls.at(-1), {
    url: "/v1/embeddings",
    auth: "Bearer test-key",
    payload: { model: "test-embed", input: "Where does the cat sleep?", dimensions: 4 },
  });
});

test("lexical and dense hits are fused into one ranking", async () => {
  const sources = (await open().retrieve("cat eggs flour")).map((hit) => hit.source);
  assert.ok(sources.includes("a.pdf"), "dense hit missing");
  assert.ok(sources.includes("c.pdf"), "lexical hit missing");
});

test("dense hits below the similarity floor are dropped", async () => {
  // searchable, matches no keyword, and is orthogonal to every passage
  assert.deepEqual(await open().retrieve("quantum chromodynamics"), []);
});

test("without an API key the index degrades to lexical and makes no call", async () => {
  const made = calls.length;
  const retriever = open({ openaiKey: "" });
  assert.equal(retriever.embedModel, null);
  assert.match(retriever.denseInactiveReason, /OPENAI_API_KEY/);
  assert.deepEqual(await retriever.retrieve("Where does the cat sleep?"), []);
  const [hit] = await retriever.retrieve("operating revenue");
  assert.equal(hit?.source, "b.pdf");
  assert.equal(calls.length, made);
});

test("lexical mode never calls the embedding endpoint", async () => {
  const made = calls.length;
  await open().retrieve("Where does the cat sleep?", { mode: "lexical" });
  assert.equal(calls.length, made);
});

test("greetings and thanks retrieve nothing, even where the embedding matches", async () => {
  const retriever = open();
  for (const message of ["thanks!", "ok", "hello", "bonjour", "merci beaucoup"])
    assert.deepEqual(await retriever.retrieve(message), [], message);
  // "nice" stays searchable: it is also the city
  const [city] = await retriever.retrieve("Nice");
  assert.equal(city?.source, "b.pdf");
});

test("only messages with something to search reach the index", () => {
  for (const text of ["thanks!", "merci beaucoup", "ok", "who are you?", "   "])
    assert.equal(searchable(text), false, text);
  // Arabic and Chinese have no Latin tokens, but the embeddings can read them
  for (const text of ["tell me more", "What is LCP?", "Nice", "ما موضوع أطروحتك؟", "你的论文是关于什么的？"])
    assert.equal(searchable(text), true, text);
});
