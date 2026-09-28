// デッキのカード一覧 → エンジン（pokeca-engine-rs）に渡すデッキの JSON。
// 公開ページ（index.html）と、勝率表を作るスクリプト（作者の手元にある）が同じこれを使う。
// 同じデッキなら、ページで計算しても勝率表と同じ条件になる。
//
// カードの値は data.json の cards（公式のカード番号ごと）から引く。
// 無いカードは、名前で引ける別の番号の値を使い、それも無ければ「データに無いカード」として数える。

// エネルギーのタイプ → エンジンの番号
export const ETYPE = { fire: 1, water: 2, grass: 3, lightning: 4, psychic: 5, fighting: 6, dark: 7, steel: 8, dragon: 9, colorless: 0 };

// 基本エネルギーの名前に入っている字 → タイプの番号
const BASIC_ENERGY = { '草': 3, '炎': 1, '水': 2, '雷': 4, '超': 5, '闘': 6, '悪': 7, '鋼': 8, '龍': 9 };

// 1枚で複数のタイプになれる特殊エネルギー（デッキが要るタイプに寄せる）
const MULTI_ENERGY = {
  'ロケット団エネルギー': [5, 7],
  'プリズムエネルギー': [1, 2, 3, 4, 5, 6, 7, 8, 9],
  'ルミナスエネルギー': [1, 2, 3, 4, 5, 6, 7, 8, 9],
  'マルチエネルギー': [1, 2, 3, 4, 5, 6, 7, 8, 9],
  'レガシーエネルギー': [1, 2, 3, 4, 5, 6, 7, 8, 9],
  'Nのきずな': [7],
};

// 特殊エネルギーのうち、エンジンに専用の処理があるもの（effect_id）
const ENERGY_EFFECT = { 'リッチエネルギー': [100, 4], 'ロケット団エネルギー': [200, 0], 'イグニッションエネルギー': [201, 0] };

export function energyTypeId(name, neededTypes) {
  const multi = Object.entries(MULTI_ENERGY).find(([key]) => name.includes(key));
  if (multi) {
    const hit = multi[1].find(t => neededTypes.has(t));
    return hit ?? multi[1][0];
  }
  // 「基本超エネルギー」「テレパス超エネルギー」「ロック闘エネルギー」のように、エネルギーの直前の字がタイプ
  const m = name.match(/(草|炎|水|雷|超|闘|悪|鋼|龍)エネルギー$/);
  return m ? BASIC_ENERGY[m[1]] : 0;
}

// デッキのエネルギーで出せるタイプ（番号の集合）
function providedTypes(cardList) {
  const types = new Set();
  for (const e of cardList) {
    if (e.category !== 'energy') continue;
    const multi = Object.entries(MULTI_ENERGY).find(([key]) => e.name.includes(key));
    if (multi) multi[1].forEach(t => types.add(t));
    else {
      const t = energyTypeId(e.name, new Set());
      if (t > 0) types.add(t);
    }
  }
  return types;
}

// デッキのエネルギーでは、どのワザも打てない（またはワザが無い）ポケモンか。
// こうしたポケモンは、最初のバトル場や、きぜつした後の入れ替えで選ばないよう印をつける（エンジンの bench_only_hint）
function cannotAttack(card, provided) {
  const atks = card.attacks || [];
  if (atks.length === 0) return true;
  return atks.every(a => (a.energy_cost || []).some(ec => {
    const t = ETYPE[ec.type];
    return t > 0 && !provided.has(t);
  }));
}

// デッキのカード一覧から、カードの値を引く。{ card, id, source } を返す
//   source: 'id'（番号で引けた）/ 'name'（別の番号の同名カードで代用）/ 'missing'
export function lookupCard(entry, cards, byName) {
  if (entry.id && cards[entry.id]) return { card: cards[entry.id], id: entry.id, source: 'id' };
  const alt = byName?.[entry.name];
  if (alt && cards[alt]) return { card: cards[alt], id: alt, source: 'name' };
  return { card: null, id: entry.id || '', source: 'missing' };
}

