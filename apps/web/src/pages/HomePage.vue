<script setup lang="ts">
import { RouterLink } from 'vue-router';

import AppIcon from '../components/ui/AppIcon.vue';
</script>

<template>
  <section class="public-page public-page--home">
    <div class="hero-card home-hero-card">
      <div class="home-hero-card__main">
        <div class="home-hero-copy">
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

        <div class="home-hero-visual" aria-hidden="true">
          <div class="home-hero-visual__ring">
            <AppIcon name="shield_check" :size="96" />
          </div>
        </div>
      </div>

      <div class="home-feature-strip" aria-label="VaultLite features">
        <div class="home-feature">
          <span class="home-feature__icon"><AppIcon name="shield_check" :size="20" /></span>
          <div>
            <h2>Trusted devices</h2>
            <p>Only approved devices</p>
          </div>
        </div>
        <div class="home-feature">
          <span class="home-feature__icon"><AppIcon name="monitor" :size="20" /></span>
          <div>
            <h2>Local-first access</h2>
            <p>Your data stays local</p>
          </div>
        </div>
        <div class="home-feature">
          <span class="home-feature__icon"><AppIcon name="lock" :size="20" /></span>
          <div>
            <h2>Approval-based security</h2>
            <p>Access with explicit approval</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
