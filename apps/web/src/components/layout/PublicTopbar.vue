<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useRoute } from 'vue-router';

const route = useRoute();
const showPrimaryNav = computed(() => route.path !== '/unlock' && route.path !== '/onboarding');
const isMobileNav = ref(false);
const isDrawerOpen = ref(false);
let mediaQuery: MediaQueryList | null = null;

const showDesktopNav = computed(() => showPrimaryNav.value && !isMobileNav.value);
const showMobileMenu = computed(() => showPrimaryNav.value && isMobileNav.value);

function syncMobileNav() {
  isMobileNav.value = mediaQuery?.matches ?? false;
  if (!isMobileNav.value) {
    isDrawerOpen.value = false;
  }
}

function closeDrawer() {
  isDrawerOpen.value = false;
}

function toggleDrawer() {
  isDrawerOpen.value = !isDrawerOpen.value;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeDrawer();
  }
}

watch(
  () => route.path,
  () => {
    closeDrawer();
  },
);

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia('(max-width: 1024px)');
    syncMobileNav();
    mediaQuery.addEventListener('change', syncMobileNav);
  }
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', syncMobileNav);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <header class="public-topbar">
    <div class="public-topbar__inner">
      <RouterLink class="brand" to="/">VaultLite</RouterLink>
      <nav v-if="showDesktopNav" class="public-nav" aria-label="Primary">
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/onboarding">Onboarding</RouterLink>
        <RouterLink to="/auth">Add device</RouterLink>
      </nav>
      <button
        v-if="showMobileMenu"
        data-testid="public-nav-menu-button"
        class="public-topbar__menu-button"
        type="button"
        aria-label="Open navigation menu"
        :aria-expanded="isDrawerOpen ? 'true' : 'false'"
        aria-controls="public-nav-drawer"
        @click="toggleDrawer"
      >
        <span class="public-topbar__menu-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
    </div>
    <div
      v-if="showMobileMenu && isDrawerOpen"
      class="public-nav-drawer__backdrop"
      role="presentation"
      @click.self="closeDrawer"
    >
      <nav id="public-nav-drawer" data-testid="public-nav-drawer" class="public-nav public-nav--drawer" aria-label="Primary">
        <RouterLink to="/" @click="closeDrawer">Home</RouterLink>
        <RouterLink to="/onboarding" @click="closeDrawer">Onboarding</RouterLink>
        <RouterLink to="/auth" @click="closeDrawer">Add device</RouterLink>
      </nav>
    </div>
  </header>
</template>
