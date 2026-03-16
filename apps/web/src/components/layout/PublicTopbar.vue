<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <header class="public-topbar">
    <div class="public-topbar__inner">
      <RouterLink class="brand" to="/">VaultLite</RouterLink>
      <nav class="public-nav" aria-label="Primary">
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/onboarding">Onboarding</RouterLink>
        <RouterLink to="/auth">Auth</RouterLink>
      </nav>
    </div>
  </header>
</template>
