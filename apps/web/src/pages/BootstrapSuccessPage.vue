<script setup lang="ts">
import { useRouter } from 'vue-router';

import PrimaryButton from '../components/ui/PrimaryButton.vue';
import SecondaryButton from '../components/ui/SecondaryButton.vue';

const router = useRouter();

async function openVault() {
  await router.push('/vault');
}

async function openAdminInvites() {
  await router.push('/admin/invites');
}
</script>

<template>
  <section class="public-page public-page--onboarding">
    <div class="panel-card panel-card--compact auth-stack auth-card">
      <div class="page-header">
        <p class="eyebrow">BOOTSTRAP</p>
        <h1>Deployment initialized</h1>
        <p class="page-subtitle">Owner setup is complete.</p>
      </div>
      <div class="form-actions">
        <PrimaryButton type="button" @click="openVault">Open vault</PrimaryButton>
        <SecondaryButton type="button" @click="openAdminInvites">Create first invite</SecondaryButton>
      </div>
    </div>
  </section>
</template>
