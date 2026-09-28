// 公式のデッキ構築サイト（pokemon-card.com）のデッキコードから、カードの一覧を取る。
// 公開ページ（index.html）と、勝率表を作るスクリプト（作者の手元にある）の両方がこれを使う。

export const DECK_CODE_RE = /^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/;

// 確認ページの hidden input の名前 → カードの分類
const FIELD_CATEGORY = {
  deck_pke: 'pokemon',
  deck_gds: 'goods',
  deck_tool: 'tool',
  deck_tech: 'tool',
  deck_sup: 'supporter',
  deck_sta: 'stadium',
  deck_ene: 'energy',
};

export function deckPageUrl(code) {
  return `https://www.pokemon-card.com/deck/confirm.html/deckID/${code}/`;
}

// 名前の後ろのかっこを外す。「(ACE SPEC)」は印として残す。
// 例: 'メガガルーラex(M-P 086/M-P)' → { name: 'メガガルーラex', aceSpec: false }
//     'アンフェアスタンプ(ACE SPEC)' → { name: 'アンフェアスタンプ', aceSpec: true }
export function splitCardName(raw) {
  const m = raw.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!m) return { name: raw.trim(), aceSpec: false, printing: '' };
  const inner = m[2].trim();
  if (inner === 'ACE SPEC') return { name: m[1].trim(), aceSpec: true, printing: '' };
  return { name: m[1].trim(), aceSpec: false, printing: inner };
}

// 確認ページの HTML → [{ id, name, count, category, aceSpec, printing }]
export function parseDeckPage(html) {
  const names = {};
  for (const m of html.matchAll(/PCGDECK\.searchItemName\[(\d+)\]='([^']+)'/g)) {
    names[m[1]] = m[2];
  }
  const cards = [];
  for (const [field, category] of Object.entries(FIELD_CATEGORY)) {
    const m = html.match(new RegExp(`name="${field}"[^>]*value="([^"]*)"`));
    if (!m || !m[1]) continue;
    for (const entry of m[1].split('-').filter(Boolean)) {
      const [id, count] = entry.split('_');
      const raw = names[id] || `card_${id}`;
      cards.push({ id, ...splitCardName(raw), count: parseInt(count, 10) || 1, category });
    }
  }
  return cards;
}

export async function fetchDeck(code, fetchImpl = fetch) {
  if (!DECK_CODE_RE.test(code)) throw new Error(`デッキコードの形式が違う: ${code}`);
  const res = await fetchImpl(deckPageUrl(code));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cards = parseDeckPage(await res.text());
  if (cards.length === 0) throw new Error('カードの一覧を取れなかった（デッキコードが無効か、ページの形が変わった）');
  return cards;
}
