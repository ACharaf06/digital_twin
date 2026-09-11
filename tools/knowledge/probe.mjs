/**
 * Retrieval probe: routing, answer recall, and language bias.
 *
 *   node --env-file-if-exists=engine/.env tools/knowledge/probe.mjs
 *   node --env-file-if-exists=engine/.env tools/knowledge/probe.mjs --calibrate
 *   node --env-file-if-exists=engine/.env tools/knowledge/probe.mjs "any question"
 *
 * The env file supplies OPENAI_API_KEY when the index holds OpenAI vectors.
 * Without it the probe measures lexical retrieval only.
 */
import { readFileSync } from "node:fs";
import { createRetriever } from "../../engine/rag/retrieve.mjs";

// Routing: the document each question should reach first. Asserted on the top
// hit, not "somewhere in the top 4": the thesis alone is three quarters of the
// index, so the weaker test passes by accident.
const ROUTING = [
  ["What is your thesis about?", "These_VF"],
  ["Tell me about world models and ontologies", "These_VF"],
  ["What did you do at SaaSOffice?", "SaaSOffice_work"],
  ["What did you build during your apprenticeship at Amadeus?", "Rapport_REX"],
  ["How does Member Insight predict why a member is calling?", "member-insight"],
  ["How does the configuration chatbot use function calling?", "ALMS-V2"],
  ["Qu'est-ce que tu as fait chez SaaSOffice ?", "SaaSOffice_work"],
  ["decision intelligence", "These_VF"],
];

