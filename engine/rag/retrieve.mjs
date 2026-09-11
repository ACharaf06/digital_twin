/**
 * Retrieval over the knowledge index built by tools/knowledge/build-index.py.
 *
 * Node standard library only, so the engine keeps its zero-dependency install.
 * Lexical BM25 always works from the committed index. When the index was built
 * with an embedding model, the dense vectors are fused in by reciprocal rank
 * fusion; without them retrieval degrades to BM25 rather than failing.
 *
 * Cross-lingual note: most of the corpus is in French while most visitors ask
 * in English. Every passage therefore carries an English title and description
 * from the ingest step, indexed alongside the body, so an English question has
 * an English surface to match even on a French passage.
 */
import { readFileSync } from "node:fs";

const K1 = 1.2;
const B = 0.75;
const RRF_K = 60;
// The English descriptor is scored as its own BM25 field. Folding it into the
// body instead would make a short passage "mostly header" and hand it the
// length-normalisation bonus, which floats the shortest passages to the top.
const HEADER_WEIGHT = 0.6;
// A dense index always has a nearest neighbour, even for "hello". Below this
// cosine a hit is noise, and keeping it would print "Grounded in my thesis"
// under a greeting. Calibrated for text-embedding-3-large at 1,024 dimensions
// with `probe.mjs --calibrate`: off-topic turns peaked at 0.28 ("hello") and the
// weakest real answer scored 0.35. Re-run it after changing the model.
const DENSE_MIN_SIMILARITY = 0.31;
// Dense counts double. For English questions the keyword ranking skews to the
// corpus's English fragments (85% of its hits, against 20% of passages), so it
// gets half the say -- but not none: dense is weak on rare exact terms (LCP,
// retroclaim, a tool name), and dropping keywords cost a routing case. 1:2 is
// the most dense weight that kept routing at 8/8 in the probe. It was fitted on
// eight answer-recall questions: a starting point, not a law.
const FUSION_WEIGHTS = { lexical: 1, dense: 2 };

// Greetings, thanks and acknowledgements. In this corpus they occur only as
// pleasantries in the thesis interview transcripts ("ok" alone appears in 70
// passages), so matching them would cite the thesis under a "thanks!". "nice"
// is deliberately absent: it is also the city.
const CONVERSATIONAL = `hello hi hey hiya yo thanks thank thx cheers ok okay cool
  awesome yeah yep yup nope lol haha bye goodbye please sorry great sure much
  bonjour salut coucou bonsoir merci ciao oui beaucoup super`;

// Function words carry no retrieval signal and the corpus is bilingual, so both
// languages are stripped. Accents are folded before this set is consulted.
const STOPWORDS = new Set(
  `a able about above after again against all also am an and any are aren as at
   be because been before being below between both but by can cannot could did
   do does doing don down during each few for from further had has have having
   he her here hers him his how i if in into is it its itself just me more most
   my no nor not of off on once only or other our out over own same she should
   so some such than that the their them then there these they this those
   through to too under until up very was we were what when where which while
   who whom why will with would you your
   au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma
   mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa
   se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y
   ete etee etees etes etant suis es est sommes etes sont sera serai avoir etre
   avait avais avons avez ont aussi comme donc car plus moins tres bien peut
   entre sans sous chez dont alors encore fait faire cela cette
   ${CONVERSATIONAL}`
    .split(/\s+/)
    .filter(Boolean),
);

/** Lowercase, strip accents, drop stopwords, trim simple plurals. */
export function tokenize(text) {
  const folded = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const tokens = [];
  for (const raw of folded.split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || raw.length > 30) continue;
    if (STOPWORDS.has(raw)) continue;
    // "agents" and "agent" should collide; "process" must not become "proces".
    const token =
      raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss")
        ? raw.slice(0, -1)
        : raw;
    tokens.push(token);
  }
  return tokens;
}

/**
 * Whether a message has anything to search for. Greetings, thanks and
 * stopword-only questions ("who are you?") do not: the profile answers those,
 * and retrieving for them cites whatever says "merci" in its acknowledgements.
 * Text in a script the tokenizer cannot read (Arabic, Chinese...) always
 * counts, because the embeddings handle it even where keywords cannot.
 */
export function searchable(text) {
  if (tokenize(text).length) return true;
  return /\p{L}/u.test(text.replace(/\p{Script=Latin}/gu, ""));
}

