import { h, p } from '../ui.js';

export function renderHelp() {
  return h('section', { class: 'view' }, h('h2', null, 'Help'), p('Coming in a later phase.'));
}
