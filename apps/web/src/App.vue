<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';

import { useSessionStore } from './composables/useSessionStore';

const sessionStore = useSessionStore();

function handleActivity() {
  sessionStore.markActivity();
}

let autoLockInterval: number | undefined;

onMounted(() => {
  void sessionStore.restoreSession();
  window.addEventListener('pointerdown', handleActivity);
  window.addEventListener('keydown', handleActivity);
  autoLockInterval = window.setInterval(() => {
    sessionStore.enforceAutoLock();
  }, 15000);
});

onUnmounted(() => {
  if (autoLockInterval !== undefined) {
    window.clearInterval(autoLockInterval);
  }
  window.removeEventListener('pointerdown', handleActivity);
  window.removeEventListener('keydown', handleActivity);
});
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <RouterLink class="brand" to="/">VaultLite</RouterLink>
      <nav class="topnav">
        <RouterLink to="/onboarding">Onboarding</RouterLink>
        <RouterLink to="/auth">Auth</RouterLink>
        <RouterLink to="/unlock">Unlock</RouterLink>
        <RouterLink to="/vault">Vault</RouterLink>
      </nav>
    </header>
    <RouterView />
  </main>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  padding: 1.5rem;
  background:
    radial-gradient(circle at top left, rgba(221, 189, 112, 0.28), transparent 28rem),
    linear-gradient(135deg, #f7f1e6, #d6e2dc 55%, #c9d4c5);
  color: #17211f;
  font-family: Georgia, 'Times New Roman', serif;
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 2rem;
}

.brand {
  color: inherit;
  text-decoration: none;
  font-size: 1.3rem;
  font-weight: 700;
}

.topnav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.topnav :deep(a) {
  color: inherit;
  text-decoration: none;
}
</style>

<style>
body {
  margin: 0;
}

#app {
  min-height: 100vh;
}

.panel {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.75rem;
  border: 1px solid rgba(23, 33, 31, 0.14);
  border-radius: 1.25rem;
  background: rgba(255, 252, 245, 0.78);
  backdrop-filter: blur(8px);
  box-shadow: 0 24px 70px rgba(18, 30, 26, 0.12);
}

.hero {
  margin-top: 6vh;
}

.eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  color: #475450;
}

.panel h1 {
  margin: 0.6rem 0 1rem;
  font-size: clamp(2rem, 5vw, 3.5rem);
}

.panel p {
  line-height: 1.65;
}

.stack {
  display: grid;
  gap: 1rem;
}

.stack label {
  display: grid;
  gap: 0.4rem;
  font-weight: 600;
}

.stack input,
.account-kit {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem 0.9rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(23, 33, 31, 0.18);
  background: rgba(255, 255, 255, 0.78);
  font: inherit;
}

.account-kit {
  margin-top: 1rem;
  min-height: 14rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1.5rem;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.8rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(23, 33, 31, 0.18);
  background: rgba(255, 255, 255, 0.8);
  color: inherit;
  text-decoration: none;
  font: inherit;
  cursor: pointer;
}

.button.primary {
  background: #173e35;
  color: #f8f4e9;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.warning {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-left: 4px solid #b6551d;
  background: rgba(248, 230, 204, 0.8);
}

.checkbox-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  font-weight: 600;
}

.checkbox-row input {
  margin-top: 0.25rem;
  width: auto;
}

.error-banner {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-left: 4px solid #8b1e1e;
  background: rgba(245, 220, 220, 0.88);
}

.divider {
  height: 1px;
  margin: 1.4rem 0;
  background: rgba(23, 33, 31, 0.12);
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 1rem;
  margin: 1rem 0 1.5rem;
}

.summary div {
  padding: 0.9rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.65);
}

.summary dt {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #54615d;
}

.summary dd {
  margin: 0.35rem 0 0;
  font-size: 1rem;
}

@media (max-width: 720px) {
  .shell {
    padding: 1rem;
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
