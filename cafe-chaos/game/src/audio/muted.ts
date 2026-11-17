/**
 * Silent while testing on this computer: on a page served from localhost
 * (the dev server, the checks and recordings) the theme and every sound
 * stay off. Add `?sound` to the address to hear them there. On the headset
 * (the LAN address) and the published game nothing changes.
 */
const host = typeof location !== 'undefined' ? location.hostname : '';
export const MUTED_HERE = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) && !new URLSearchParams(typeof location !== 'undefined' ? location.search : '').has('sound');
