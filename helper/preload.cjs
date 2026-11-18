'use strict';
// Runs before the DSH page scripts in the prompt window. The authenticated URL
// can lose its ?dshds=prompt query during the app's boot, so persist the role in
// the page's sessionStorage; the layout client's readRole() checks it next.
try {
  window.sessionStorage.setItem('dsh.dualscreen.role', 'prompt');
} catch {
  /* storage unavailable */
}
