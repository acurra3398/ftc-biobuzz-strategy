// The handover page. You tinker in the browser; this turns what you have into
// something Claude can bake into defaults.js so it survives a Reset and is what
// your teammates get when they clone the folder.

import { h, area, btn, card, stat, toast, fmt } from '../ui.js';

export function renderConfigure(root, store) {
  const cfg = store.cfg;
  const json = JSON.stringify(cfg, null, 2);
  const bytes = new Blob([json]).size;

  store.ui.askNote ??= '';

  const noteBox = h('textarea', {
    placeholder: 'Optional. Anything you want changed that this page cannot edit — new actions, point values, ranking-point rules, timings…\n\nFor example:\n  • Scoring in the high basket is 8 points, low is 2\n  • Add an action "hang specimen" at the submersible, 2.5 s, 10 points\n  • The ascent RP needs level 2 held for 5 s',
    style: { minHeight: '130px' },
  });
  noteBox.value = store.ui.askNote;
  noteBox.addEventListener('input', () => { store.ui.askNote = noteBox.value; });

  const jsonBox = h('textarea', { readonly: true, class: 'mono', style: { minHeight: '190px', fontSize: '11px' } });
  jsonBox.value = json;

  const message = () =>
    `Here is my current FTC Strategy Lab configuration. Please make it the permanent default in js/defaults.js.\n` +
    (store.ui.askNote.trim() ? `\nAlso change these:\n${store.ui.askNote.trim()}\n` : '') +
    `\n\`\`\`json\n${json}\n\`\`\`\n`;

  async function copyAll() {
    try { await navigator.clipboard.writeText(message()); toast('Copied — paste it to Claude'); }
    catch { jsonBox.select(); toast('Could not reach the clipboard; select the box and copy manually'); }
  }

  function download() {
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Saved to your Downloads folder as my-config.json');
  }

  // ---- what is in here ------------------------------------------------------
  const summary = card('What you are sending', '',
    h('div', { class: 'cols c3' },
      stat('Structures', cfg.obstacles.length, 'on the field'),
      stat('Locations', cfg.locations.length, 'the robot drives to'),
      stat('Actions', cfg.actions.length, 'things it can do'),
      stat('Elements', cfg.elements.length, 'it can carry'),
      stat('Ranking points', cfg.rankingPoints.filter(r => r.enabled).length, 'in play'),
      stat('Strategies', cfg.strategies.length, 'written'),
    ),
    h('div', { class: 'sub', style: { marginTop: '10px' } },
      `Everything: field layout, robot, actions, ranking points, strategies and the variation settings. ${fmt(bytes / 1024, 1)} KB of JSON.`),
  );

  // ---- the two ways ---------------------------------------------------------
  const handover = card('Send it to Claude', 'either way works',
    h('div', { class: 'cols c2' },
      h('div', { class: 'stat', style: { padding: '13px' } },
        h('h3', {}, '1 · Download the file'),
        h('p', { class: 'sub', style: { margin: '5px 0 10px', lineHeight: 1.55 } },
          'Easiest for a big configuration. Saves ', h('code', {}, 'my-config.json'),
          ' to your Downloads folder, then you tell Claude: ',
          h('b', {}, '“load my-config.json from Downloads and make it the default”'), '.'),
        btn('Download my-config.json', download, 'primary'),
      ),
      h('div', { class: 'stat', style: { padding: '13px' } },
        h('h3', {}, '2 · Copy a ready-made message'),
        h('p', { class: 'sub', style: { margin: '5px 0 10px', lineHeight: 1.55 } },
          'Copies your notes plus the whole configuration, already worded as a request. Paste it straight into the chat.'),
        btn('Copy message to clipboard', copyAll, 'primary'),
      ),
    ),
  );

  const ask = card('Anything Claude should change while it is in there?', 'this rides along with the message',
    noteBox,
    h('div', { class: 'sub', style: { marginTop: '8px' } },
      'Actions, point values, timings and ranking-point rules are read-only in the app on purpose — they come from the game manual, and a stray keystroke in a number box is a bad way to lose them. Write what you want here instead.'),
  );

  const raw = card('The raw JSON', 'if you would rather look at it yourself', jsonBox);

  const what = card('What “make it the default” means', '',
    h('ul', { class: 'sub', style: { margin: 0, paddingLeft: '18px', lineHeight: 1.7 } },
      h('li', {}, 'Claude writes your setup into ', h('code', {}, 'js/defaults.js'), '.'),
      h('li', {}, h('b', {}, 'Reset'), ' then returns to your game instead of the blank placeholder.'),
      h('li', {}, 'Anyone who opens the folder gets your field, your actions and your strategies with nothing to import.'),
      h('li', {}, 'It is a real file in the project, so it goes in Git and survives clearing your browser.'),
    ),
  );

  root.append(
    h('div', { class: 'page-head' }, h('div', {},
      h('h1', { style: { fontSize: '17px' } }, 'Configure'),
      h('p', {}, 'The app saves to your browser, which is fine for tinkering and useless for anything permanent. This hands your setup to Claude to write into the project itself.'))),
    summary, handover, ask, what, raw,
  );
}
