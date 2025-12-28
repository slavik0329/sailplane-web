# Sailplane Web - Project Upgrade Plan

## Executive Summary

Sailplane Web is a peer-to-peer file sharing application built with React, IPFS, and OrbitDB. The project was last actively developed in **2020** and requires significant updates to work with modern tooling and address security vulnerabilities.

**Current State:**
- Build fails on Node.js 17+ due to OpenSSL 3.0 incompatibility
- 50+ security vulnerabilities (mostly from outdated react-scripts)
- Core dependencies are 4+ years old

---

## Critical Issues Identified

### 1. Build Failure (Blocking)
```
Error: error:0308010C:digital envelope routines::unsupported
```
**Cause:** Node.js 17+ uses OpenSSL 3.0 which deprecates MD4 and other legacy algorithms used by webpack 4.x (bundled with react-scripts 3.4.1).

### 2. Security Vulnerabilities
- **50+ vulnerabilities** identified via `yarn audit`
- Command injection in `node-notifier`, `react-dev-utils`
- ReDoS vulnerabilities in `postcss`, `ws`
- Most vulnerabilities stem from `react-scripts` 3.4.1

### 3. Deprecated Patterns
| Pattern | Location | Replacement |
|---------|----------|-------------|
| `ReactDOM.render()` | `src/index.js:12` | `createRoot()` |
| `createStore()` | `src/config/configure-store.js:26` | `configureStore()` from RTK |
| `react-hot-loader` | `src/App.js:149` | Fast Refresh (built-in) |
| Redux Logger always on | `configure-store.js:21` | Development-only |

### 4. Outdated IPFS Infrastructure
- WebRTC star servers at `dwebops.pub` may be offline
- IPFS API has breaking changes between 0.47 and current versions
- OrbitDB architecture has changed significantly

---

## Upgrade Strategy

### Approach: Incremental Migration

Given the age and complexity of the project, I recommend an **incremental upgrade** approach rather than a complete rewrite. This minimizes risk and allows for testing at each phase.

---

## Phase 1: Fix Immediate Build Issues

**Goal:** Get the project building on modern Node.js

### Option A: Quick Fix (Recommended for Initial Testing)
Use the legacy OpenSSL provider:
```json
// package.json scripts
"start": "NODE_OPTIONS=--openssl-legacy-provider react-app-rewired start",
"build": "NODE_OPTIONS=--openssl-legacy-provider react-app-rewired build"
```

### Option B: Proper Fix
Upgrade to react-scripts 5.x which uses webpack 5 with modern crypto:
```bash
yarn add react-scripts@5.0.1
```

**Breaking Changes to Address:**
- Remove `react-app-rewired` and `react-hot-loader` (Fast Refresh is built-in)
- Remove `@hot-loader/react-dom`
- Update `config-overrides.js` or remove it entirely
- Remove `hot(module)` wrapper from `App.js`

### Files to Modify:
- `package.json` - Update scripts and dependencies
- `config-overrides.js` - Remove or simplify
- `src/App.js:149` - Remove `hot(module)` wrapper
- `src/index.js` - Update to React 18 `createRoot` API

---

## Phase 2: Upgrade React Ecosystem

**Goal:** Upgrade to React 18 with concurrent features

### Dependencies to Update:
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-scripts": "5.0.1",
  "react-router-dom": "^6.28.0",
  "react-redux": "^9.1.2"
}
```

### Code Changes Required:

#### 1. Entry Point (`src/index.js`)
```javascript
// Before (React 16/17)
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));

// After (React 18)
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root'));
root.render(<App />);
```

#### 2. React Router v6 (`src/Routes.js`)
```javascript
// Before (v5)
import { Switch, Route } from 'react-router-dom';
<Switch>
  <Route exact path="/" component={App} />
  <Route path="/download" component={Download} />
</Switch>

// After (v6)
import { Routes, Route } from 'react-router-dom';
<Routes>
  <Route path="/" element={<App />} />
  <Route path="/download" element={<Download />} />
