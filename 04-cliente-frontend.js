/**********************************************************************
 * SPACIO AM · Cliente de auth unificado para el frontend
 * Súbelo al repo de cada app y cárgalo en el HTML:
 *   <script src="sa-auth-client.js"></script>
 * Requiere fetch (todos los navegadores modernos).
 **********************************************************************/
(function (global) {
  var CFG = {
    // Pega aquí la URL /exec de la implementación web (archivo 03) y el token.
    url:   'https://script.google.com/macros/s/AKfycbxfdwLzsA8bwgOxUTOtf3Hw1ptIm8Cy34tspmFndu3WtRrkVSSnGyBP7obRrm73mcUd/exec',
    token: 'SpacioAM2026!'
  };

  function call(action, payload) {
    var body = Object.assign({ action: action, token: CFG.token }, payload || {});
    // text/plain evita el preflight CORS de Apps Script
    return fetch(CFG.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); })
      .catch(function (e) { return { ok: false, error: String(e) }; });
  }

  var SAAuth = {
    configure: function (url, token) { CFG.url = url; if (token) CFG.token = token; },
    // Devuelve { ok, profile:{ user_id, nombre, email, foto, apps:{mi,epi,...} } }
    login:       function (email, password) { return call('login', { email: email, password: password }); },
    setInitialPassword: function (email, next) { return call('setInitialPassword', { email: email, next: next }); },
    profile:     function (email)           { return call('profile', { email: email }); },
    setPassword: function (email, current, next) { return call('setPassword', { email: email, current: current, next: next }); },
    setEmail:    function (email, next)      { return call('setEmail', { email: email, next: next }); },
    setPhoto:    function (email, url)       { return call('setPhoto', { email: email, url: url }); },
    // Helper: ¿este perfil tiene acceso a la app? -> rol o null
    roleFor:     function (profile, appKey)  { return (profile && profile.apps && profile.apps[appKey]) || null; }
  };

  global.SAAuth = SAAuth;
})(window);