function cosine(a, b, offset, dims) {
  // Index vectors are stored L2-normalised, so a dot product is the cosine.
  let sum = 0;
  for (let i = 0; i < dims; i++) sum += a[i] * b[offset + i];
  return sum;
}

/**
 * Blend ranked lists by weighted reciprocal rank fusion. A passage absent from
 * a list simply gets nothing from it.
 */
function fuse(lists) {
  const scores = new Map();
  for (const { ranking, weight } of lists) {
    ranking.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (RRF_K + rank + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}

export function createRetriever({
  dir = new URL("../knowledge/", import.meta.url),
  base = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  openaiBase = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  openaiKey = process.env.OPENAI_API_KEY || "",
  minSimilarity = DENSE_MIN_SIMILARITY,
} = {}) {
  let index;
  try {
    index = JSON.parse(readFileSync(new URL("index.json", dir), "utf8"));
  } catch {
    return {
      ready: false,
      size: 0,
      embedModel: null,
      embedProvider: null,
      denseInactiveReason: "no index.json -- run tools/knowledge/build-index.py",
      retrieve: async () => [],
      nearest: async () => [],
    };
  }

  const chunks = index.chunks ?? [];
  const dims = index.dims ?? 0;
  // Indexes written before the provider was recorded were always Ollama.
  const provider = index.embedModel ? (index.embedProvider ?? "ollama") : null;
  let vectors = null;
  let inactive = provider ? null : "the index has no embeddings";
  if (provider && dims) {
    try {
      const raw = readFileSync(new URL("index-vectors.bin", dir));
      const copy = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      const floats = new Float32Array(copy);
      if (floats.length === chunks.length * dims) vectors = floats;
      else inactive = "index-vectors.bin does not match index.json -- rebuild the index";
    } catch {
      inactive = "index-vectors.bin is missing -- rebuild the index";
    }
    if (vectors && provider === "openai" && !openaiKey) {
      vectors = null;
      inactive = `the index holds ${index.embedModel} vectors but OPENAI_API_KEY is not set`;
    }
  }

  // BM25F over two fields: the passage body, and the English descriptor the
  // ingest step attached. 800 short passages tokenize in a few milliseconds, so
  // the index stays plain text rather than shipping a precomputed posting list.
  const documentFrequency = new Map();
  const bodyCounts = [];
  const headerCounts = [];
  const bodyLengths = new Array(chunks.length);
  const headerLengths = new Array(chunks.length);
  let totalBody = 0;
  let totalHeader = 0;

  const tally = (tokens) => {
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return counts;
  };
  const total = (counts) => {
    let sum = 0;
    for (const value of counts.values()) sum += value;
    return sum;
  };

  chunks.forEach((chunk, position) => {
    const header = tally(tokenize(`${chunk.title} ${chunk.about} ${chunk.topic}`));
    const body = tally(tokenize(chunk.text));
    for (const token of new Set([...header.keys(), ...body.keys()]))
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    headerCounts.push(header);
    bodyCounts.push(body);
    headerLengths[position] = total(header);
    bodyLengths[position] = total(body);
    totalHeader += headerLengths[position];
    totalBody += bodyLengths[position];
  });
  const averageBody = totalBody / (chunks.length || 1) || 1;
  const averageHeader = totalHeader / (chunks.length || 1) || 1;

  const saturate = (frequency, length, average) =>
    (frequency * (K1 + 1)) /
    (frequency + K1 * (1 - B + (B * length) / average));

  function lexical(query) {
    const terms = tokenize(query);
    if (!terms.length) return [];
    const scores = new Float64Array(chunks.length);
    for (const term of terms) {
      const df = documentFrequency.get(term);
      if (!df) continue;
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
      for (let position = 0; position < chunks.length; position++) {
        const body = bodyCounts[position].get(term) ?? 0;
        const header = headerCounts[position].get(term) ?? 0;
        if (!body && !header) continue;
        let score = body ? saturate(body, bodyLengths[position], averageBody) : 0;
        if (header)
          score +=
            HEADER_WEIGHT *
            saturate(header, headerLengths[position], averageHeader);
        scores[position] += idf * score;
      }
    }
    return [...scores.keys()]
      .filter((position) => scores[position] > 0)
      .sort((a, b) => scores[b] - scores[a])
      .slice(0, 40);
  }

  // The question must be embedded by the same model, at the same size, as the
  // passages: a different model returns confident nonsense rather than an
  // error. So provider, model and dimensions are read back from the index and
  // never taken from the engine's own configuration.
  async function embedQuery(query, signal) {
    if (provider === "openai") {
      const response = await fetch(`${openaiBase}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        signal,
        body: JSON.stringify({
          model: index.embedModel,
          input: query,
          ...(index.embedDimensions ? { dimensions: index.embedDimensions } : {}),
        }),
      });
      if (!response.ok) return null;
      return (await response.json()).data?.[0]?.embedding ?? null;
    }
    const response = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ model: index.embedModel, input: query }),
    });
    if (!response.ok) return null;
    return (await response.json()).embeddings?.[0] ?? null;
  }

  // The conversation starters are fixed strings, so the same few questions get
  // embedded for every visitor. Remembering recent ones saves a paid round trip.
  const embedded = new Map();
  async function cachedEmbedding(query, signal) {
    if (embedded.has(query)) return embedded.get(query);
    const embedding = await embedQuery(query, signal);
    if (embedding) {
      if (embedded.size >= 256) embedded.delete(embedded.keys().next().value);
      embedded.set(query, embedding);
    }
    return embedding;
  }

  /** Every passage's cosine similarity to the question, best first. */
  async function similarities(query, signal) {
    if (!vectors) return [];
    const embedding = await cachedEmbedding(query, signal ?? AbortSignal.timeout(5000));
    if (!embedding || embedding.length !== dims) return [];
    const magnitude = Math.hypot(...embedding) || 1;
    const unit = Float32Array.from(embedding, (value) => value / magnitude);
    return chunks
      .map((_, position) => [position, cosine(unit, vectors, position * dims, dims)])
      .sort((a, b) => b[1] - a[1]);
  }

  async function dense(query, signal) {
    return (await similarities(query, signal))
      .filter(([, similarity]) => similarity >= minSimilarity)
      .slice(0, 40)
      .map(([position]) => position);
  }

  return {
    ready: chunks.length > 0,
    size: chunks.length,
    embedModel: vectors ? index.embedModel : null,
    embedProvider: vectors ? provider : null,
    denseInactiveReason: vectors ? null : inactive,
    built: index.built ?? null,

    /**
     * Top passages for a question, capped by characters rather than by count so
     * the prompt budget holds however long the individual passages are.
     * `mode` isolates one ranking for measurement; the engine always runs hybrid.
     */
    async retrieve(
      query,
      {
        k = 4,
        // Sized to fit k passages (mean 890 characters, longest ~1,600). At 3,200
        // a "top 4" returned 3.1 on average, and the answer was often the fourth.
        maxChars = 4400,
        // No per-document cap by default: a question about one document needs
        // all four passages from it, and a cap of 3 measurably cost those answers.
        perSource = k,
        signal,
        mode = "hybrid",
        weights = FUSION_WEIGHTS,
      } = {},
    ) {
      if (!chunks.length || !query?.trim() || !searchable(query)) return [];
      const lists = [];
      if (mode !== "dense")
        lists.push({ ranking: lexical(query), weight: weights.lexical });
      if (mode !== "lexical" && vectors) {
        try {
          const hits = await dense(query, signal);
          if (hits.length) lists.push({ ranking: hits, weight: weights.dense });
        } catch {
          // an unreachable embedding endpoint just means lexical-only this turn
        }
      }
      if (!lists.length) return [];
      const ranked =
        lists.length > 1 ? fuse(lists) : lists[0].ranking.map((id) => [id, 0]);

      const picked = [];
      const bySource = new Map();
      let budget = maxChars;
      for (const [position] of ranked) {
        if (picked.length >= k) break;
        const chunk = chunks[position];
        const used = bySource.get(chunk.source) ?? 0;
        if (used >= perSource) continue;
        if (chunk.text.length > budget) continue;
        bySource.set(chunk.source, used + 1);
        budget -= chunk.text.length;
        picked.push(chunk);
      }
      return picked;
    },

    /** Nearest passages by embedding alone, with their scores, for calibration. */
    async nearest(query, n = 5) {
      const scored = await similarities(query);
      return scored
        .slice(0, n)
        .map(([position, similarity]) => ({ ...chunks[position], similarity }));
    },
  };
}
