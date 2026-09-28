// 画面を固めないよう、エンジン（Wasm）の計算はこの Worker の中で回す。
// 受け取る: { reqId, type: 'versus', my, opponents: [{ id, deck }], trials }
//           { reqId, type: 'version' }
// 返す:     { reqId, type: 'progress', done, total, id, winrate } / { reqId, type: 'done', results } / { reqId, type: 'error', message }
import init, { analyze_matchup, engine_version } from '../pkg/pokeca_engine_rs.js';

let ready = null;

self.onmessage = async (event) => {
  const msg = event.data;
  const reply = body => self.postMessage({ reqId: msg.reqId, ...body });
  try {
    if (!ready) ready = init();
    await ready;
    if (msg.type === 'version') {
      reply({ type: 'done', results: engine_version() });
      return;
    }
    if (msg.type === 'versus') {
      const myJson = JSON.stringify(msg.my);
      const results = [];
      for (let i = 0; i < msg.opponents.length; i++) {
        const o = msg.opponents[i];
        const winrate = analyze_matchup(myJson, JSON.stringify(o.deck), msg.trials);
        results.push({ id: o.id, winrate });
        reply({ type: 'progress', done: i + 1, total: msg.opponents.length, id: o.id, winrate });
      }
      reply({ type: 'done', results });
      return;
    }
    reply({ type: 'error', message: `知らない依頼: ${msg.type}` });
  } catch (err) {
    reply({ type: 'error', message: String(err?.message || err) });
  }
};
