/**
 * 作用：为生成的市场HTML报告提供中文、英文和双语界面切换。
 * 
 * Usage in HTML:
 *   <head>
 *     <link rel="stylesheet" href="lang-toggle.css">
 *     <script src="lang-toggle.js"></script>
 *   </head>
 *   <body class="lang-zh">
 *     <div id="lang-toggle">
 *       <button onclick="FCMasterLang.set('zh')">中文</button>
 *       <button onclick="FCMasterLang.set('en')">EN</button>
 *       <button onclick="FCMasterLang.set('bilingual')">中/EN</button>
 *     </div>
 *     <!-- Dual-language text -->
 *     <span class="zh">中文文本</span><span class="en">English text</span>
 *     <!-- Player names -->
 *     <span class="player-name" data-zh="中文名" data-en="English Name">English Name</span>
 *   </body>
 */

(function() {
  'use strict';

  const FCMasterLang = {
    current: 'zh',

    set(lang) {
      this.current = lang;
      document.body.className = document.body.className
        .replace(/lang-\w+/g, '')
        .trim();
      document.body.classList.add('lang-' + lang);

      // Update player name elements
      document.querySelectorAll('.player-name').forEach(function(el) {
        const zh = el.getAttribute('data-zh') || el.getAttribute('data-en') || '';
        const en = el.getAttribute('data-en') || el.getAttribute('data-zh') || '';
        if (lang === 'zh') {
          el.textContent = zh;
        } else if (lang === 'en') {
          el.textContent = en;
        } else {
          el.textContent = zh + ' / ' + en;
        }
      });

      // Update toggle button states
      document.querySelectorAll('#lang-toggle button').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.getAttribute('data-lang') === lang) {
          btn.classList.add('active');
        }
      });

      // Save preference
      try { localStorage.setItem('fcmaster-lang', lang); } catch(e) {}
    },

    init() {
      // Restore saved preference
      let saved = 'zh';
      try { saved = localStorage.getItem('fcmaster-lang') || 'zh'; } catch(e) {}
      this.set(saved);
    }
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { FCMasterLang.init(); });
  } else {
    FCMasterLang.init();
  }

  // Expose globally
  window.FCMasterLang = FCMasterLang;
})();
