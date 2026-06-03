/**
 * SocialShield - Facebook Content Script
 * Initial support: capture visible/rendered friends list and link scan.
 */
(function () {
  'use strict';

  if (window.__socialshield_facebook_loaded) return;
  window.__socialshield_facebook_loaded = true;

  const SS_Facebook = {
    isCapturing: false,
    fabElement: null,

    isContextValid() {
      try {
        return !!chrome.runtime?.id;
      } catch {
        return false;
      }
    },

    init() {
      if (!this.isContextValid()) return;
      this.injectFAB();
      this.injectNotificationArea();
      this.listenForMessages();
      this.observeUrlChanges();
      console.log('[SocialShield] Facebook content script loaded');
    },

    injectFAB() {
      if (document.getElementById('ss-fab')) return;

      const fab = document.createElement('div');
      fab.id = 'ss-fab';
      fab.innerHTML = `
        <button class="ss-fab-button" id="ss-fab-toggle" title="SocialShield">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L3 7V17L12 22L21 17V7L12 2Z" stroke="currentColor" stroke-width="2" fill="none"/>
            <path d="M12 8V12M12 16H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="ss-fab-menu" id="ss-fab-menu">
          <div class="ss-fab-menu-header">SocialShield</div>
          <button class="ss-fab-action" data-action="capture-friends">
            <span class="ss-fab-action-icon">FB</span>
            <span>Capture Friends</span>
          </button>
          <div class="ss-fab-divider"></div>
          <button class="ss-fab-action" data-action="scan-links">
            <span class="ss-fab-action-icon">URL</span>
            <span>Check Links</span>
          </button>
        </div>
      `;
      document.body.appendChild(fab);
      this.fabElement = fab;

      document.getElementById('ss-fab-toggle').addEventListener('click', () => {
        document.getElementById('ss-fab-menu').classList.toggle('ss-show');
      });

      fab.querySelectorAll('.ss-fab-action').forEach(btn => {
        btn.addEventListener('click', (event) => {
          const action = event.currentTarget.dataset.action;
          document.getElementById('ss-fab-menu').classList.remove('ss-show');
          this.handleAction(action);
        });
      });

      document.addEventListener('click', (event) => {
        if (!fab.contains(event.target)) {
          document.getElementById('ss-fab-menu').classList.remove('ss-show');
        }
      });
    },

    injectNotificationArea() {
      if (document.getElementById('ss-notifications')) return;
      const area = document.createElement('div');
      area.id = 'ss-notifications';
      document.body.appendChild(area);
    },

    async handleAction(action) {
      if (!this.isContextValid()) return;
      if (action === 'capture-friends' || action === 'capture-followers' || action === 'capture-following') {
        await this.startFriendsCapture();
      } else if (action === 'scan-links') {
        await this.runLinkScan();
      }
    },

    async startFriendsCapture() {
      if (this.isCapturing) {
        this.notify('A Facebook friends capture is already running.', 'warning');
        return;
      }

      const profile = this.getCurrentProfile();
      if (!profile) {
        this.notify('Open a Facebook profile friends page first.', 'error');
        return;
      }

      if (!this.isFriendsPage()) {
        this.notify('Open the Friends tab/list for this Facebook profile, then run Capture Friends.', 'warning');
        return;
      }

      this.isCapturing = true;
      this.showProgress('Capturing Facebook friends...', 0);
      this.notify(`Starting Facebook friends capture for ${profile}...`, 'info');

      try {
        const users = await this.collectFriendsByScrolling();
        if (users.length === 0) {
          this.notify('No friends captured. The list may be private or not loaded.', 'warning');
          return;
        }

        const snapshot = await SocialShieldStorage.saveSnapshot('facebook', profile, 'friends', users);
        this.notify(`Captured ${users.length} Facebook friends for ${profile}.`, 'success');

        chrome.runtime.sendMessage({
          type: 'SNAPSHOT_SAVED',
          data: snapshot
        });

        await this.autoCompare(profile, snapshot);
      } catch (err) {
        console.error('[SocialShield] Facebook friends capture error:', err);
        this.notify(`Facebook capture error: ${err.message}`, 'error');
      } finally {
        this.isCapturing = false;
        this.hideProgress();
      }
    },

    async collectFriendsByScrolling() {
      const found = new Map();
      let stableRounds = 0;
      const maxRounds = 28;
      const originalY = window.scrollY;

      for (let round = 0; round < maxRounds; round++) {
        const before = found.size;
        for (const user of this.extractVisibleFriends()) {
          const key = user.userId || user.username;
          if (key && !found.has(key)) found.set(key, user);
        }

        this.updateProgress(`Captured ${found.size} friend(s)...`);

        if (found.size === before) stableRounds++;
        else stableRounds = 0;
        if (stableRounds >= 4) break;

        window.scrollBy(0, Math.max(window.innerHeight * 0.85, 650));
        await this.wait(900);
      }

      window.scrollTo(0, originalY);
      return [...found.values()];
    },

    extractVisibleFriends() {
      const root = document.querySelector('div[role="main"]') || document.body;
      const anchors = root.querySelectorAll('a[href]');
      const users = [];
      const seen = new Set();

      for (const a of anchors) {
        const parsed = this.parseFacebookProfileLink(a.href);
        if (!parsed) continue;

        const displayName = this.extractNameFromLink(a);
        if (!displayName) continue;

        const key = parsed.userId || parsed.username;
        if (!key || seen.has(key)) continue;
        seen.add(key);

        users.push({
          username: parsed.username || parsed.userId,
          userId: parsed.userId || parsed.username,
          displayName,
          profileUrl: parsed.profileUrl,
          isVerified: false,
          platform: 'facebook',
        });
      }

      return users;
    },

    parseFacebookProfileLink(href) {
      try {
        const url = new URL(href);
        const host = url.hostname.replace(/^m\./, 'www.').replace(/^web\./, 'www.');
        if (host !== 'www.facebook.com') return null;

        const blocked = new Set([
          '', 'friends', 'groups', 'pages', 'marketplace', 'watch', 'events',
          'messages', 'notifications', 'photo', 'photos', 'videos', 'reel',
          'stories', 'gaming', 'help', 'settings', 'privacy', 'bookmarks',
          'search', 'profile.php'
        ]);

        if (url.pathname === '/profile.php') {
          const id = url.searchParams.get('id');
          if (!id || !/^\d+$/.test(id)) return null;
          return {
            username: id,
            userId: id,
            profileUrl: `https://www.facebook.com/profile.php?id=${id}`,
          };
        }

        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length !== 1) return null;

        const username = parts[0];
        if (blocked.has(username.toLowerCase())) return null;
        if (!/^[A-Za-z0-9.]{3,80}$/.test(username)) return null;

        return {
          username,
          userId: username.toLowerCase(),
          profileUrl: `https://www.facebook.com/${username}`,
        };
      } catch {
        return null;
      }
    },

    extractNameFromLink(link) {
      const raw = (link.innerText || link.textContent || link.getAttribute('aria-label') || '').trim();
      const firstLine = raw.split('\n').map(s => s.trim()).find(Boolean) || '';
      if (!firstLine) return '';
      if (firstLine.length < 2 || firstLine.length > 80) return '';

      const lower = firstLine.toLowerCase();
      const blockedText = new Set([
        'friends', 'mutual friends', 'add friend', 'message', 'follow',
        'following', 'see all', 'photos', 'videos', 'more', 'home'
      ]);
      if (blockedText.has(lower)) return '';
      if (/^\d+\s+(mutual|friends?)/i.test(firstLine)) return '';

      return firstLine;
    },

    async autoCompare(profile, newSnapshot) {
      const snapshots = await SocialShieldStorage.getSnapshots('facebook', profile, 'friends');
      if (snapshots.length < 2) return;

      const prevSnapshot = snapshots[snapshots.length - 2];
      const diff = SocialShieldDiff.compare(prevSnapshot, newSnapshot);
      const alerts = SocialShieldDiff.detectSuspicious(diff);

      for (const alert of alerts) {
        await SocialShieldStorage.saveAlert({
          ...alert,
          platform: 'facebook',
          username: profile,
          snapshotType: 'friends'
        });
      }

      if (diff.summary.addedCount > 0 || diff.summary.removedCount > 0) {
        const parts = [];
        if (diff.summary.addedCount > 0) parts.push(`+${diff.summary.addedCount} new`);
        if (diff.summary.removedCount > 0) parts.push(`-${diff.summary.removedCount} removed`);
        this.notify(`Facebook friends changed: ${parts.join(', ')}`, 'info');
      }
    },

    async runLinkScan() {
      this.notify('Scanning links on this Facebook page...', 'info');
      const results = SocialShieldScanner.scanAllLinks(document);
      const unsafe = results.filter(r => !r.safe);
      const warnings = results.filter(r => r.safe && r.warnings.length > 0);

      if (results.length === 0) {
        this.notify('No external links found on this page.', 'info');
      } else if (unsafe.length === 0 && warnings.length === 0) {
        this.notify(`Scanned ${results.length} external links - all appear safe.`, 'success');
      } else {
        this.notify(`Found ${unsafe.length} unsafe and ${warnings.length} suspicious links out of ${results.length}.`,
          unsafe.length > 0 ? 'error' : 'warning');
      }

      chrome.runtime.sendMessage({
        type: 'LINK_SCAN_COMPLETE',
        data: { total: results.length, unsafe: unsafe.length, results }
      });
    },

    getCurrentProfile() {
      try {
        const url = new URL(location.href);
        if (url.pathname === '/profile.php') {
          const id = url.searchParams.get('id');
          if (id) return id;
        }

        const parts = url.pathname.split('/').filter(Boolean);
        const blocked = new Set(['friends', 'groups', 'pages', 'marketplace', 'watch', 'events', 'messages', 'notifications']);
        if (parts[0] && !blocked.has(parts[0].toLowerCase())) return parts[0];
      } catch {}
      return null;
    },

    isFriendsPage() {
      const path = location.pathname.toLowerCase();
      const search = location.search.toLowerCase();
      return path.includes('/friends') || search.includes('sk=friends');
    },

    observeUrlChanges() {
      let lastUrl = location.href;
      const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          chrome.runtime.sendMessage({
            type: 'URL_CHANGED',
            data: {
              url: location.href,
              profile: this.getCurrentProfile(),
              isProfilePage: !!this.getCurrentProfile()
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    },

    listenForMessages() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
          case 'GET_PAGE_INFO':
            sendResponse({
              url: location.href,
              platform: 'facebook',
              profile: this.getCurrentProfile(),
              isProfilePage: !!this.getCurrentProfile(),
              isCapturing: this.isCapturing
            });
            return true;

          case 'START_CAPTURE':
            this.handleAction(message.action);
            sendResponse({ ok: true });
            return true;

          case 'RUN_LINK_SCAN':
            this.runLinkScan();
            sendResponse({ ok: true });
            return true;
        }
      });
    },

    notify(message, type = 'info') {
      const area = document.getElementById('ss-notifications');
      if (!area) return;

      const icons = { success: 'OK', error: '!', warning: '!', info: 'i' };
      const notification = document.createElement('div');
      notification.className = `ss-notification ss-notification-${type}`;
      notification.innerHTML = `
        <span class="ss-notification-icon">${icons[type] || 'i'}</span>
        <span class="ss-notification-text">${this.escapeHtml(message)}</span>
        <button class="ss-notification-close">&times;</button>
      `;

      area.appendChild(notification);
      notification.querySelector('.ss-notification-close').addEventListener('click', () => notification.remove());
      setTimeout(() => {
        notification.classList.add('ss-notification-exit');
        setTimeout(() => notification.remove(), 300);
      }, 5000);
    },

    showProgress(text) {
      let progress = document.getElementById('ss-progress');
      if (!progress) {
        progress = document.createElement('div');
        progress.id = 'ss-progress';
        progress.innerHTML = `
          <div class="ss-progress-spinner"></div>
          <div class="ss-progress-text"></div>
          <button class="ss-progress-cancel">&times;</button>
        `;
        document.body.appendChild(progress);
        progress.querySelector('.ss-progress-cancel').addEventListener('click', () => {
          this.isCapturing = false;
          this.hideProgress();
        });
      }
      this.updateProgress(text);
    },

    updateProgress(text) {
      const el = document.querySelector('#ss-progress .ss-progress-text');
      if (el) el.textContent = text;
    },

    hideProgress() {
      const progress = document.getElementById('ss-progress');
      if (progress) progress.remove();
    },

    wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SS_Facebook.init());
  } else {
    SS_Facebook.init();
  }
})();
