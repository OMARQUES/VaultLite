<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="public-page public-page--home">
    <div class="hero-card">
      <p class="eyebrow">VaultLite v1</p>
      <h1>Direct, calm vault access for trusted groups</h1>
      <p class="hero-card__body">
        VaultLite keeps vault access focused for trusted users and devices.
      </p>
      <div class="hero-card__actions">
        <RouterLink class="button button--primary" to="/onboarding">Start onboarding</RouterLink>
        <RouterLink class="button button--secondary" to="/auth">Add device</RouterLink>
      </div>
    </div>
  </section>
</template>
