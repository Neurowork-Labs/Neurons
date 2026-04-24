/**
 * Neurons — RAG agent embeddable widget (vanilla JS).
 * Loads DM Sans from Google Fonts; theme via data-primary-color (default: app emerald CTA #065f46).
 *
 * Optional:
 *   data-agent-name="..." (sets widget title before history loads)
 *   data-default-greetings="..." (sets first assistant greeting; supports string/JSON array)
 *   data-greeting="..." (legacy alias of data-default-greetings)
 *   data-preview-token="..." (dashboard preview token; bypasses public API key + origin checks)
 *
 * Example:
 * <script
 *   src="https://YOUR_APP_ORIGIN/scripts/rag-agent-widget.js"
 *   data-api-key="aepk_..."
 *   data-project-agent-id="UUID"
 *   data-primary-color="#065f46"
 *   async
 * ></script>
 */
(function () {
  'use strict';

  var DEFAULT_PRIMARY = '#065f46';
  var DEFAULT_GREETING =
    "Hey, I'm an assistant. How may I help you today?";

  var SCRIPT =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  if (!SCRIPT || !SCRIPT.src) return;

  var API_KEY = (SCRIPT.getAttribute('data-api-key') || '').trim();
  var PREVIEW_TOKEN = (SCRIPT.getAttribute('data-preview-token') || '').trim();
  var PROJECT_AGENT_ID = (SCRIPT.getAttribute('data-project-agent-id') || '').trim();
  function normalizePrimaryColor(raw) {
    var v = String(raw || '').trim();
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return DEFAULT_PRIMARY;
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      return (
        '#' +
        v.charAt(1) + v.charAt(1) +
        v.charAt(2) + v.charAt(2) +
        v.charAt(3) + v.charAt(3)
      ).toUpperCase();
    }
    return v.toUpperCase();
  }
  var PRIMARY = normalizePrimaryColor(SCRIPT.getAttribute('data-primary-color') || DEFAULT_PRIMARY);
  var API_BASE = (SCRIPT.getAttribute('data-api-base-url') || '').trim();
  var AGENT_NAME_OVERRIDE = (SCRIPT.getAttribute('data-agent-name') || '').trim();

  function parseGreetingsAttr(raw) {
    var v = String(raw || '').trim();
    if (!v) return '';
    // Support escaping in HTML attributes: "\n" => real newline.
    v = v.replace(/\\n/g, '\n');
    try {
      var first = v.charAt(0);
      if (first === '[' || first === '{') {
        var parsed = JSON.parse(v);
        if (Array.isArray(parsed)) {
          return parsed
            .map(function (x) { return String(x == null ? '' : x).trim(); })
            .filter(function (x) { return x; })
            .join('\n\n');
        }
        if (typeof parsed === 'string') return parsed.trim();
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.text === 'string') return parsed.text.trim();
          if (Array.isArray(parsed.greetings)) {
            return parsed.greetings
              .map(function (x) { return String(x == null ? '' : x).trim(); })
              .filter(function (x) { return x; })
              .join('\n\n');
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
    // Simple non-JSON format: use "|" as a multi-paragraph separator.
    if (v.indexOf('|') !== -1) {
      return v
        .split('|')
        .map(function (s) { return String(s == null ? '' : s).trim(); })
        .filter(function (s) { return s; })
        .join('\n\n');
    }
    return v;
  }

  var attrDefaultGreetings = parseGreetingsAttr(
    SCRIPT.getAttribute('data-default-greetings') || SCRIPT.getAttribute('data-greeting') || ''
  );

  var _storedGreeting = '';
  // NOTE: keep this key as a literal for early init safety (LS_GREETING is declared later in the file).
  try { _storedGreeting = localStorage.getItem('ae_rag_greeting') || ''; } catch (e) { /* ignore */ }
  if (attrDefaultGreetings) {
    try { localStorage.setItem('ae_rag_greeting', attrDefaultGreetings); } catch (e) { /* ignore */ }
  }
  var GREETING = (attrDefaultGreetings || _storedGreeting || DEFAULT_GREETING).trim();

  if ((!API_KEY && !PREVIEW_TOKEN) || !PROJECT_AGENT_ID) {
    console.warn('[ae-rag-widget] Missing auth token (data-api-key or data-preview-token) or data-project-agent-id.');
    return;
  }

  try {
    var scriptUrl = new URL(SCRIPT.src);
    var ORIGIN = API_BASE ? API_BASE.replace(/\/$/, '') : scriptUrl.origin;
  } catch (e) {
    console.warn('[ae-rag-widget] Invalid script URL.');
    return;
  }

  var CHAT_URL = ORIGIN + '/api/public/rag/chat';
  var HISTORY_URL = ORIGIN + '/api/public/rag/history';
  var WIDGET_CONFIG_URL = ORIGIN + '/api/public/rag/widget-config';
  var CONTACT_URL = ORIGIN + '/api/public/rag/contact';

  function buildAuthHeaders() {
    var headers = {};
    if (API_KEY) headers['x-api-key'] = API_KEY;
    if (PREVIEW_TOKEN) headers['x-ae-preview-token'] = PREVIEW_TOKEN;
    return headers;
  }

  var LS_VISITOR = 'ae_rag_visitor_id';
  var LS_SESSION = 'ae_rag_session_id';
  var LS_CONV = 'ae_rag_conversation_id';
  var LS_AGENT = 'ae_rag_project_agent_id';
  var LS_THEME = 'ae_rag_theme';
  var LS_PROJECT_NAME = 'ae_rag_project_name';
  var LS_GREETING = 'ae_rag_greeting';
  var LS_CONTACT_CAPTURE = 'ae_rag_contact_capture_' + PROJECT_AGENT_ID;
  var MAX_VISIBLE_MESSAGES = 20;

  var mdLibs = { _ready: false, _loading: false };

  function loadScript(src, onload) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = onload;
    s.onerror = function () {
      onload();
    };
    document.head.appendChild(s);
  }

  function loadMarkdownLibs() {
    if (mdLibs._loading) return;
    mdLibs._loading = true;
    var n = 2;
    function done() {
      n--;
      if (n <= 0) {
        mdLibs._ready =
          typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined';
      }
    }
    loadScript('https://cdn.jsdelivr.net/npm/marked@11/lib/marked.umd.js', done);
    loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js', done);
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function loadFont() {
    var id = 'ae-rag-dm-sans';
    if (document.getElementById(id)) return;
    var pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://fonts.googleapis.com';
    document.head.appendChild(pre);
    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = '';
    document.head.appendChild(pre2);
    var link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap';
    document.head.appendChild(link);
  }

  function injectWidgetStyles() {
    var id = 'ae-rag-widget-styles';
    if (document.getElementById(id)) return;
    var st = document.createElement('style');
    st.id = id;
    var primaryCssVar = 'var(--ae-primary,#065f46)';
    st.textContent = [
      '@keyframes ae-rag-dot-bounce{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}',
      '@keyframes ae-rag-spin{to{transform:rotate(360deg)}}',
      '[data-ae-rag-widget] .ae-rag-msg-bot{font-size:15px;line-height:1.5;color:#0f172a;}',
      '[data-ae-rag-widget] .ae-rag-msg-bot p{margin:0 0 .5em 0;}',
      '[data-ae-rag-widget] .ae-rag-msg-bot p:last-child{margin-bottom:0;}',
      '[data-ae-rag-widget] .ae-rag-msg-bot ul,[data-ae-rag-widget] .ae-rag-msg-bot ol{margin:.35em 0;padding-left:1.35em;}',
      '[data-ae-rag-widget] .ae-rag-msg-bot li{margin:.2em 0;}',
      '[data-ae-rag-widget] .ae-rag-msg-bot strong{font-weight:600;}',
      '[data-ae-rag-widget] .ae-rag-msg-bot a{color:' + PRIMARY + ';text-decoration:underline;}',
      '[data-ae-rag-widget] .ae-rag-greeting{margin-bottom:10px;padding:10px 4px;border-radius:12px;max-width:92%;font-size:15px;line-height:1.5;color:#0f172a;background:transparent;border:none;text-align:left;white-space:normal;word-break:break-word;}',
      '[data-ae-rag-widget] .ae-rag-contact-wrap{position:relative;margin:0 0 12px 0;padding:10px 12px;border-radius:12px;border:none;background:transparent;font-family:"DM Sans",system-ui,sans-serif;}',
      '[data-ae-rag-widget] .ae-rag-contact-title{margin:0 0 8px 0;font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:#475569;font-family:"DM Sans",system-ui,sans-serif;}',
      '[data-ae-rag-widget] .ae-rag-contact-grid{display:grid;grid-template-columns:1fr;gap:8px;}',
      '[data-ae-rag-widget] .ae-rag-contact-input{height:34px;border:1px solid #cbd5e1;border-radius:9px;padding:6px 10px;font-size:14px;outline:none;background:#fff;color:#0f172a;font-family:"DM Sans",system-ui,sans-serif;}',
      '[data-ae-rag-widget] .ae-rag-contact-input:focus{border-color:' + PRIMARY + ';box-shadow:0 0 0 2px color-mix(in srgb,' + PRIMARY + ' 20%, transparent);}',
      '[data-ae-rag-widget] .ae-rag-contact-submit{margin-top:8px;height:36px;border:none;border-radius:9px;padding:0 12px;cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:' + PRIMARY + ';font-family:"DM Sans",system-ui,sans-serif;transition:background-color .15s ease,filter .15s ease;}',
      '[data-ae-rag-widget] .ae-rag-contact-submit:hover:not(:disabled){background:color-mix(in srgb,' + PRIMARY + ' 88%, #000000);filter:brightness(1.04);}',
      '[data-ae-rag-widget] .ae-rag-contact-submit:disabled{cursor:not-allowed;opacity:.7;}',
      '[data-ae-rag-widget] .ae-rag-contact-error{margin-top:6px;font-size:12px;color:#dc2626;font-family:"DM Sans",system-ui,sans-serif;}',
      '[data-ae-rag-widget] .ae-rag-contact-geo-wait{margin-top:4px;font-family:"DM Sans",system-ui,sans-serif;}',
      '[data-ae-rag-widget] .ae-rag-contact-geo-status{margin:0 0 8px 0;font-size:13px;line-height:1.45;color:#64748b;}',
      '[data-ae-rag-widget] .ae-rag-contact-skip-geo{display:inline-block;margin:0;padding:0;border:none;background:transparent;color:' +
        PRIMARY +
        ';font-family:"DM Sans",system-ui,sans-serif;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;}',
      '[data-ae-rag-widget] .ae-rag-contact-skip-geo:hover{filter:brightness(0.92);}',
      '[data-ae-rag-widget] .ae-rag-contact-saving-overlay{position:absolute;inset:0;border-radius:16px;background:transparent;display:flex;align-items:center;justify-content:center;z-index:6;}',
      '[data-ae-rag-widget] .ae-rag-contact-saving-inner{display:flex;flex-direction:column;align-items:center;gap:10px;color:#475569;font-family:"DM Sans",system-ui,sans-serif;text-align:center;padding:12px;}',
      '[data-ae-rag-widget] .ae-rag-contact-saving-icon{width:28px;height:28px;color:' +
        PRIMARY +
        ';animation:ae-rag-spin 1s linear infinite;}',
      '[data-ae-rag-widget] .ae-rag-contact-saving-text{margin:0;font-size:14px;font-weight:600;}',
      '[data-ae-rag-widget] .ae-rag-msg-user{margin-bottom:12px;margin-left:auto;padding:12px 14px;border-radius:12px;max-width:92%;white-space:pre-wrap;word-break:break-word;background:color-mix(in srgb,' + PRIMARY + ' 10%, #ffffff);color:#0f172a;font-size:15px;line-height:1.5;border:none;}',
      '[data-ae-rag-widget] .ae-rag-typing{display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:8px 4px;color:#64748b;font-size:14px;}',
      '[data-ae-rag-widget] .ae-rag-typing-dots{display:inline-flex;gap:2px;align-items:center;}',
      '[data-ae-rag-widget] .ae-rag-typing-dots span{width:6px;height:6px;border-radius:50%;background:' + PRIMARY + ';opacity:.45;animation:ae-rag-dot-bounce 1.2s ease-in-out infinite;}',
      '[data-ae-rag-widget] .ae-rag-typing-dots span:nth-child(2){animation-delay:.15s}',
      '[data-ae-rag-widget] .ae-rag-typing-dots span:nth-child(3){animation-delay:.3s}',
      '[data-ae-rag-widget] .ae-rag-center-loader{display:flex;flex:1;min-height:0;align-items:center;justify-content:center;gap:10px;color:#64748b;font-size:14px;font-family:"DM Sans",system-ui,sans-serif;font-weight:500;}',
      '[data-ae-rag-widget] .ae-rag-center-loader-icon{width:18px;height:18px;animation:ae-rag-spin 1s linear infinite;color:' + PRIMARY + ';}',
      '[data-ae-rag-widget] button.ae-rag-send-btn{background:transparent!important;color:' +
        PRIMARY +
        '!important;box-shadow:none!important;transition:background .15s ease,opacity .15s ease}',
      '[data-ae-rag-widget] button.ae-rag-send-btn:hover:not(:disabled){background:color-mix(in srgb,' +
        PRIMARY +
        ' 12%,transparent)!important}',
      '[data-ae-rag-widget] button.ae-rag-send-btn:active:not(:disabled){background:color-mix(in srgb,' +
        PRIMARY +
        ' 18%,transparent)!important}',

      // Lock the input bar height (prevents Laravel/global CSS from altering input line-height/padding).
      '[data-ae-rag-widget] .ae-rag-input-form{margin:0!important;padding:14px 16px!important;background:transparent!important;flex-shrink:0!important;}',
      '[data-ae-rag-widget] .ae-rag-input-field{height:44px!important;min-height:44px!important;line-height:1.45!important;padding:11px 14px!important;box-sizing:border-box!important;font-size:15px!important;border:none!important;outline:none!important;background:transparent!important;}',

      '[data-ae-rag-widget] .ae-rag-suggestions{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px 0;padding:0 4px;}',
      '[data-ae-rag-widget] .ae-rag-chip{display:inline-block;padding:7px 14px;border-radius:20px;font-size:13px;line-height:1.35;cursor:pointer;border:1px solid ' +
        PRIMARY +
        ';color:' + PRIMARY + ';background:transparent;transition:background .15s,color .15s;font-family:inherit;white-space:normal;text-align:left;max-width:100%;}',
      '[data-ae-rag-widget] .ae-rag-chip:hover{background:' + PRIMARY + ';color:#fff;}',

      '[data-ae-rag-widget] .ae-rag-carousel-wrap{margin:0 0 10px 0;overflow:visible;}',
      '[data-ae-rag-widget] .ae-rag-carousel{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:4px 4px 8px 4px;scrollbar-width:thin;}',
      '[data-ae-rag-widget] .ae-rag-carousel::-webkit-scrollbar{height:4px;background:transparent;}',
      '[data-ae-rag-widget] .ae-rag-carousel::-webkit-scrollbar-track{background:transparent;}',
      '[data-ae-rag-widget] .ae-rag-carousel::-webkit-scrollbar-thumb{background:color-mix(in srgb,' + PRIMARY + ' 45%, #94a3b8);border-radius:2px;}',
      '[data-ae-rag-widget] .ae-rag-carousel{scrollbar-color:color-mix(in srgb,' + PRIMARY + ' 45%, #94a3b8) transparent;}',
      '[data-ae-rag-widget] .ae-rag-card{flex:0 0 72%;max-width:260px;min-width:180px;scroll-snap-align:start;border-radius:12px;background:#fff;border:1px solid #e2e8f0;overflow:hidden;font-size:13px;line-height:1.4;}',
      '[data-ae-rag-widget] .ae-rag-card-img{width:100%;height:120px;object-fit:cover;display:block;background:#e2e8f0;}',
      '[data-ae-rag-widget] .ae-rag-card-body{padding:10px 12px;}',
      '[data-ae-rag-widget] .ae-rag-card-title{font-weight:600;font-size:14px;margin:0 0 4px 0;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '[data-ae-rag-widget] .ae-rag-card-detail{color:#475569;margin:2px 0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '[data-ae-rag-widget] .ae-rag-card-link{text-decoration:none;color:inherit;display:block;cursor:pointer;transition:box-shadow .15s,border-color .15s;}',
      '[data-ae-rag-widget] .ae-rag-card-link:hover .ae-rag-card{border-color:color-mix(in srgb,' + PRIMARY + ' 60%, #e2e8f0);box-shadow:0 2px 8px rgba(0,0,0,.08);}',

      '[data-ae-rag-widget] .ae-rag-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:transparent;color:#0f172a;flex-shrink:0;border-radius:16px 16px 0 0;min-height:48px;box-sizing:border-box;border-bottom:1px solid rgba(148,163,184,0.25);background-image:radial-gradient(rgba(148,163,184,0.14) 1px,transparent 1px);background-size:14px 14px;}',
      '[data-ae-rag-widget] .ae-rag-header-title{font-weight:600;font-size:17px;font-family:"DM Sans",system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}',
      '[data-ae-rag-widget] .ae-rag-theme-toggle{background:transparent;border:none;cursor:pointer;color:' + PRIMARY + ';padding:4px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;transition:background .15s;}',
      '[data-ae-rag-widget] .ae-rag-theme-toggle:hover{background:color-mix(in srgb,' + PRIMARY + ' 12%,transparent);}',

      '[data-ae-rag-widget] .ae-rag-messages::-webkit-scrollbar{width:8px;background:transparent;}',
      '[data-ae-rag-widget] .ae-rag-messages::-webkit-scrollbar-track{background:transparent;}',
      '[data-ae-rag-widget] .ae-rag-messages::-webkit-scrollbar-thumb{background:color-mix(in srgb,' + PRIMARY + ' 45%, #94a3b8);border-radius:6px;}',
      '[data-ae-rag-widget] .ae-rag-messages{scrollbar-color:color-mix(in srgb,' + PRIMARY + ' 45%, #94a3b8) transparent;}',

      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-header{background:transparent;color:#e2e8f0;border-bottom:1px solid rgba(148,163,184,0.22);background-image:radial-gradient(rgba(148,163,184,0.06) 1px,transparent 1px);background-size:14px 14px;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-msg-bot,'
        + '[data-ae-rag-widget][data-theme="dark"] .ae-rag-greeting{color:#e2e8f0!important;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-wrap{border:none;background:transparent;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-title{color:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-input{border-color:#334155;background:#0f172a;color:#e2e8f0;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-input:focus{border-color:' + PRIMARY + ';}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-error{color:#fca5a5;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-geo-status{color:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-skip-geo{color:color-mix(in srgb,' + PRIMARY + ' 85%, #e2e8f0);}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-saving-overlay{background:transparent;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-saving-inner{color:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-contact-saving-icon{color:' + PRIMARY + ';}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-msg-user{background:color-mix(in srgb,' + PRIMARY + ' 34%, #0f172a)!important;color:#e2e8f0!important;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-chip{border-color:rgba(255,255,255,0.25);color:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-chip:hover{background:#334155;color:#e2e8f0;border-color:#334155;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-card-link:hover .ae-rag-card{border-color:color-mix(in srgb,' + PRIMARY + ' 50%, #334155);box-shadow:0 2px 8px rgba(0,0,0,.25);}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-card{background:#1e293b;border-color:#334155;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-card-title{color:#e2e8f0;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-card-detail{color:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-typing{color:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-center-loader{color:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-msg-bot a{color:color-mix(in srgb,' + PRIMARY + ' 70%, #e2e8f0);}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-theme-toggle:hover{background:color-mix(in srgb,' + PRIMARY + ' 18%,transparent);}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-carousel::-webkit-scrollbar-thumb{background:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-carousel{scrollbar-color:#94a3b8 transparent;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-messages::-webkit-scrollbar-thumb{background:#94a3b8;}',
      '[data-ae-rag-widget][data-theme="dark"] .ae-rag-messages{scrollbar-color:#94a3b8 transparent;}',
    ]
      .join('')
      .split(PRIMARY)
      .join(primaryCssVar);
    document.head.appendChild(st);
  }

  function getOrSet(key, factory) {
    try {
      var v = localStorage.getItem(key);
      if (v) return v;
      var n = factory();
      localStorage.setItem(key, n);
      return n;
    } catch {
      return factory();
    }
  }

  var visitorId = getOrSet(LS_VISITOR, uuid);
  var sessionId = getOrSet(LS_SESSION, uuid);
  var storedAgent = null;
  try {
    storedAgent = localStorage.getItem(LS_AGENT);
  } catch (e) {
    /* ignore */
  }
  if (storedAgent !== PROJECT_AGENT_ID) {
    try {
      localStorage.setItem(LS_AGENT, PROJECT_AGENT_ID);
      localStorage.removeItem(LS_CONV);
    } catch (e) {
      /* ignore */
    }
  }

  var conversationId = null;
  try {
    conversationId = localStorage.getItem(LS_CONV);
  } catch (e) {
    /* ignore */
  }

  var projectName = AGENT_NAME_OVERRIDE || '';
  if (!projectName) {
    try { projectName = localStorage.getItem(LS_PROJECT_NAME) || ''; } catch (e) { /* ignore */ }
  } else {
    try { localStorage.setItem(LS_PROJECT_NAME, projectName); } catch (e) { /* ignore */ }
  }

  var darkMode = false;
  try { darkMode = localStorage.getItem(LS_THEME) === 'dark'; } catch (e) { /* ignore */ }

  loadFont();
  loadMarkdownLibs();
  injectWidgetStyles();

  var root = document.createElement('div');
  root.setAttribute('data-ae-rag-widget', 'true');
  root.style.cssText = [
    'position:fixed',
    'z-index:2147483646',
    'font-family:"DM Sans",system-ui,sans-serif',
    'font-size:15px',
    'line-height:1.45',
    'color:#0f172a',
    'box-sizing:border-box',
  ].join(';');
  root.style.setProperty('--ae-primary', PRIMARY);
  document.body.appendChild(root);

  var wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:10px;';

  var panel = document.createElement('div');
  panel.style.cssText = [
    'display:none',
    'flex-direction:column',
    'box-sizing:border-box',
    'width:min(92vw, 480px)',
    'height:min(82vh, 720px)',
    'max-height:min(82vh, 720px)',
    'background:#f1f5f9',
    'border-radius:16px',
    'box-shadow:0 12px 40px rgba(15,23,42,0.18)',
    'overflow:hidden',
    'border:1px solid rgba(15,23,42,0.08)',
    'transition:background .2s ease',
  ].join(';');

  var messagesEl = document.createElement('div');
  messagesEl.className = 'ae-rag-messages';
  messagesEl.style.cssText = [
    'flex:1',
    'min-height:0',
    'overflow-y:auto',
    'overflow-x:hidden',
    'padding:14px 16px',
    'background-color:#f8fafc',
    'background-image:radial-gradient(rgba(148,163,184,0.14) 1px,transparent 1px)',
    'background-size:14px 14px',
    'box-sizing:border-box',
  ].join(';');

  var form = document.createElement('form');
  form.className = 'ae-rag-input-form';
  form.style.cssText =
    'display:flex;gap:10px;align-items:center;padding:14px 16px;background:transparent;flex-shrink:0;margin:0;';

  var input = document.createElement('input');
  input.className = 'ae-rag-input-field';
  input.type = 'text';
  input.placeholder = 'Type your question…';
  input.autocomplete = 'off';
  input.style.cssText = [
    'flex:1',
    'border:none',
    'border-radius:10px',
    'height:44px!important',
    'min-height:44px!important',
    'padding:11px 14px!important',
    'outline:none',
    'line-height:1.45!important',
    'box-sizing:border-box!important',
    'font:inherit',
    'font-size:15px!important',
    'background:transparent',
    'color:#0f172a',
  ].join(';');

  var sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.className = 'ae-rag-send-btn';
  sendBtn.setAttribute('aria-label', 'Send message');
  sendBtn.style.cssText = [
    'flex-shrink:0',
    'width:44px',
    'height:44px',
    'border:none',
    'border-radius:12px',
    'cursor:pointer',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
  ].join(';');
  sendBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';

  var header = document.createElement('div');
  header.className = 'ae-rag-header';
  var headerTitle = document.createElement('div');
  headerTitle.className = 'ae-rag-header-title';
  headerTitle.textContent = projectName || 'Chat';
  var themeToggle = document.createElement('button');
  themeToggle.type = 'button';
  themeToggle.className = 'ae-rag-theme-toggle';
  themeToggle.setAttribute('aria-label', 'Toggle dark mode');
  var SUN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  var MOON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

  function applyTheme() {
    root.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    themeToggle.innerHTML = darkMode ? SUN_SVG : MOON_SVG;
    panel.style.background = darkMode ? '#0f172a' : '#f1f5f9';
    messagesEl.style.backgroundColor = darkMode ? '#0f172a' : '#f8fafc';
    messagesEl.style.backgroundImage = darkMode
      ? 'radial-gradient(rgba(148,163,184,0.06) 1px,transparent 1px)'
      : 'radial-gradient(rgba(148,163,184,0.14) 1px,transparent 1px)';
    input.style.color = darkMode ? '#e2e8f0' : '#0f172a';
  }

  themeToggle.addEventListener('click', function () {
    darkMode = !darkMode;
    try { localStorage.setItem(LS_THEME, darkMode ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    applyTheme();
  });

  header.appendChild(headerTitle);
  header.appendChild(themeToggle);

  form.appendChild(input);
  form.appendChild(sendBtn);
  panel.appendChild(header);
  panel.appendChild(messagesEl);
  panel.appendChild(form);

  applyTheme();
  syncChatGateUiState();

  var launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open chat');
  launcher.style.cssText = [
    'width:56px',
    'height:56px',
    'border-radius:50%',
    'border:none',
    'cursor:pointer',
    'box-shadow:0 8px 24px rgba(6,95,70,0.35)',
    'background:' + PRIMARY,
    'color:#fff',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
  ].join(';');
  function launcherLucideSvg(iconKey) {
    if (iconKey === 'message-circle') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
    }
    if (iconKey === 'bot') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>';
    }
    if (iconKey === 'sparkles') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z"/><path d="M5 3v2"/><path d="M19 19v2"/><path d="M3 5h2"/><path d="M19 19h2"/></svg>';
    }
    if (iconKey === 'circle-help') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4"/><path d="M12 17h.01"/></svg>';
    }
    if (iconKey === 'message-square') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
    if (iconKey === 'send') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
    }
    if (iconKey === 'headset') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 18 0"/><path d="M4 13v5a2 2 0 0 0 2 2h2v-7H6a2 2 0 0 0-2 2z"/><path d="M20 13a2 2 0 0 0-2-2h-2v7h2a2 2 0 0 0 2-2z"/></svg>';
    }
    if (iconKey === 'life-buoy') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>';
    }
    if (iconKey === 'badge-help') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 0 2.74 0 4 4 0 0 1 4.78 4.77 4 4 0 0 0 .86 2.75 4 4 0 0 1 0 5.26 4 4 0 0 0-.86 2.75 4 4 0 0 1-4.78 4.77 4 4 0 0 0-2.74 0 4 4 0 0 1-4.78-4.77 4 4 0 0 0-.86-2.75 4 4 0 0 1 0-5.26 4 4 0 0 0 .86-2.75"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4"/><path d="M12 17h.01"/></svg>';
    }
    if (iconKey === 'info') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
    }
    if (iconKey === 'mail') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
    }
    if (iconKey === 'phone') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.08 4.18 2 2 0 0 1 5.06 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.61a2 2 0 0 1-.45 2.11L9 9.8a16 16 0 0 0 5.2 5.2l1.36-1.22a2 2 0 0 1 2.11-.45c.83.29 1.71.5 2.61.62A2 2 0 0 1 22 16.92z"/></svg>';
    }
    if (iconKey === 'megaphone') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 14-5v12L3 13v-2z"/><path d="M11 19a3 3 0 0 1-6 0v-2"/><path d="M21 9v6"/></svg>';
    }
    if (iconKey === 'bell') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/></svg>';
    }
    if (iconKey === 'rocket') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 4.5-2 4.5s3.24-.5 4.5-2l1.5-1.5-3-3-1.5 1.5z"/><path d="M14 10 20 4"/><path d="M9 15 4 20"/><path d="M15 3s3 0 5 2 2 5 2 5-3 0-5-2-2-5-2-5z"/><path d="M9 9 3 3"/><path d="M10.5 13.5 6 18"/></svg>';
    }
    if (iconKey === 'shield-check') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3 8 3z"/><path d="m9 12 2 2 4-4"/></svg>';
    }
    if (iconKey === 'user') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>';
    }
    if (iconKey === 'at-sign') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a2 2 0 1 0 4 0v-1a8 8 0 1 0-2.34 5.66"/></svg>';
    }
    if (iconKey === 'book-open') {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6a2 2 0 0 1 2-2h6a4 4 0 0 1 4 4v12a4 4 0 0 0-4-4H4a2 2 0 0 1-2-2z"/><path d="M22 6a2 2 0 0 0-2-2h-6a4 4 0 0 0-4 4v12a4 4 0 0 1 4-4h6a2 2 0 0 0 2-2z"/></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
  }

  function applyLauncherIcon(iconCfg) {
    var cfg = iconCfg || {};
    var mode = String(cfg.mode || '').toLowerCase();
    if (mode === 'custom_url') {
      var iconUrl = String(cfg.customIconUrl || '').trim();
      if (iconUrl) {
        launcher.innerHTML = '';
        var img = document.createElement('img');
        img.src = iconUrl;
        img.alt = 'Open chat';
        img.width = 24;
        img.height = 24;
        img.style.width = '24px';
        img.style.height = '24px';
        img.style.objectFit = 'contain';
        img.addEventListener('error', function () {
          launcher.innerHTML = launcherLucideSvg('user-round');
        });
        launcher.appendChild(img);
        return;
      }
    }
    var lucideIcon = String(cfg.lucideIcon || 'user-round').toLowerCase();
    launcher.innerHTML = launcherLucideSvg(lucideIcon);
  }

  applyLauncherIcon({
    mode: 'lucide',
    lucideIcon: 'user-round',
    customIconUrl: null,
  });

  wrap.appendChild(panel);
  wrap.appendChild(launcher);
  root.appendChild(wrap);

  function setPrimaryColor(nextColor) {
    var normalized = normalizePrimaryColor(nextColor);
    if (!normalized) return;
    PRIMARY = normalized;
    root.style.setProperty('--ae-primary', normalized);
    launcher.style.background = normalized;
    launcher.style.boxShadow = '0 8px 24px color-mix(in srgb,' + normalized + ' 35%, transparent)';
  }

  // Keep launcher visual aligned with primary color even before API config arrives.
  setPrimaryColor(PRIMARY);

  function loadWidgetLauncherIconConfig() {
    var authHeaders = buildAuthHeaders();
    var requestHeaders = {
      'content-type': 'application/json',
    };
    if (authHeaders['x-api-key']) requestHeaders['x-api-key'] = authHeaders['x-api-key'];
    if (authHeaders['x-ae-preview-token']) requestHeaders['x-ae-preview-token'] = authHeaders['x-ae-preview-token'];
    fetch(WIDGET_CONFIG_URL, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        projectAgentId: PROJECT_AGENT_ID,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (!r.ok || !r.data || r.data.ok === false) return;
        var iconCfg = r.data.launcherIcon || null;
        if (iconCfg && typeof iconCfg === 'object') {
          applyLauncherIcon(iconCfg);
        }
        if (r.data.greeting) setGreeting(r.data.greeting);
        if (r.data.widgetThemeColor) setPrimaryColor(r.data.widgetThemeColor);
        if (r.data.agentName) setProjectName(r.data.agentName);
        requiredContactFields = normalizeRequiredContactFields(r.data.requiredContactFields);
        if (requiredContactFields.length === 0) {
          contactState.submitted = true;
        } else {
          var requiredSatisfied = true;
          for (var i = 0; i < requiredContactFields.length; i++) {
            var key = requiredContactFields[i];
            if (key === 'location') {
              if (!contactState.locationCaptured) {
                requiredSatisfied = false;
              }
              continue;
            }
            var val = String(contactState[key] || '').trim();
            if (!val) {
              requiredSatisfied = false;
              break;
            }
            if (key === 'email' && !EMAIL_RE.test(val)) {
              requiredSatisfied = false;
              break;
            }
            if (key === 'phone' && !PHONE_RE.test(val)) {
              requiredSatisfied = false;
              break;
            }
          }
          contactState.submitted = requiredSatisfied;
        }
        persistContactState();
        renderContactCaptureForm();
        syncChatGateUiState();
      })
      .catch(function () {
        /* ignore and keep default icon */
      });
  }

  loadWidgetLauncherIconConfig();

  function setProjectName(name) {
    if (!name || name === projectName) return;
    projectName = name;
    headerTitle.textContent = name;
    try { localStorage.setItem(LS_PROJECT_NAME, name); } catch (e) { /* ignore */ }
  }

  function setGreeting(text) {
    if (!text || text === GREETING) return;
    GREETING = text;
    try { localStorage.setItem(LS_GREETING, text); } catch (e) { /* ignore */ }
    if (greetingEl) setBotBubbleContent(greetingEl, GREETING);
  }

  function enforceRollingWindow() {
    var items = messagesEl.querySelectorAll('.ae-rag-msg-user,.ae-rag-msg-bot:not(.ae-rag-greeting)');
    while (items.length > MAX_VISIBLE_MESSAGES) {
      var oldest = items[0];
      var prev = oldest.previousElementSibling;
      var next = oldest.nextElementSibling;
      if (prev && (prev.classList.contains('ae-rag-carousel-wrap') || prev.classList.contains('ae-rag-suggestions'))) {
        prev.parentNode.removeChild(prev);
      }
      if (next && (next.classList.contains('ae-rag-carousel-wrap') || next.classList.contains('ae-rag-suggestions'))) {
        next.parentNode.removeChild(next);
      }
      oldest.parentNode.removeChild(oldest);
      items = messagesEl.querySelectorAll('.ae-rag-msg-user,.ae-rag-msg-bot:not(.ae-rag-greeting)');
    }
  }

  var GREETING_SUGGESTIONS = [
    'What services do you offer?',
    'How can I contact you?',
    'Show me popular listings',
  ];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_RE = /^[+\d\s().-]{7,20}$/;
  var CONTACT_FIELDS = ['name', 'email', 'phone', 'location'];

  var greetingEl = null;
  var contactWrapEl = null;
  var contactErrorEl = null;
  var contactSavingOverlayEl = null;
  var centerHistoryLoaderEl = null;
  var greetingSuggShown = false;
  var historyLoaded = false;
  var historyLoadPending = false;
  var messagesLayoutMode = 'normal';
  var requiredContactFields = [];
  var contactSubmitting = false;
  var contactState = { name: '', email: '', phone: '', submitted: false, locationCaptured: false };

  try {
    var savedContactRaw = localStorage.getItem(LS_CONTACT_CAPTURE);
    if (savedContactRaw) {
      var savedContact = JSON.parse(savedContactRaw);
      if (savedContact && typeof savedContact === 'object') {
        contactState.name = String(savedContact.name || '').trim();
        contactState.email = String(savedContact.email || '').trim();
        contactState.phone = String(savedContact.phone || '').trim();
        contactState.submitted = Boolean(savedContact.submitted);
        contactState.locationCaptured = Boolean(savedContact.locationCaptured);
      }
    }
  } catch (e) {
    /* ignore */
  }

  function normalizeRequiredContactFields(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var key = String(raw[i] || '').trim().toLowerCase();
      if (CONTACT_FIELDS.indexOf(key) === -1) continue;
      if (out.indexOf(key) !== -1) continue;
      out.push(key);
    }
    return out;
  }

  function isContactGateEnabled() {
    return Array.isArray(requiredContactFields)
      && requiredContactFields.length > 0
      && contactState
      && !contactState.submitted;
  }

  function validateContactState() {
    var errors = [];
    if (requiredContactFields.indexOf('name') !== -1) {
      if (!contactState.name || contactState.name.length < 2) {
        errors.push('Please enter your name.');
      }
    }
    if (requiredContactFields.indexOf('email') !== -1) {
      if (!EMAIL_RE.test(contactState.email)) {
        errors.push('Please enter a valid email address.');
      }
    }
    if (requiredContactFields.indexOf('phone') !== -1) {
      if (!PHONE_RE.test(contactState.phone)) {
        errors.push('Please enter a valid phone number.');
      }
    }
    return errors;
  }

  function parseBrowserName() {
    var ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    if (!ua) return 'unknown';
    if (ua.indexOf('Edg/') !== -1) return 'Edge';
    if (ua.indexOf('OPR/') !== -1 || ua.indexOf('Opera') !== -1) return 'Opera';
    if (ua.indexOf('Firefox/') !== -1) return 'Firefox';
    if (ua.indexOf('Chrome/') !== -1 && ua.indexOf('Safari/') !== -1) return 'Chrome';
    if (ua.indexOf('Safari/') !== -1) return 'Safari';
    return 'unknown';
  }

  function parseOsName() {
    var ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    if (!ua) return 'unknown';
    if (ua.indexOf('Windows NT') !== -1) return 'Windows';
    if (ua.indexOf('Mac OS X') !== -1) return 'macOS';
    if (ua.indexOf('Android') !== -1) return 'Android';
    if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) return 'iOS';
    if (ua.indexOf('Linux') !== -1) return 'Linux';
    return 'unknown';
  }

  function getGeolocationBlockReason() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return 'Geolocation is not supported in this browser.';
    }
    if (typeof isSecureContext !== 'undefined' && !isSecureContext) {
      return 'Location requires a secure page (HTTPS). Use HTTPS for this site, then try again.';
    }
    return null;
  }

  function formatGeoFailureMessage(errorCode) {
    var base;
    if (errorCode === 1) {
      base =
        'Location was blocked or denied. Use the lock or site-settings icon in the address bar to allow location for this site, then try again.';
    } else if (errorCode === 3) {
      base = 'Getting your location timed out. Check your connection and try again.';
    } else if (errorCode === 2) {
      base = 'Location is temporarily unavailable. Try again in a moment.';
    } else if (errorCode === -1) {
      base = 'Geolocation is not available in this browser.';
    } else {
      base =
        'Could not read your location. Allow location when your browser asks, or enable it in site settings.';
    }
    try {
      if (window.self !== window.top) {
        base +=
          ' If you never saw a prompt, the page may need to embed this widget with allow="geolocation" on the iframe.';
      }
    } catch (e) {
      /* ignore */
    }
    return base;
  }

  /**
   * Browser geolocation only — no parallel timer (avoids racing the permission dialog).
   * maximumAge 0 helps trigger a fresh permission flow when appropriate.
   */
  function getGeoPositionWithError(timeoutMs) {
    var t = timeoutMs != null ? timeoutMs : 60000;
    return new Promise(function (resolve) {
      if (!navigator || !navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
        resolve({ coords: null, errorCode: -1 });
        return;
      }
      var settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        resolve(result);
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (!pos || !pos.coords) {
            finish({ coords: null, errorCode: 2 });
            return;
          }
          finish({
            coords: {
              latitude: Number(pos.coords.latitude),
              longitude: Number(pos.coords.longitude),
            },
            errorCode: null,
          });
        },
        function (err) {
          var code = err && typeof err.code === 'number' ? err.code : 0;
          finish({ coords: null, errorCode: code });
        },
        { enableHighAccuracy: false, timeout: t, maximumAge: 0 },
      );
    });
  }

  function getGeoPosition(timeoutMs) {
    return getGeoPositionWithError(timeoutMs).then(function (r) {
      return r.coords;
    });
  }

  /**
   * Shows "Waiting for location permission…" and optional Skip. Resolves with coords or null.
   * First resolution wins (skip vs geolocation result).
   */
  function waitForGeoOrSkip() {
    return new Promise(function (resolve) {
      var settled = false;
      function done(val) {
        if (settled) return;
        settled = true;
        if (contactErrorEl) contactErrorEl.textContent = '';
        resolve(val);
      }
      if (!contactErrorEl) {
        getGeoPosition(60000).then(done);
        return;
      }
      contactErrorEl.textContent = '';
      var wrap = document.createElement('div');
      wrap.className = 'ae-rag-contact-geo-wait';
      var status = document.createElement('p');
      status.className = 'ae-rag-contact-geo-status';
      status.textContent = 'Waiting for location permission…';
      var skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.className = 'ae-rag-contact-skip-geo';
      skipBtn.textContent = 'Skip location';
      skipBtn.addEventListener('click', function () {
        done(null);
      });
      wrap.appendChild(status);
      wrap.appendChild(skipBtn);
      contactErrorEl.appendChild(wrap);
      getGeoPosition(60000).then(done);
    });
  }

  function syncChatGateUiState() {
    if (historyLoadPending) return;
    var blocked = isContactGateEnabled();
    input.disabled = blocked || contactSubmitting || busy;
    sendBtn.disabled = contactSubmitting || busy;
    sendBtn.style.opacity = (contactSubmitting || busy) ? '0.6' : '1';
    sendBtn.setAttribute('aria-label', blocked ? 'Submit contact details' : 'Send message');
    if (blocked) {
      input.placeholder = 'Submit contact details to start chatting';
    } else {
      input.placeholder = 'Type your question…';
    }
  }

  function persistContactState() {
    try {
      localStorage.setItem(
        LS_CONTACT_CAPTURE,
        JSON.stringify({
          name: contactState.name,
          email: contactState.email,
          phone: contactState.phone,
          submitted: contactState.submitted,
          locationCaptured: contactState.locationCaptured,
        }),
      );
    } catch (e) {
      /* ignore */
    }
  }

  function ensureGreeting() {
    if (greetingEl) return;
    greetingEl = document.createElement('div');
    greetingEl.className = 'ae-rag-msg-bot ae-rag-greeting';
    setBotBubbleContent(greetingEl, GREETING);
    messagesEl.insertBefore(greetingEl, messagesEl.firstChild);
    syncGreetingVisibility();
  }

  function syncGreetingVisibility() {
    if (!greetingEl) return;
    greetingEl.style.display = isContactGateEnabled() ? 'none' : '';
  }

  function removeContactSavingOverlay() {
    if (contactSavingOverlayEl && contactSavingOverlayEl.parentNode) {
      contactSavingOverlayEl.parentNode.removeChild(contactSavingOverlayEl);
    }
    contactSavingOverlayEl = null;
  }

  function showContactSavingOverlay() {
    removeContactSavingOverlay();
    panel.style.position = 'relative';
    var ov = document.createElement('div');
    ov.className = 'ae-rag-contact-saving-overlay';
    ov.setAttribute('role', 'status');
    ov.setAttribute('aria-live', 'polite');
    ov.setAttribute('aria-label', 'Saving contact details');
    var inner = document.createElement('div');
    inner.className = 'ae-rag-contact-saving-inner';
    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'ae-rag-contact-saving-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '28');
    icon.setAttribute('height', '28');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
      '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>';
    var txt = document.createElement('p');
    txt.className = 'ae-rag-contact-saving-text';
    txt.textContent = 'Please wait';
    inner.appendChild(icon);
    inner.appendChild(txt);
    ov.appendChild(inner);
    panel.appendChild(ov);
    contactSavingOverlayEl = ov;
  }

  function removeContactCaptureForm() {
    removeContactSavingOverlay();
    if (contactWrapEl && contactWrapEl.parentNode) {
      contactWrapEl.parentNode.removeChild(contactWrapEl);
    }
    contactWrapEl = null;
    contactErrorEl = null;
    syncGreetingVisibility();
  }

  function renderContactCaptureForm() {
    removeContactCaptureForm();
    if (!isContactGateEnabled()) {
      syncGreetingVisibility();
      syncChatGateUiState();
      return;
    }
    syncGreetingVisibility();
    removeOldSuggestions();

    contactWrapEl = document.createElement('div');
    contactWrapEl.className = 'ae-rag-contact-wrap';

    var title = document.createElement('p');
    title.className = 'ae-rag-contact-title';
    title.textContent = 'Before we start, please share:';
    contactWrapEl.appendChild(title);

    var grid = document.createElement('div');
    grid.className = 'ae-rag-contact-grid';

    function addContactInput(fieldKey, label, type, placeholder) {
      if (requiredContactFields.indexOf(fieldKey) === -1) return;
      var inp = document.createElement('input');
      inp.className = 'ae-rag-contact-input';
      inp.type = type;
      inp.placeholder = placeholder;
      inp.autocomplete = fieldKey;
      inp.value = String(contactState[fieldKey] || '');
      inp.addEventListener('input', function () {
        contactState[fieldKey] = String(inp.value || '').trim();
        if (contactErrorEl) contactErrorEl.textContent = '';
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!isContactGateEnabled() || contactSubmitting) return;
        void submitContactDetails();
      });
      inp.setAttribute('aria-label', label);
      grid.appendChild(inp);
    }

    addContactInput('name', 'Name', 'text', 'Your name');
    addContactInput('email', 'Email', 'email', 'Your email');
    addContactInput('phone', 'Phone number', 'tel', 'Your phone number');

    contactWrapEl.appendChild(grid);

    contactErrorEl = document.createElement('div');
    contactErrorEl.className = 'ae-rag-contact-error';
    contactErrorEl.setAttribute('aria-live', 'polite');
    contactWrapEl.appendChild(contactErrorEl);

    if (greetingEl && greetingEl.parentNode) {
      if (greetingEl.nextSibling) {
        messagesEl.insertBefore(contactWrapEl, greetingEl.nextSibling);
      } else {
        messagesEl.appendChild(contactWrapEl);
      }
    } else {
      messagesEl.insertBefore(contactWrapEl, messagesEl.firstChild);
    }

    syncChatGateUiState();
  }

  async function submitContactDetails() {
    if (!isContactGateEnabled() || contactSubmitting) return;
    var errs = validateContactState();
    if (errs.length > 0) {
      if (contactErrorEl) contactErrorEl.textContent = errs[0];
      return;
    }

    contactSubmitting = true;
    syncChatGateUiState();

    var needLocation = requiredContactFields.indexOf('location') !== -1;
    var geo = null;

    if (needLocation) {
      var blockReason = getGeolocationBlockReason();
      if (blockReason) {
        if (contactErrorEl) contactErrorEl.textContent = blockReason;
        contactSubmitting = false;
        syncChatGateUiState();
        return;
      }
      if (contactErrorEl) {
        contactErrorEl.textContent = '';
        var geoWait = document.createElement('div');
        geoWait.className = 'ae-rag-contact-geo-wait';
        var geoStatus = document.createElement('p');
        geoStatus.className = 'ae-rag-contact-geo-status';
        geoStatus.textContent = 'Waiting for location permission\u2026';
        geoWait.appendChild(geoStatus);
        contactErrorEl.appendChild(geoWait);
      }
      var geoResult = await getGeoPositionWithError(60000);
      if (contactErrorEl) contactErrorEl.textContent = '';
      geo = geoResult.coords || null;
    }

    var locationPayload = null;
    if (needLocation) {
      locationPayload = geo
        ? { latitude: geo.latitude, longitude: geo.longitude }
        : { latitude: 'blocked', longitude: 'blocked' };
    }

    var metadata = {
      source: 'rag_widget_contact_form',
      browser_name: parseBrowserName(),
      operating_system_name: parseOsName(),
      location_permission_requested: needLocation,
      location: locationPayload,
    };

    showContactSavingOverlay();

    var authHeaders = buildAuthHeaders();
    var requestHeaders = {
      'content-type': 'application/json',
    };
    if (authHeaders['x-api-key']) requestHeaders['x-api-key'] = authHeaders['x-api-key'];
    if (authHeaders['x-ae-preview-token']) requestHeaders['x-ae-preview-token'] = authHeaders['x-ae-preview-token'];
    fetch(CONTACT_URL, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        projectAgentId: PROJECT_AGENT_ID,
        visitorId: visitorId,
        contact: {
          name: contactState.name || null,
          email: contactState.email || null,
          phone: contactState.phone || null,
        },
        metadata: metadata,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (!r.ok || !r.data || r.data.ok === false) {
          if (contactErrorEl) {
            contactErrorEl.textContent =
              (r.data && r.data.message) || 'Could not save details. Please try again.';
          }
          return;
        }
        contactState.submitted = true;
        contactState.locationCaptured = true;
        persistContactState();
        removeContactCaptureForm();
        // Gate is now cleared — load conversation history that was deferred.
        if (conversationId && !historyLoaded) {
          loadConversationHistory(function (hasHistory) {
            ensureGreeting();
            if (!hasHistory) showGreetingSuggestions();
            setTimeout(scrollToBottom, 80);
          });
        } else {
          ensureGreeting();
          showGreetingSuggestions();
          setTimeout(scrollToBottom, 80);
        }
      })
      .catch(function () {
        if (contactErrorEl) {
          contactErrorEl.textContent = 'Network issue while saving details.';
        }
      })
      .finally(function () {
        removeContactSavingOverlay();
        contactSubmitting = false;
        syncChatGateUiState();
      });
  }

  function showGreetingSuggestions() {
    if (isContactGateEnabled()) {
      removeOldSuggestions();
      return;
    }
    if (greetingSuggShown) return;
    greetingSuggShown = true;
    renderSuggestions(GREETING_SUGGESTIONS);
  }

  function ensureCenterHistoryLoader() {
    if (centerHistoryLoaderEl) return;
    centerHistoryLoaderEl = document.createElement('div');
    centerHistoryLoaderEl.className = 'ae-rag-center-loader';
    centerHistoryLoaderEl.setAttribute('role', 'status');
    centerHistoryLoaderEl.setAttribute('aria-live', 'polite');
    centerHistoryLoaderEl.setAttribute('aria-label', 'Loading conversation history');
    centerHistoryLoaderEl.innerHTML =
      '<svg class="ae-rag-center-loader-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>' +
      '<span>Loading</span>';
  }

  function setMessagesLayout(mode) {
    if (messagesLayoutMode === mode) return;
    messagesLayoutMode = mode;
    if (mode === 'loading') {
      messagesEl.style.display = 'flex';
      messagesEl.style.flexDirection = 'column';
    } else {
      messagesEl.style.display = 'block';
      messagesEl.style.flexDirection = '';
    }
  }

  function showCenterHistoryLoader() {
    ensureCenterHistoryLoader();
    if (!centerHistoryLoaderEl) return;
    setMessagesLayout('loading');
    if (!centerHistoryLoaderEl.parentNode) messagesEl.appendChild(centerHistoryLoaderEl);
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.6';
  }

  function hideCenterHistoryLoader() {
    if (centerHistoryLoaderEl && centerHistoryLoaderEl.parentNode) {
      centerHistoryLoaderEl.parentNode.removeChild(centerHistoryLoaderEl);
    }
    setMessagesLayout('normal');
    syncChatGateUiState();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function loadConversationHistory(cb) {
    if (historyLoaded || !conversationId) { if (cb) cb(false); return; }
    historyLoaded = true;
    historyLoadPending = true;
    showCenterHistoryLoader();
    var authHeaders = buildAuthHeaders();
    var requestHeaders = {
      'content-type': 'application/json',
    };
    if (authHeaders['x-api-key']) requestHeaders['x-api-key'] = authHeaders['x-api-key'];
    if (authHeaders['x-ae-preview-token']) requestHeaders['x-ae-preview-token'] = authHeaders['x-ae-preview-token'];
    fetch(HISTORY_URL, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        conversationId: conversationId,
        visitorId: visitorId,
        projectAgentId: PROJECT_AGENT_ID,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        historyLoadPending = false;
        hideCenterHistoryLoader();
        if (data && data.projectName) setProjectName(data.projectName);
        if (data && data.greeting) setGreeting(data.greeting);
        if (!data || !data.ok || !data.messages || !data.messages.length) {
          if (cb) cb(false);
          return;
        }
        removeOldSuggestions();
        var msgs = data.messages;
        var lastAgentIdx = -1;
        for (var k = msgs.length - 1; k >= 0; k--) {
          if (msgs[k].role === 'agent') { lastAgentIdx = k; break; }
        }
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          if (m.role === 'visitor') {
            addBubble(m.content, 'user');
          } else if (m.role === 'agent') {
            var agentReply = String(m.content || '').trim();
            var hasCards = m.cards && m.cards.length >= 2;
            if (agentReply) {
              addBubble(agentReply, 'bot');
            }
            if (hasCards) {
              renderCarousel(m.cards);
            }
            if (i === lastAgentIdx && m.suggestions && m.suggestions.length) {
              renderSuggestions(m.suggestions);
            }
          }
        }
        setTimeout(scrollToBottom, 60);
        if (cb) cb(true);
      })
      .catch(function () {
        historyLoadPending = false;
        hideCenterHistoryLoader();
        if (cb) cb(false);
      });
  }

  var open = false;
  function setOpen(v) {
    open = v;
    panel.style.display = v ? 'flex' : 'none';
    if (!v) return;
    // While the contact gate is active do NOT load conversation history —
    // history messages must not be visible until the visitor submits their details.
    if (isContactGateEnabled()) {
      ensureGreeting();
      renderContactCaptureForm();
      return;
    }
    if (conversationId && !historyLoaded) {
      loadConversationHistory(function (hasHistory) {
        ensureGreeting();
        renderContactCaptureForm();
        if (!hasHistory) showGreetingSuggestions();
        setTimeout(scrollToBottom, 80);
      });
    } else if (!historyLoaded) {
      ensureGreeting();
      renderContactCaptureForm();
      showGreetingSuggestions();
    } else {
      ensureGreeting();
      renderContactCaptureForm();
    }
  }
  launcher.addEventListener('click', function () {
    setOpen(!open);
  });

  document.addEventListener('mousedown', function (event) {
    if (!open) return;
    var target = event.target;
    if (!target) return;
    if (panel.contains(target) || launcher.contains(target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (!open) return;
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });

  function renderBotHtml(text) {
    var M = window.marked;
    var P = window.DOMPurify;
    if (!M || !P) return null;
    var raw =
      typeof M.parse === 'function'
        ? M.parse(text, { breaks: true, gfm: true })
        : String(text);
    return P.sanitize(raw, { USE_PROFILES: { html: true } });
  }

  function setBotBubbleContent(el, text) {
    var html = renderBotHtml(text);
    if (html) {
      el.innerHTML = html;
      return;
    }
    el.textContent = text;
    if (!mdLibs._ready) {
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        var h = renderBotHtml(text);
        if (h) {
          el.innerHTML = h;
          clearInterval(timer);
        } else if (mdLibs._ready || tries >= 40) {
          clearInterval(timer);
        }
      }, 100);
    }
  }

  // Pre-TTFT status copy: generic (no backend hints). `durationMs` is total
  // time per line (typing + dot reveal + hold) before the next status.
  var PRE_TTFT_STEPS = [
    { text: 'Thinking', durationMs: 2000 },
    { text: 'Understanding your question', durationMs: 3000 },
    { text: 'Preparing your answer', durationMs: 3000 },
    { text: 'Almost there', durationMs: 3000 },
  ];
  // Wrap-up phase (after reply text finished; before `done`).
  var WRAP_UP_STEPS = [
    { text: 'Wrapping up', durationMs: 2000 },
    { text: 'Almost there', durationMs: 2500 },
    { text: 'Just a moment', durationMs: 2500 },
  ];

  var STATUS_CHAR_MS_MIN = 28;
  var STATUS_CHAR_MS_MAX = 52;
  var STATUS_DOT_STAGGER_MS = 72;

  function normalizeStatusSteps(raw) {
    if (!raw || !raw.length) {
      return [{ text: 'Thinking', durationMs: 2000 }];
    }
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      if (typeof item === 'string') {
        out.push({ text: item, durationMs: 2000 });
      } else if (item && typeof item.text === 'string') {
        var d = Number(item.durationMs);
        out.push({ text: item.text, durationMs: d > 0 ? d : 2000 });
      }
    }
    return out.length ? out : [{ text: 'Thinking', durationMs: 2000 }];
  }

  function computeStatusCharDelay(textLen, durationMs) {
    var dotsMs = STATUS_DOT_STAGGER_MS * 3 + 100;
    var reserveHold = 120;
    var typingBudget = durationMs - dotsMs - reserveHold;
    if (typingBudget < 280) typingBudget = Math.min(280, durationMs * 0.45);
    var denom = Math.max(textLen, 1);
    var ms = Math.floor(typingBudget / denom);
    if (ms < STATUS_CHAR_MS_MIN) return STATUS_CHAR_MS_MIN;
    if (ms > STATUS_CHAR_MS_MAX) return STATUS_CHAR_MS_MAX;
    return ms;
  }

  /**
   * Status row: types each phrase like a chat line, then reveals the three
   * bouncing dots in sequence. Each step has its own durationMs (total time
   * before advancing). Returns `setSteps` / `remove` for pre-TTFT ↔ wrap-up.
   */
  function createStatusIndicator(initialSteps, ariaLabel) {
    var steps = normalizeStatusSteps(initialSteps);
    var el = document.createElement('div');
    el.className = 'ae-rag-typing';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', ariaLabel || 'Assistant is working');

    var labelEl = document.createElement('span');
    labelEl.className = 'ae-rag-typing-text';

    var dots = document.createElement('span');
    dots.className = 'ae-rag-typing-dots';
    dots.style.opacity = '0';
    var dotSpans = [];
    for (var d = 0; d < 3; d++) {
      var ds = document.createElement('span');
      ds.style.opacity = '0';
      dots.appendChild(ds);
      dotSpans.push(ds);
    }

    el.appendChild(labelEl);
    el.appendChild(dots);

    var timers = [];
    var cancelled = false;
    var stepIndex = 0;

    function clearTimers() {
      for (var i = 0; i < timers.length; i++) {
        clearTimeout(timers[i]);
      }
      timers = [];
    }

    function schedule(fn, ms) {
      var id = setTimeout(function () {
        timers = timers.filter(function (t) { return t !== id; });
        fn();
      }, ms);
      timers.push(id);
    }

    function resetDots() {
      dots.style.opacity = '0';
      for (var i = 0; i < dotSpans.length; i++) {
        dotSpans[i].style.opacity = '0';
      }
    }

    function revealDotsThen(done) {
      dots.style.opacity = '1';
      for (var i = 0; i < dotSpans.length; i++) {
        (function (ii) {
          schedule(function () {
            if (cancelled) return;
            dotSpans[ii].style.opacity = '1';
          }, ii * STATUS_DOT_STAGGER_MS);
        })(i);
      }
      var afterDots =
        STATUS_DOT_STAGGER_MS * (dotSpans.length - 1) + STATUS_DOT_STAGGER_MS + 40;
      schedule(function () {
        if (cancelled) return;
        done();
      }, afterDots);
    }

    function runStep() {
      if (cancelled || !steps.length) return;
      var step = steps[stepIndex % steps.length];
      var fullText = step.text;
      var durationMs = step.durationMs;
      var stepStarted = Date.now();
      labelEl.textContent = '';
      resetDots();

      var charDelay = computeStatusCharDelay(fullText.length, durationMs);
      var pos = 0;

      function typeNext() {
        if (cancelled) return;
        if (pos < fullText.length) {
          pos++;
          labelEl.textContent = fullText.slice(0, pos);
          schedule(typeNext, charDelay);
          return;
        }
        revealDotsThen(function () {
          if (cancelled) return;
          var elapsed = Date.now() - stepStarted;
          var wait = Math.max(0, durationMs - elapsed);
          schedule(function () {
            if (cancelled) return;
            stepIndex++;
            runStep();
          }, wait);
        });
      }

      schedule(typeNext, 0);
    }

    runStep();

    function applySteps(next) {
      steps = normalizeStatusSteps(next);
      cancelled = true;
      clearTimers();
      cancelled = false;
      stepIndex = 0;
      labelEl.textContent = '';
      resetDots();
      runStep();
    }

    return {
      el: el,
      setSteps: applySteps,
      /** Accepts strings or { text, durationMs }[] (same as setSteps). */
      setLabels: applySteps,
      remove: function () {
        cancelled = true;
        clearTimers();
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  }

  // Back-compat: anything that still calls createTypingIndicator() gets the
  // typed pre-TTFT indicator by default.
  function createTypingIndicator() {
    return createStatusIndicator(PRE_TTFT_STEPS, 'Assistant is thinking').el;
  }

  function sendQuestion(text) {
    if (busy || historyLoadPending) return;
    input.value = text;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  // Suggestion reveal cadence — tuned so three chips appear over ~0.5-0.6s,
  // giving an "agent is typing them one at a time" feel without feeling slow.
  var SUGGESTION_STAGGER_MS = 180;

  function renderSuggestions(suggestions, opts) {
    if (isContactGateEnabled()) {
      removeOldSuggestions();
      return;
    }
    if (!suggestions || !suggestions.length) return;
    var stagger = !(opts && opts.stagger === false);

    var wrap = document.createElement('div');
    wrap.className = 'ae-rag-suggestions';
    messagesEl.appendChild(wrap);

    function makeChip(q) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ae-rag-chip';
      chip.textContent = q;
      if (stagger) {
        chip.style.opacity = '0';
        chip.style.transform = 'translateY(4px)';
        chip.style.transition = 'opacity 180ms ease, transform 180ms ease';
      }
      chip.addEventListener('click', function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        sendQuestion(q);
      });
      return chip;
    }

    if (!stagger) {
      for (var i = 0; i < suggestions.length; i++) {
        wrap.appendChild(makeChip(suggestions[i]));
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    var idx = 0;
    function revealNext() {
      if (idx >= suggestions.length) return;
      var chip = makeChip(suggestions[idx]);
      wrap.appendChild(chip);
      // Double-RAF to guarantee the initial style is committed before the
      // transition target is applied. Without this the chip pops in without
      // animating.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          chip.style.opacity = '1';
          chip.style.transform = 'translateY(0)';
        });
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
      idx++;
      if (idx < suggestions.length) {
        setTimeout(revealNext, SUGGESTION_STAGGER_MS);
      }
    }
    revealNext();
  }

  // ------------------------------------------------------------------
  // Typewriter — drives the streamed bot reply at a steady "medium-fast"
  // tempo regardless of how the backend actually chunks tokens.
  //
  // The model streams whole sentences or multi-word bursts (Gemini batches
  // tokens aggressively), which looks like text "snapping in" line by line.
  // Buffering the deltas and pacing the render ourselves gives a natural
  // typing rhythm even when upstream chunks arrive irregularly.
  // ------------------------------------------------------------------
  function createTypewriter(el) {
    var buffer = '';
    var shown = 0;
    var timer = null;
    var waitCbs = [];
    var CHARS_PER_TICK = 4;
    var TICK_MS = 18;

    function render() {
      if (!el) return;
      el.textContent = buffer.slice(0, shown);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function tick() {
      if (shown >= buffer.length) {
        clearInterval(timer);
        timer = null;
        var pending = waitCbs.slice();
        waitCbs.length = 0;
        for (var i = 0; i < pending.length; i++) {
          try { pending[i](); } catch (e) { /* ignore */ }
        }
        return;
      }
      shown = Math.min(shown + CHARS_PER_TICK, buffer.length);
      render();
    }

    return {
      setElement: function (node) { el = node; render(); },
      append: function (text) {
        if (!text) return;
        buffer += text;
        if (!timer && el) {
          timer = setInterval(tick, TICK_MS);
        }
      },
      flushInstant: function () {
        if (timer) { clearInterval(timer); timer = null; }
        shown = buffer.length;
        render();
      },
      waitDrained: function (cb) {
        if (!cb) return;
        if (shown >= buffer.length) { cb(); return; }
        waitCbs.push(cb);
      },
      getText: function () { return buffer; },
      isDrained: function () { return shown >= buffer.length; },
    };
  }

  function renderCarousel(cards) {
    if (!cards || cards.length < 2) return;
    var outer = document.createElement('div');
    outer.className = 'ae-rag-carousel-wrap';
    var track = document.createElement('div');
    track.className = 'ae-rag-carousel';
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var card = document.createElement('div');
      card.className = 'ae-rag-card';
      if (c.image) {
        var img = document.createElement('img');
        img.className = 'ae-rag-card-img';
        img.src = c.image;
        img.alt = c.title || '';
        img.loading = 'lazy';
        img.onerror = function () {
          this.style.display = 'none';
        };
        card.appendChild(img);
      }
      var body = document.createElement('div');
      body.className = 'ae-rag-card-body';
      var normalizedTitle = String(c.title || '').replace(/\s+/g, ' ').trim();
      if (normalizedTitle) {
        var t = document.createElement('div');
        t.className = 'ae-rag-card-title';
        t.textContent = normalizedTitle;
        t.title = normalizedTitle;
        body.appendChild(t);
      }
      var details = (c.details || [])
        .map(function (line) { return String(line == null ? '' : line).replace(/\s+/g, ' ').trim(); })
        .filter(function (line) { return line.length > 0; });
      for (var d = 0; d < details.length && d < 4; d++) {
        var det = document.createElement('div');
        det.className = 'ae-rag-card-detail';
        det.textContent = details[d];
        det.title = details[d];
        body.appendChild(det);
      }
      card.appendChild(body);
      if (c.link && typeof c.link === 'string' && c.link.trim()) {
        var anchor = document.createElement('a');
        anchor.className = 'ae-rag-card-link';
        anchor.href = c.link;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.appendChild(card);
        track.appendChild(anchor);
      } else {
        track.appendChild(card);
      }
    }
    outer.appendChild(track);
    messagesEl.appendChild(outer);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addBubble(text, who) {
    var b = document.createElement('div');
    if (who === 'user') {
      b.className = 'ae-rag-msg-user';
      b.textContent = text;
    } else {
      b.className = 'ae-rag-msg-bot';
      b.style.cssText = [
        'margin-bottom:10px',
        'padding:10px 4px',
        'border-radius:12px',
        'max-width:92%',
        'white-space:normal',
        'word-break:break-word',
        'background:transparent',
        'border:none',
      ].join(';');
      setBotBubbleContent(b, text);
    }
    messagesEl.appendChild(b);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function createBotBubbleShell() {
    var b = document.createElement('div');
    b.className = 'ae-rag-msg-bot';
    b.style.cssText = [
      'margin-bottom:10px',
      'padding:10px 4px',
      'border-radius:12px',
      'max-width:92%',
      'white-space:normal',
      'word-break:break-word',
      'background:transparent',
      'border:none',
    ].join(';');
    messagesEl.appendChild(b);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return b;
  }

  async function consumeSseResponse(response, handlers) {
    if (!response.body) return;
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var eventName = 'message';
    var dataLines = [];

    function flushEvent() {
      if (!dataLines.length) return;
      var dataText = dataLines.join('\n');
      dataLines = [];
      var payload = {};
      try {
        payload = JSON.parse(dataText);
      } catch (e) {
        payload = {};
      }
      if (eventName === 'delta' && handlers && typeof handlers.onDelta === 'function') {
        handlers.onDelta(String(payload.text || ''));
      } else if (eventName === 'phase' && handlers && typeof handlers.onPhase === 'function') {
        handlers.onPhase(String(payload.name || ''));
      } else if (eventName === 'done' && handlers && typeof handlers.onDone === 'function') {
        handlers.onDone(payload);
      } else if (eventName === 'error' && handlers && typeof handlers.onError === 'function') {
        handlers.onError(String(payload.message || 'Unknown stream error'));
      }
      eventName = 'message';
    }

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      while (true) {
        var newlineIdx = buffer.indexOf('\n');
        if (newlineIdx === -1) break;
        var line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);

        if (line === '') {
          flushEvent();
          continue;
        }
        if (line.indexOf('event:') === 0) {
          eventName = line.slice(6).trim();
          continue;
        }
        if (line.indexOf('data:') === 0) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }
    flushEvent();
  }

  function removeOldSuggestions() {
    var old = messagesEl.querySelectorAll('.ae-rag-suggestions');
    for (var i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
  }

  function friendlyAuthOrConfigErrorMessage(rawMessage) {
    var msg = String(rawMessage || '').toLowerCase();
    var shouldMask =
      msg.indexOf('invalid api key') !== -1 ||
      msg.indexOf('api key expired') !== -1 ||
      msg.indexOf('missing api key') !== -1 ||
      msg.indexOf('origin does not match project domain') !== -1 ||
      msg.indexOf('project domain is not verified') !== -1 ||
      msg.indexOf('project domain is not configured') !== -1 ||
      msg.indexOf('invalid project agent') !== -1;
    if (!shouldMask) return rawMessage;
    return "We're experiencing a temporary technical issue. Please try again in a moment.";
  }

  var busy = false;
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (historyLoadPending) return;
    if (isContactGateEnabled()) {
      void submitContactDetails();
      return;
    }
    var q = (input.value || '').trim();
    if (!q || busy) return;
    busy = true;
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.6';
    removeOldSuggestions();
    addBubble(q, 'user');
    input.value = '';

    // Pre-TTFT status: cycles through generic "thinking / understanding /
    // preparing" labels so the visitor doesn't perceive the wait as a hang.
    // Replaced (or mutated) by the typewriter and later by the wrap-up
    // indicator — see phase handling in the stream branch below.
    var preStatus = createStatusIndicator(PRE_TTFT_STEPS, 'Assistant is thinking');
    messagesEl.appendChild(preStatus.el);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    var pageUrl = typeof location !== 'undefined' ? String(location.href) : '';

    (async function () {
      try {
        var authHeaders = buildAuthHeaders();
        var requestHeaders = {
          'content-type': 'application/json',
          Accept: 'text/event-stream, application/json',
        };
        if (authHeaders['x-api-key']) requestHeaders['x-api-key'] = authHeaders['x-api-key'];
        if (authHeaders['x-ae-preview-token']) requestHeaders['x-ae-preview-token'] = authHeaders['x-ae-preview-token'];
        var response = await fetch(CHAT_URL, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({
            projectAgentId: PROJECT_AGENT_ID,
            message: q,
            visitorId: visitorId,
            sessionId: sessionId,
            conversationId: conversationId,
            pageUrl: pageUrl,
            stream: true,
          }),
        });

        var contentType = String(response.headers.get('content-type') || '').toLowerCase();
        var streamReplyBubble = null;
        var typewriter = null;
        var donePayload = null;
        var streamError = '';
        var currentPhase = '';
        var wrapUpStatus = null;

        // Show the wrap-up indicator only when (a) backend signalled a post-
        // stream phase, (b) the typewriter has finished revealing the reply,
        // and (c) the final `done` has not arrived yet. Without the typewriter
        // gate the indicator would flash below a half-typed bubble.
        function maybeShowWrapUpStatus() {
          if (wrapUpStatus) return;
          if (!currentPhase) return;
          if (donePayload) return;
          if (typewriter && !typewriter.isDrained()) return;
          wrapUpStatus = createStatusIndicator(WRAP_UP_STEPS, 'Assistant is wrapping up');
          messagesEl.appendChild(wrapUpStatus.el);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        if (contentType.indexOf('text/event-stream') !== -1 && response.body) {
          await consumeSseResponse(response, {
            onDelta: function (text) {
              if (!text) return;
              preStatus.remove();
              if (!streamReplyBubble) {
                streamReplyBubble = createBotBubbleShell();
                typewriter = createTypewriter(streamReplyBubble);
              }
              typewriter.append(text);
            },
            onPhase: function (name) {
              currentPhase = String(name || '');
              if (!currentPhase) return;
              // If the reply stream never actually produced any deltas (rare
              // edge case: error/empty), swap the pre-TTFT indicator for the
              // wrap-up one immediately.
              if (!streamReplyBubble) {
                preStatus.setLabels(WRAP_UP_STEPS);
                return;
              }
              // If the typewriter already finished drawing by the time the
              // phase arrives, show the wrap-up indicator right away.
              if (typewriter) {
                typewriter.waitDrained(maybeShowWrapUpStatus);
              }
            },
            onDone: function (payload) {
              donePayload = payload || {};
            },
            onError: function (message) {
              streamError = String(message || '');
            },
          });

          preStatus.remove();
          if (wrapUpStatus) { wrapUpStatus.remove(); wrapUpStatus = null; }

          if (streamError) {
            if (typewriter) typewriter.flushInstant();
            var friendlyStreamErr = friendlyAuthOrConfigErrorMessage(streamError);
            if (friendlyStreamErr === streamError) {
              friendlyStreamErr = "We're experiencing a temporary technical issue. Please try again in a moment.";
            }
            addBubble(friendlyStreamErr, 'bot');
            return;
          }

          if (!donePayload || donePayload.ok === false) {
            if (typewriter) typewriter.flushInstant();
            var rawDoneMsg =
              (donePayload && donePayload.message) || 'Streaming response did not complete.';
            var friendlyDoneMsg = friendlyAuthOrConfigErrorMessage(rawDoneMsg);
            if (friendlyDoneMsg === rawDoneMsg) {
              friendlyDoneMsg = "We're experiencing a temporary technical issue. Please try again in a moment.";
            }
            addBubble(friendlyDoneMsg, 'bot');
            return;
          }

          if (donePayload.conversationId) {
            conversationId = donePayload.conversationId;
            try {
              localStorage.setItem(LS_CONV, conversationId);
            } catch (e) {
              /* ignore */
            }
          }
          if (donePayload.projectName) setProjectName(donePayload.projectName);
          if (donePayload.greeting) setGreeting(donePayload.greeting);

          var finalReply = String(donePayload.reply || (typewriter ? typewriter.getText() : '') || '').trim();

          // Wait for the typewriter to finish revealing the streamed chunks,
          // THEN swap the plain-text bubble for rendered markdown and fire
          // cards + staggered suggestions so the "typing finished" feel is
          // continuous.
          function finalizeReply() {
            if (streamReplyBubble) {
              if (finalReply) {
                setBotBubbleContent(streamReplyBubble, finalReply);
              } else if (streamReplyBubble.parentNode) {
                streamReplyBubble.parentNode.removeChild(streamReplyBubble);
              }
            } else if (finalReply) {
              addBubble(finalReply, 'bot');
            }

            var streamedCards = donePayload.cards && donePayload.cards.length >= 2;
            if (streamedCards) {
              renderCarousel(donePayload.cards);
            }
            if (donePayload.suggestions && donePayload.suggestions.length) {
              renderSuggestions(donePayload.suggestions);
            }
            enforceRollingWindow();
          }

          if (typewriter) {
            await new Promise(function (resolve) {
              typewriter.waitDrained(function () {
                finalizeReply();
                resolve();
              });
            });
          } else {
            finalizeReply();
          }
          return;
        }

        var jsonData = await response.json();
        var r = { ok: response.ok, data: jsonData };
        preStatus.remove();
        if (!r.ok || !r.data || r.data.ok === false) {
          var rawMsg =
            (r.data && r.data.message) || (typeof r.data === 'string' ? r.data : '');
          var friendlyMsg = friendlyAuthOrConfigErrorMessage(rawMsg);
          if (friendlyMsg === rawMsg) {
            friendlyMsg = "We're experiencing a temporary technical issue. Please try again in a moment.";
          }
          addBubble(friendlyMsg, 'bot');
          return;
        }
        if (r.data.conversationId) {
          conversationId = r.data.conversationId;
          try {
            localStorage.setItem(LS_CONV, conversationId);
          } catch (e) {
            /* ignore */
          }
        }
        if (r.data.projectName) setProjectName(r.data.projectName);
        if (r.data.greeting) setGreeting(r.data.greeting);
        var replyText = String(r.data.reply || '').trim();
        var hasCards = r.data.cards && r.data.cards.length >= 2;
        if (replyText) {
          addBubble(replyText, 'bot');
        }
        if (hasCards) {
          renderCarousel(r.data.cards);
        }
        if (r.data.suggestions && r.data.suggestions.length) {
          renderSuggestions(r.data.suggestions);
        }
        enforceRollingWindow();
      } catch (e) {
        preStatus.remove();
        if (wrapUpStatus) { wrapUpStatus.remove(); wrapUpStatus = null; }
        addBubble(
          "It looks like there's a network issue. Please check your connection and try again.",
          'bot'
        );
      } finally {
        busy = false;
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
      }
    })();
  });
})();
