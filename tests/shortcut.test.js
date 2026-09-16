const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

test('declares browser and global dashboard shortcuts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));

  assert.equal(manifest.commands['open-dashboard'].suggested_key.default, 'Alt+G');
  assert.equal(manifest.commands['open-dashboard-global'].suggested_key.default, 'Ctrl+Shift+7');
  assert.equal(manifest.commands['open-dashboard-global'].global, true);
});

test('opens the dashboard popup for both shortcut commands only', async () => {
  let commandListener;
  let popupOpenCount = 0;
  let shortcutSession = {};
  const event = () => ({ addListener() {} });
  const context = {
    importScripts() {},
    fetch,
    Intl,
    Number,
    Object,
    Promise,
    Set,
    String,
    chrome: {
      action: {
        openPopup() {
          popupOpenCount += 1;
          return Promise.resolve();
        }
      },
      alarms: {
        create() {},
        onAlarm: event()
      },
      commands: {
        onCommand: {
          addListener(listener) {
            commandListener = listener;
          }
        }
      },
      notifications: { create() {} },
      runtime: {
        lastError: null,
        onInstalled: event(),
        onMessage: event(),
        onStartup: event()
      },
      storage: {
        local: {
          get: async defaults => defaults,
          set: async () => {}
        },
        session: {
          set: async value => {
            shortcutSession = { ...shortcutSession, ...value };
          },
          remove: async key => {
            delete shortcutSession[key];
          }
        }
      }
    },
    PortfolioCore: {}
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(projectRoot, 'background.js'), 'utf8'),
    context
  );

  assert.equal(typeof commandListener, 'function');
  commandListener('unrelated-command');
  commandListener('open-dashboard');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(popupOpenCount, 1);
  assert.ok(shortcutSession.shortcutPopupCloseAt > Date.now());

  commandListener('open-dashboard-global');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(popupOpenCount, 2);
});