</Routes>
```

#### 3. Remove Hot Loader (`src/App.js`)
```javascript
// Before
import { hot } from 'react-hot-loader';
export default hot(module)(App);

// After
export default App;
```

### Dependencies to Remove:
- `react-hot-loader`
- `@hot-loader/react-dom`
- `react-app-rewire-hot-loader`
- `react-app-rewired` (optional, can keep if custom config needed)

---

## Phase 3: Modernize State Management

**Goal:** Migrate from legacy Redux to Redux Toolkit

### Dependencies to Update:
```json
{
  "@reduxjs/toolkit": "^2.3.0",
  "react-redux": "^9.1.2",
  "redux-persist": "^7.0.0"
}
```

### Dependencies to Remove:
- `redux-logger` (use RTK's built-in devtools integration)

### Code Changes:

#### 1. Store Configuration (`src/config/configure-store.js`)
```javascript
// Before (deprecated createStore)
import { createStore, applyMiddleware, compose } from 'redux';
const store = compose(applyMiddleware(...middleware))(createStore)(persistedReducer);

// After (RTK configureStore)
import { configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const persistConfig = {
  key: 'root',
  storage,
  blacklist: ['tempData'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export default function configureStore() {
  const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        },
      }),
    devTools: process.env.NODE_ENV !== 'production',
  });

  const persistor = persistStore(store);
  return { store, persistor };
}
```

#### 2. Convert Reducers to Slices (Optional Enhancement)
```javascript
// src/reducers/main.js could become src/slices/mainSlice.js
import { createSlice } from '@reduxjs/toolkit';

const mainSlice = createSlice({
  name: 'main',
  initialState: {
    instances: [],
    instanceIndex: 0,
    encryptionKey: null,
  },
  reducers: {
    addInstance: (state, action) => {
      state.instances.push(action.payload);
    },
    removeInstance: (state, action) => {
      state.instances.splice(action.payload, 1);
    },
    setInstanceIndex: (state, action) => {
      state.instanceIndex = action.payload;
    },
    setEncryptionKey: (state, action) => {
      state.encryptionKey = action.payload;
    },
    clearEncryptionKey: (state) => {
      state.encryptionKey = null;
    },
  },
});

export const { addInstance, removeInstance, setInstanceIndex, setEncryptionKey, clearEncryptionKey } = mainSlice.actions;
export default mainSlice.reducer;
```

---

## Phase 4: Upgrade P2P Stack (IPFS/OrbitDB)

**Goal:** Update to maintained versions of P2P libraries

### Current State Analysis

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `ipfs` | 0.47.0 | Deprecated | Use `helia` instead |
| `orbit-db` | 0.24.2 | 2.x | Major API changes |
| `@cypsela/sailplane-node` | Git commit | Unknown | Custom dependency, may be unmaintained |

### Critical Consideration

The IPFS JavaScript ecosystem has undergone a major transition:
- **js-ipfs** (used by this project) is **deprecated**
- **Helia** is the new IPFS implementation for JavaScript
- OrbitDB 2.x is designed for Helia, not js-ipfs

### Option A: Minimal Update (Lower Risk)
Keep using js-ipfs but update to a more recent version:
```json
{
  "ipfs": "^0.63.0",
  "orbit-db": "^0.29.0"
}
```
**Risk:** js-ipfs is deprecated and will receive no security updates.

### Option B: Full Migration to Helia (Recommended Long-term)
```json
{
  "helia": "^4.0.0",
  "@helia/unixfs": "^3.0.0",
  "@orbitdb/core": "^2.0.0"
}
```
**Risk:** Requires significant code changes to useIPFS.js and all IPFS-related code.

### Code Changes for Option B:

#### 1. IPFS Initialization (`src/hooks/useIPFS.js`)
```javascript
// Before (js-ipfs)
import Ipfs from 'ipfs';
ipfs = await Ipfs.create({ /* config */ });

// After (Helia)
import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { createLibp2p } from 'libp2p';

const libp2p = await createLibp2p({ /* config */ });
const helia = await createHelia({ libp2p });
const fs = unixfs(helia);
```

### WebRTC Star Servers
The current swarm addresses point to potentially defunct servers:
```javascript
// Current (may be offline)
'/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/'

