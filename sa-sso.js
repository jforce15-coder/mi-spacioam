/* Spacio AM · Sesión única desde el hub (sa-sso.js)
   Cárgalo en el <head> de epi, hola, mi y grow, ANTES del script que revisa si hay sesión:
       <script src="sa-sso.js"></script>
   Si la URL trae #sa_sso=<token> (el hub lo agrega al abrir la app), guarda la sesión igual que el hub
   (cookie sa_session en .spacioam.com + localStorage) y limpia la URL. Así no se vuelve a pedir login. */
(function () {
  try {
    var h = location.hash || "", m = h.match(/[#&]sa_sso=([^&]+)/); if (!m) return;
    var t = decodeURIComponent(m[1]);
    var s = JSON.parse(decodeURIComponent(escape(atob(t.replace(/-/g, "+").replace(/_/g, "/")))));
    if (s && s.email && (!s.exp || s.exp > Date.now())) {
      var marca = /(^|\.)spacioam\.com$/.test(location.hostname);
      document.cookie = "sa_session=" + t + (marca ? "; domain=.spacioam.com" : "") + "; path=/; Secure; SameSite=Lax; max-age=" + (180 * 86400);
      document.cookie = "sa_hub_seen=" + Date.now() + (marca ? "; domain=.spacioam.com" : "") + "; path=/; Secure; SameSite=Lax";
      try { localStorage.setItem("sa_session", t); } catch (e) {}
      window.SA_SSO_PROFILE = s;   // por si la app guarda su propia sesión: { email, nombre, apps, rol }
      try { window.dispatchEvent(new CustomEvent("sa-sso", { detail: s })); } catch (e) {}
    }
    var limpio = h.replace(/[#&]sa_sso=[^&]+/, "").replace(/^&/, "#");
    history.replaceState(null, "", location.pathname + location.search + (limpio === "#" ? "" : limpio));
  } catch (e) {}
})();