// 名前 → 代表の番号（同名の別の版が複数あるときは後から入れたもの）
export function indexByName(cards) {
  const byName = {};
  for (const [id, c] of Object.entries(cards)) byName[c.name] = id;
  return byName;
}

// 対応表でワザに足した値は、下で名前を挙げていないものもそのまま渡す（エンジンに新しい効果を足したとき、ここを直さなくてよいように）
function toAttackJson(a) {
  return {
    ...a,
    name: a.name,
    damage: a.damage || 0,
    energy_count: a.energy_count ?? (a.energy_cost || []).reduce((s, e) => s + e.count, 0),
    energy_cost: a.energy_cost || [],
    damage_type: a.damage_type || 'fixed',
    bonus_condition: a.bonus_condition || '',
    bonus_amount: a.bonus_amount || 0,
    bonus_multiplier: a.bonus_multiplier || 0,
    effect: a.effect || '',
    effect_value: a.effect_value || 0,
    bench_snipe: a.bench_snipe || 0,
    bench_damage_all: a.bench_damage_all || 0,
    bench_damage_multiplier: 0,
    bench_damage_base: 0,
    energy_accel_from_trash: a.energy_accel_from_trash || 0,
    energy_accel_from_deck: a.energy_accel_from_deck || 0,
    scatter_per_hit: a.scatter_per_hit || 0,
    scatter_hit_count: a.scatter_hit_count || 0,
  };
}

// 同じ進化の系統のカードに、デッキの中で同じ番号をふる。
// card.family は公式ページの「進化」欄に並ぶ名前の一覧。名前を1つでも共有するカードを同じ系統にまとめる
// （ページによって並ぶ名前が少し違うことがあるので、完全一致では比べない）
function familyIds(resolved) {
  const parent = {};
  const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (const r of resolved) {
    const fam = r.card?.family;
    if (!fam || !fam.length) continue;
    for (const n of fam) if (!(n in parent)) parent[n] = n;
    for (const n of fam.slice(1)) union(fam[0], n);
  }
  const ids = {};
  const rootId = {};
  let next = 1;
  for (const r of resolved) {
    const fam = r.card?.family;
    if (!fam || !fam.length) continue;
    const root = find(fam[0]);
    if (!rootId[root]) rootId[root] = next++;
    ids[r.card.name] = rootId[root];
  }
  return ids;
}

const blankCard = kind => ({
  kind, hp: 0, prize_cost: 0, attacks: [], attack_type: '', weakness: '',
  is_ex: false, has_immunity: false, ability: '', stage: 0,
  effect_id: 0, effect_value: 0,
});

