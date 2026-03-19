<script setup lang="ts">
import SecondaryButton from '../ui/SecondaryButton.vue';

defineProps<{
  created: number;
  skipped: number;
  failed: number;
  attachmentsCreated: number;
  attachmentsFailed: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'download-report'): void;
}>();
</script>

<template>
  <section class="import-result-summary">
    <dl class="import-result-summary__counts">
      <div>
        <dt>Created</dt>
        <dd>{{ created }}</dd>
      </div>
      <div>
        <dt>Skipped</dt>
        <dd>{{ skipped }}</dd>
      </div>
      <div>
        <dt>Failed</dt>
        <dd>{{ failed }}</dd>
      </div>
      <div>
        <dt>Attachments created</dt>
        <dd>{{ attachmentsCreated }}</dd>
      </div>
      <div>
        <dt>Attachments failed</dt>
        <dd>{{ attachmentsFailed }}</dd>
      </div>
    </dl>
    <SecondaryButton type="button" :disabled="disabled" @click="emit('download-report')">
      Download import report (.json)
    </SecondaryButton>
  </section>
</template>