// Modern alternatives
// Use WebRTC direct or circuit relay
```

### Sailplane-Node Dependency
The custom `@cypsela/sailplane-node` package needs evaluation:
1. Check if the GitHub repository is still maintained
2. Determine if it works with updated IPFS/OrbitDB
3. Consider forking and updating if unmaintained

---

## Phase 5: Update Remaining Dependencies

### UI Libraries
```json
{
  "react-beautiful-dnd": "^13.1.1",
  "react-dropzone": "^14.3.0",
  "react-icons": "^5.3.0",
  "react-use-dimensions": "^1.2.1"
}
```

**Note:** `react-beautiful-dnd` is in maintenance mode. Consider migrating to `@hello-pangea/dnd` (community fork) or `dnd-kit`.

### Utility Libraries
```json
{
  "immer": "^10.1.1",
  "jszip": "^3.10.1",
  "file-saver": "^2.0.5"
}
```

### Testing Libraries
```json
{
  "@testing-library/react": "^16.0.0",
  "@testing-library/jest-dom": "^6.6.0",
  "@testing-library/user-event": "^14.5.0"
}
```

### DevDependencies
```json
{
  "prettier": "^3.4.0",
  "@eslint/js": "^9.0.0"
}
```

### Dependencies to Remove
- `@react-native-community/eslint-config` (wrong config for web app)
- `react-app-rewire-hot-loader`
- `react-app-rewired` (if no longer needed)
- `@hot-loader/react-dom`
- `react-hot-loader`

---

## Implementation Checklist

### Immediate (Get Building)
- [ ] Add `NODE_OPTIONS=--openssl-legacy-provider` to scripts
- [ ] Verify app builds and runs

### Short-term (Security & React)
- [ ] Upgrade `react-scripts` to 5.0.1
- [ ] Remove hot loader dependencies and code
- [ ] Upgrade React to 18.x
- [ ] Update `ReactDOM.render` to `createRoot`
- [ ] Upgrade React Router to v6

### Medium-term (State & Testing)
- [ ] Migrate to Redux Toolkit
- [ ] Update testing libraries
- [ ] Fix any deprecated patterns in tests

### Long-term (P2P Stack)
- [ ] Research Helia migration path
- [ ] Evaluate sailplane-node status
- [ ] Update or replace OrbitDB
- [ ] Update WebRTC signaling servers

---

## Risk Assessment

| Phase | Risk Level | Rollback Difficulty |
|-------|------------|-------------------|
| Phase 1 | Low | Easy |
| Phase 2 | Medium | Moderate |
| Phase 3 | Low | Easy |
| Phase 4 | High | Difficult |
| Phase 5 | Low | Easy |

---

## Testing Strategy

1. **After Each Phase:**
   - Run build: `yarn build`
   - Start dev server: `yarn start`
   - Test core functionality manually:
     - [ ] App loads without console errors
     - [ ] Can create new instance
     - [ ] Can upload files (if IPFS connects)
     - [ ] Can navigate folders
     - [ ] Settings page works

2. **Integration Testing:**
   - Run existing tests: `yarn test`
   - Update tests as APIs change

---

## Recommended Upgrade Order

1. **Phase 1** - Get building (1 hour)
2. **Phase 2** - React upgrade (2-4 hours)
3. **Phase 5** - Simple dependency updates (1 hour)
4. **Phase 3** - Redux Toolkit (2-3 hours)
5. **Phase 4** - IPFS/OrbitDB (requires research, potentially days)

---

## Notes

- The custom git dependencies (`@cypsela/sailplane-node`, `@tabcat/file-list-source`) are the highest risk factors as they may be unmaintained
- Consider whether the app needs to remain P2P or if a simpler backend would suffice
- The resolution override for `libp2p-interfaces` indicates compatibility issues that may resurface during upgrades

---

*Plan created: December 2024*
*Node.js version tested: 22.21.1*
*Last project activity: ~2020*
