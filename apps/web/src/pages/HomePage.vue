<script setup lang="ts">
</script>

<template>
  <section class="panel hero">
    <p class="eyebrow">VaultLite V1</p>
    <h1>Trusted-device shell</h1>
    <p>
      This client already separates remote authentication, local unlock, and session restoration.
      The protected vault UI is still a shell for the next phase.
    </p>
    <nav class="actions">
      <RouterLink class="button primary" to="/onboarding">Start onboarding</RouterLink>
      <RouterLink class="button" to="/auth">Remote authentication</RouterLink>
      <RouterLink class="button" to="/vault">Vault shell</RouterLink>
    </nav>
  </section>
</template>
