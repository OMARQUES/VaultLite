<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const model = defineModel<string>({ required: true });

const props = defineProps<{
  label: string;
  name?: string;
  placeholder?: string;
  autocomplete?: string;
  disabled?: boolean;
  required?: boolean;
  readonly?: boolean;
  allowCopy?: boolean;
  maskKey?: string | number | null;
}>();

const emit = defineEmits<{
  copied: [];
}>();

const revealed = ref(false);
const copied = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.maskKey,
  () => {
    revealed.value = false;
    copied.value = false;
  },
);

const currentType = computed(() => (revealed.value ? 'text' : 'password'));
const revealLabel = computed(() => (revealed.value ? 'Hide' : 'Reveal'));
const copyLabel = computed(() => (copied.value ? 'Copied' : 'Copy'));

async function copyValue() {
  if (!props.allowCopy) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(model.value);
    }
    copied.value = true;
    emit('copied');
    window.setTimeout(() => {
      copied.value = false;
    }, 1200);
  } catch {
    copied.value = false;
  }
}

defineExpose({
  focus() {
    inputRef.value?.focus();
  },
  remask() {
    revealed.value = false;
    copied.value = false;
  },
});
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}</span>
    <div class="secret-field">
      <div class="secret-field__input-wrap">
        <input
          ref="inputRef"
          :name="name"
          :type="currentType"
          :placeholder="placeholder"
          :autocomplete="autocomplete"
          :disabled="disabled"
          :required="required"
          :readonly="readonly"
          :value="model"
          @input="model = ($event.target as HTMLInputElement).value"
        />
        <div class="secret-field__actions">
          <button
            class="button button--ghost secret-field__action"
            type="button"
            :aria-label="revealLabel"
            :aria-pressed="revealed ? 'true' : 'false'"
            :disabled="disabled"
            @click="revealed = !revealed"
          >
            {{ revealLabel }}
          </button>
          <button
            v-if="allowCopy"
            class="button button--ghost secret-field__action"
            type="button"
            :aria-label="copyLabel"
            :disabled="disabled"
            @click="copyValue"
          >
            {{ copyLabel }}
          </button>
        </div>
      </div>
    </div>
  </label>
</template>