// Answer recall: English questions whose answer is written only in French. The
// pattern matches the sentence that actually answers, and each was checked to
// have no English counterpart anywhere in the corpus -- so a pass means the
// French prose was reached, not an English fragment near it.
const NEEDLES = [
  ["How did the SaaSOffice chatbot classify the people it talked to?", /Fournisseur|Candidat/],
  ["How did the SaaSOffice chatbot work when you arrived?", /appel consécutifs d'agents|sous-tâches/],
  ["How many employees did SaaSOffice have when you joined?", /quatre personnes|cinquantaine de salariés/],
  ["Why did your first configuration chatbot give wrong answers?", /pages Confluence avaient été écrites|doc drift/],
  ["What did demoing prototypes to clients teach you?", /annoncer une limite/],
  ["What changes for a GenAI developer when a prototype becomes a product?", /la difficulté se déplace|faisabilité technique/],
  ["How do you think about technical debt?", /dette technique/],
  ["Do people have to choose between transparency and performance in AI decisions?", /positivement\s+corrélées|transparence contre performance/],
];

// Language bias: open questions. The English share of what they retrieve should
// sit near the corpus share, not far above it.
const OPEN = [
  "What is your thesis about?",
  "What did you learn during your apprenticeship?",
  "What surprised you most while building AI at Amadeus?",
  "How do you evaluate AI systems?",
  "Tell me about world models",
  "What is decision intelligence?",
];

// Conversational and off-topic turns: nothing should be retrieved for these,
// which is what sets the dense similarity floor from below.
const OFF_TOPIC = [
  "hello",
  "thanks!",
  "what's the weather like today?",
  "tell me a joke",
  "who won the football last night?",
  "zzzz",
];

// Hybrid answer recall when text-embedding-3-large and the 1:2 fusion were
// chosen (dense alone scored 6/8, keywords alone 1/8). Falling below it fails
// the probe: something in retrieval regressed.
const RECALL_FLOOR = 5;

const retriever = createRetriever();
const modes = retriever.embedModel ? ["lexical", "dense", "hybrid"] : ["lexical"];
const main = modes.at(-1);
const corpus = JSON.parse(
  readFileSync(new URL("../../engine/knowledge/index.json", import.meta.url), "utf8"),
).chunks;

const pct = (part, whole) => `${((100 * part) / (whole || 1)).toFixed(0)}%`;
const line = (hit) =>
  `[${hit.lang}] ${hit.source.slice(0, 34).padEnd(34)} ${(hit.page ? `p${hit.page}` : "md").padEnd(5)} ${hit.text.slice(0, 80).replace(/\s+/g, " ")}…`;

console.log(
  `index: ${retriever.size} passages · dense: ${
    retriever.embedModel
      ? `${retriever.embedProvider}:${retriever.embedModel}`
      : `off (${retriever.denseInactiveReason})`
  }`,
);

async function report() {
  console.log(`\nROUTING — expected document ranked first (${main})`);
  let routed = 0;
  for (const [question, expected] of ROUTING) {
    const [hit] = await retriever.retrieve(question, { mode: main });
    const ok = (hit?.source ?? "").startsWith(expected);
    if (ok) routed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${question}${ok ? "" : `  → ${hit?.source ?? "nothing"}`}`);
  }

  console.log("\nANSWER RECALL @4 — English question, answer written only in French");
  console.log(`  ${modes.map((mode) => mode.padEnd(9)).join("")}question`);
  const recall = Object.fromEntries(modes.map((mode) => [mode, 0]));
  for (const [question, pattern] of NEEDLES) {
    const marks = [];
    for (const mode of modes) {
      const hits = await retriever.retrieve(question, { mode });
      const ok = hits.some((hit) => pattern.test(hit.text));
      if (ok) recall[mode]++;
      marks.push((ok ? "✓" : "·").padEnd(9));
    }
    console.log(`  ${marks.join("")}${question}`);
  }
  console.log(
    `  ${modes.map((mode) => `${recall[mode]}/${NEEDLES.length}`.padEnd(9)).join("")}total`,
  );

  console.log("\nLANGUAGE — English share of passages retrieved for open questions");
  const english = corpus.filter((chunk) => chunk.lang === "en").length;
  console.log(`  ${"corpus".padEnd(9)}${pct(english, corpus.length)}`);
  for (const mode of modes) {
    let en = 0;
    let all = 0;
    for (const question of OPEN)
      for (const hit of await retriever.retrieve(question, { mode })) {
        all++;
        if (hit.lang === "en") en++;
      }
    console.log(`  ${mode.padEnd(9)}${pct(en, all)}  (${en}/${all})`);
  }

  const floor = retriever.embedModel ? RECALL_FLOOR : 0;
  if (routed < ROUTING.length || recall[main] < floor) process.exitCode = 1;
  console.log(
    `\n${routed}/${ROUTING.length} routed · ${main} recall ${recall[main]}/${NEEDLES.length} (floor ${floor})`,
  );
}

async function calibrate() {
  if (!retriever.embedModel) {
    console.log("dense retrieval is off: nothing to calibrate");
    return;
  }
  const top = async (question) => (await retriever.nearest(question, 1))[0]?.similarity ?? 0;

  console.log("\nOFF-TOPIC — best similarity (these should retrieve nothing)");
  let noise = 0;
  for (const question of OFF_TOPIC) {
    const similarity = await top(question);
    noise = Math.max(noise, similarity);
    console.log(`  ${similarity.toFixed(3)}  ${question}`);
  }

  console.log("\nANSWERS — similarity of the passage that actually answers");
  let signal = Infinity;
  for (const [question, pattern] of NEEDLES) {
    const ranked = await retriever.nearest(question, retriever.size);
    const rank = ranked.findIndex((hit) => pattern.test(hit.text));
    const similarity = rank >= 0 ? ranked[rank].similarity : 0;
    signal = Math.min(signal, similarity);
    console.log(`  ${similarity.toFixed(3)}  rank ${String(rank + 1).padStart(3)}  ${question}`);
  }

  console.log("\nOPEN — best similarity");
  for (const question of OPEN) console.log(`  ${(await top(question)).toFixed(3)}  ${question}`);

  console.log(`\nnoise ceiling ${noise.toFixed(3)} · weakest answer ${signal.toFixed(3)}`);
  console.log(
    noise < signal
      ? `clean gap: a floor of ~${((noise + signal) / 2).toFixed(2)} drops every off-topic turn and keeps every answer`
      : "no clean gap: some off-topic turn scores as high as a real answer",
  );
}

async function adhoc(question) {
  for (const mode of modes) {
    console.log(`\n${mode}`);
    for (const hit of await retriever.retrieve(question, { mode })) console.log(`  ${line(hit)}`);
  }
  if (retriever.embedModel) {
    console.log("\nnearest by embedding");
    for (const hit of await retriever.nearest(question, 5))
      console.log(`  ${hit.similarity.toFixed(3)} ${line(hit)}`);
  }
}

const args = process.argv.slice(2);
if (args[0] === "--calibrate") await calibrate();
else if (args.length) await adhoc(args.join(" "));
else await report();
