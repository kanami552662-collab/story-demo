// api/story.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      // 共通（必須）
      nickname,
      gradeOrAge,
      likes,               // 例: ["ゲーム", "謎解き"]
      thinkingStyle,       // "ひらめく" | "じっくり"
      socialStyle,         // "ひとり" | "みんな"

      // 任意（裏側）
      techLevel,           // "初めて" | "ちょっと知ってる"
      stimulusTolerance,   // "強め" | "優しめ"

      // 第2話用（ある時だけ第2話）
      previousSummary,     // hidden.nextSummary をそのまま渡す
      choiceId,            // "A" | "B" | "C"
      choiceText,          // 表示された選択文（なくてもOK）
    } = req.body || {};

    // 最低限のバリデーション
    const isSecondEpisode = Boolean(previousSummary && choiceId);

    if (!nickname || !gradeOrAge || !Array.isArray(likes) || likes.length === 0 || !thinkingStyle || !socialStyle) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (isSecondEpisode && !["A", "B", "C"].includes(choiceId)) {
      return res.status(400).json({ error: "Invalid choiceId (A/B/C)" });
    }

    // JSON固定スキーマ（第1話も第2話も同じ形で返す）
    const schema = {
      name: "story_response",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          episode: { type: "integer" }, // 1 or 2
          title: { type: "string" },
          story: { type: "string" },
          choices: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },   // "A"/"B"/"C"
                text: { type: "string" },
                hint: { type: "string" }
              },
              required: ["id", "text", "hint"]
            }
          },
          roleReveal: {
            type: "object",
            additionalProperties: false,
            properties: {
              realRole: { type: "string" },
              kidsRole: { type: "string" },
              oneLine: { type: "string" }
            },
            required: ["realRole", "kidsRole", "oneLine"]
          },
          hidden: {
            type: "object",
            additionalProperties: false,
            properties: {
              nextSummary: { type: "string" },
              stats: {
                type: "object",
                additionalProperties: false,
                properties: {
                  courage: { type: "integer" },
                  trust: { type: "integer" },
                  curiosity: { type: "integer" }
                },
                required: ["courage", "trust", "curiosity"]
              },
              difficulty: { type: "string" } // "easy" | "normal"
            },
            required: ["nextSummary", "stats", "difficulty"]
          }
        },
        required: ["episode", "title", "story", "choices", "roleReveal", "hidden"]
      }
    };

    const roleTable = `
本当の職業 -> 小学生向け表現:
- ソフトウェアエンジニア -> しくみを作る人
- データサイエンティスト -> 未来を予想する人
- AIエンジニア -> 考えるマシンの先生
- プロダクトマネージャー -> チームのリーダー
- UXデザイナー -> 使いやすさ名人
- ITコンサル -> こまった会社の助っ人
`;

    // “第2話の方向性”をchoiceIdで固定して、話が暴れないようにする
    const choiceMeaning = {
      A: "スピード重視で、ひらめき・行動で突破する（ドローン/空飛ぶ要素を活かす）",
      B: "じっくり観察して、仕組み・ルール・コードで突破する（カード型プログラミング等）",
      C: "仲間や人を助ける行動で突破する（協力・役割分担・UX的視点も歓迎）"
    };

    const episodeInstruction = isSecondEpisode
      ? `
あなたは「第2話」を作ります。
前回の要約と、ユーザーの選択を必ず反映してください。

【前回の要約】
${previousSummary}

【ユーザーの選択】
- choiceId: ${choiceId}
- choiceText: ${choiceText || "未指定"}
- 選択の意味（固定）: ${choiceMeaning[choiceId]}

【物語の狙い】
今回は「承→転→結」へ進めます。
- “転”で、主人公の活躍が実は「職業の力」だったと気づける展開を入れる（roleRevealと整合）
- 最後は小さな成功体験（ほめられる・表彰・称号の予告）で終える
`
      : `
あなたは「第1話」を作ります。
起承転結のうち「起〜承 + 転の予告」まで。
`;

    const prompt = `
あなたは小学生(特に10歳前後)向けの「ストーリー体験型テック冒険」を作る作家です。
入力属性に沿って、没入感が高く、怖すぎず、ワクワクする物語を作ってください。

${episodeInstruction}

【入力属性】
- ニックネーム: ${nickname}
- 学年/年齢: ${gradeOrAge}
- 好きなこと: ${likes.join(" / ")}
- 思考タイプ: ${thinkingStyle}（ひらめくorじっくり）
- スタイル: ${socialStyle}（ひとりorみんな）
- テック経験: ${techLevel || "未指定"}
- 刺激耐性: ${stimulusTolerance || "未指定"}

【世界観】
キラキラ未来シティ。VR/ドローン/コードゲーム/3Dプリンター/空飛ぶ車などが登場。

【必須要件（絶対）】
- JSONスキーマに完全一致で出力する（余計な文章は禁止）
- episode: ${isSecondEpisode ? 2 : 1}
- title: 15字以内
- story: 800〜1200字くらい。小学生に分かる言葉。主人公は必ず${nickname}。
- story内で、${likes.join(" / ")}の要素が“得意”として活躍に直結する。
- thinkingStyle, socialStyle が行動や仲間の出方に反映される。
- roleReveal は、今回の活躍に一番近い職業を次の表から1つ選び、realRole/kidsRole/oneLine を埋める。
${roleTable}
- choices: 3つ。次に起きる展開が変わりそうな選択。idは必ずA/B/C。hintはネタバレしない方向性1行。
- hidden.nextSummary: 次話に渡す要約を100〜150字で。
- hidden.stats: courage/trust/curiosity を0〜3で設定（今回の展開に合わせる）
- hidden.difficulty: techLevel が「初めて」なら easy、それ以外は normal
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-4.1-mini",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "story_response",
        json_schema: schema
      }
    }
  })
});


    if (!r.ok) {
      const errText = await r.text();
      return res.status(500).json({ error: "OpenAI API error", detail: errText });
    }

    const data = await r.json();

    const content =
      data.output_text ||
      (data.output?.[0]?.content?.[0]?.text) ||
      null;

    if (!content) {
      return res.status(500).json({ error: "No output_text found", raw: data });
    }

    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}
