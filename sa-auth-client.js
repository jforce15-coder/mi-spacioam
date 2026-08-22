/* Spacio AM · Cliente de auth unificado (hoja «Control de usuarios»).
   Configura aquí la URL /exec del endpoint (archivo 03-auth-endpoint) y el token.
   Mientras la URL sea el placeholder, el login usa el respaldo viejo de la app. */
(function (global) {
  var CFG = {
    url:   'PEGA_AQUI_SA_AUTH_URL',   // <-- reemplazar por la URL /exec del endpoint
    token: 'SpacioAM2026!'
  };
  function call(action, payload) {
    if (!CFG.url || CFG.url.indexOf('http') !== 0) return Promise.resolve({ ok: false, error: 'no_url' });
    var body = Object.assign({ action: action, token: CFG.token }, payload || {});
    return fetch(CFG.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); })
      .catch(function (e) { return { ok: false, error: String(e) }; });
  }
  global.SAAuth = {
    configure: function (url, token) { CFG.url = url; if (token) CFG.token = token; },
    login:              function (email, password) { return call('login', { email: email, password: password }); },
    setInitialPassword: function (email, next)     { return call('setInitialPassword', { email: email, next: next }); },
    setPassword:        function (email, current, next) { return call('setPassword', { email: email, current: current, next: next }); },
    setEmail:           function (email, next)     { return call('setEmail', { email: email, next: next }); },
    setPhoto:           function (email, url)      { return call('setPhoto', { email: email, url: url }); },
    profile:            function (email)           { return call('profile', { email: email }); }
  };
})(window);
