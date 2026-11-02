// Pure candidate selection. The route uses Kuromoji to get these tokens, then
// checks each candidate against JMdict before showing it as a matched form.
export type JapaneseToken = {
  surface_form: string;
  basic_form: string;
  pos: string;
  pos_detail_1: string;
};

export type WordFormCandidate = {
  word: string;
  kind: "verb" | "noun";
};

function isVerbEnding(token: JapaneseToken): boolean {
  return (
    token.pos === "助動詞" ||
    (token.pos === "助詞" && ["て", "で"].includes(token.surface_form)) ||
    (token.pos === "動詞" &&
      token.pos_detail_1 === "非自立" &&
      ["いる", "おる", "しまう"].includes(token.basic_form))
  );
}

export function wordFormCandidates(
  query: string,
  tokens: JapaneseToken[]
): WordFormCandidate[] {
  if (
    !query ||
    query.length > 40 ||
    /\s/.test(query) ||
    tokens.length === 0 ||
    tokens.map((token) => token.surface_form).join("") !== query
  ) {
    return [];
  }

  const [head, ...tail] = tokens;
  if (
    head.pos === "動詞" &&
    head.pos_detail_1 !== "非自立" &&
    head.basic_form !== "*" &&
    head.basic_form !== query &&
    tail.every(isVerbEnding)
  ) {
    return [{ word: head.basic_form, kind: "verb" }];
  }

  if (head.pos !== "名詞" || !head.surface_form || tail.length === 0) {
    return [];
  }

  // サ変 nouns such as 勉強 take する. Jisho may list the noun, the combined
  // verb, or both, so search both exact headwords.
  if (
    head.pos_detail_1 === "サ変接続" &&
    tail[0].pos === "動詞" &&
    tail[0].basic_form === "する" &&
    tail.slice(1).every(isVerbEnding)
  ) {
    return [
      { word: head.surface_form, kind: "noun" },
      { word: `${head.surface_form}する`, kind: "verb" },
    ];
  }

  // Nouns have no verb-like conjugation, but can appear with a copula or
  // plural suffix. Only these whole-word patterns are treated as noun forms.
  if (
    tail.every((token) => token.pos === "助動詞") ||
    (tail.length === 1 &&
      tail[0].pos === "名詞" &&
      tail[0].pos_detail_1 === "接尾" &&
      ["たち", "達", "ら", "等"].includes(tail[0].surface_form))
  ) {
    return [{ word: head.surface_form, kind: "noun" }];
  }
  return [];
}