// cardList: [{ id, name, count, category }]
// data: { cards, byName }  opts: { energyAccel, benchSize }
// 返り値: { deck: エンジンに渡す JSON, missing: [名前], substituted: [名前], unsupported: [{ name, what }] }
export function buildDeck(cardList, data, opts = {}) {
  const { cards, byName = indexByName(cards) } = data;
  const resolved = cardList.map(e => ({ entry: e, ...lookupCard(e, cards, byName) }));
  const fam = familyIds(resolved);

  const neededTypes = new Set();
  for (const r of resolved) {
    for (const a of r.card?.attacks || []) {
      for (const ec of a.energy_cost || []) {
        const t = ETYPE[ec.type];
        if (t > 0) neededTypes.add(t);
      }
    }
  }

  const provided = providedTypes(cardList);
  const out = [];
  const missing = [];
  const substituted = [];
  const unsupported = [];
  let deckWeakness = '';
  let bossCount = 0;
  let beltCount = 0;

  for (const { entry, card, source } of resolved) {
    if (source === 'missing') missing.push(entry.name);
    if (source === 'name') substituted.push(entry.name);
    for (const what of card?.unsupported || []) unsupported.push({ name: entry.name, what });
    const cat = card?.category || entry.category;

    for (let i = 0; i < entry.count; i++) {
      if (cat === 'pokemon') {
        if (!card) {
          // データに無いポケモン: ワザも特性も無い HP70 のポケモンとして置く（画面に「データに無い」と出す）
          out.push({ ...blankCard('pokemon'), name: entry.name, hp: 70, prize_cost: 1 });
          continue;
        }
        const attacks = (card.attacks || []).map(toAttackJson);
        if (!deckWeakness && card.weakness && attacks.some(a => a.damage > 0)) deckWeakness = card.weakness;
        out.push({
          // 対応表でカードに足した値（engine）は、そのままエンジンに渡す
          ...(card.engine || {}),
          kind: 'pokemon', name: card.name, hp: card.hp, prize_cost: card.prize_cost,
          attacks, attack_type: card.type || '', weakness: card.weakness || '',
          is_ex: !!card.is_ex, has_immunity: false, ability: card.ability || '',
          stage: card.stage || 0, retreat: card.retreat ?? 1, effect_id: 0, effect_value: 0,
          evolution_chain_id: fam[card.name] || 0,
          is_n_pokemon: card.name.startsWith('Nの'),
          is_rocket_pokemon: card.name.startsWith('ロケット団の'),
          is_terastal: !!card.is_terastal,
          bench_only_hint: cannotAttack(card, provided),
        });
      } else if (cat === 'energy') {
        // 専用の処理がある特殊エネルギーの番号。ENERGY_EFFECT に無ければ、対応表（encodings.json の trainers）で付けた番号を使う
        const eff = ENERGY_EFFECT[entry.name] || [card?.effect_id || 0, card?.effect_value || 0];
        out.push({ ...blankCard('energy'), name: entry.name, effect_id: eff[0], effect_value: eff[1], energy_type_id: energyTypeId(entry.name, neededTypes) });
      } else {
        // トレーナーズ: cards にある effect_id を使う。無ければ効果の無いカードとして置く
        const kind = cat === 'supporter' ? 'supporter' : cat === 'stadium' ? 'stadium' : (cat === 'tool' || card?.tool) ? 'tool' : 'item';
        if (entry.name === 'ボスの指令') bossCount++;
        if (entry.name.includes('マキシマムベルト')) beltCount++;
        out.push({ ...blankCard(kind), ...(card?.engine || {}), name: entry.name, effect_id: card?.effect_id || 0, effect_value: card?.effect_value || 0 });
      }
    }
  }

  // 60枚に足りないときは基本エネルギーで埋める（公式のデッキは60枚なので、普通は起きない）
  while (out.length < 60) out.push({ ...blankCard('energy'), energy_type_id: 0 });

  return {
    deck: {
      name: opts.name || 'deck',
      cards: out.slice(0, 60),
      energy_accel: opts.energyAccel || 0,
      weakness: deckWeakness,
      boss_count: bossCount,
      belt_count: beltCount,
      bench_size: opts.benchSize || 5,
    },
    missing: [...new Set(missing)],
    substituted: [...new Set(substituted)],
    unsupported,
  };
}

// 勝率表と使用率から、環境への強さ（相手の使用率で重みをつけた平均勝率）と CSP 近似の順位を出す
export function computeRanking(deckIds, winrateMatrix, shares) {
  const rows = deckIds.map(id => {
    let w = 0;
    let t = 0;
    for (const other of deckIds) {
      if (other === id) continue;
      const s = shares[other] || 0;
      const wr = winrateMatrix[id]?.[other];
      if (wr === undefined) continue;
      w += wr * s;
      t += s;
    }
    const fitness = t > 0 ? w / t : 0.5;
    const share = shares[id] || 0;
    return { deckId: id, share, fitness, csp: share * fitness };
  });
  rows.sort((a, b) => b.csp - a.csp);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
