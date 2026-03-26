const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

const RANDOM_LENGTH_MIN = 8;
const RANDOM_LENGTH_MAX = 64;
const PIN_LENGTH_MIN = 4;
const PIN_LENGTH_MAX = 12;

export const PASSWORD_GENERATOR_MODES = Object.freeze({
  SMART: 'smart',
  RANDOM: 'random',
  PIN: 'pin',
});

const DEFAULT_STATE = Object.freeze({
  mode: PASSWORD_GENERATOR_MODES.SMART,
  useAsDefaultSuggestion: false,
  randomLength: 20,
  randomIncludeNumbers: true,
  randomIncludeSymbols: true,
  pinLength: 5,
});

function clampInteger(input, min, max, fallback) {
  const numeric = Number.parseInt(input, 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function normalizeMode(mode) {
  if (mode === PASSWORD_GENERATOR_MODES.SMART) {
    return PASSWORD_GENERATOR_MODES.SMART;
  }
  if (mode === PASSWORD_GENERATOR_MODES.RANDOM) {
    return PASSWORD_GENERATOR_MODES.RANDOM;
  }
  if (mode === PASSWORD_GENERATOR_MODES.PIN) {
    return PASSWORD_GENERATOR_MODES.PIN;
  }
  return PASSWORD_GENERATOR_MODES.SMART;
}

function getSecureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    return 0;
  }
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    return Math.floor(Math.random() * maxExclusive);
  }

  const maxValid = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const randomBuffer = new Uint32Array(1);
  while (true) {
    cryptoApi.getRandomValues(randomBuffer);
    const sample = randomBuffer[0] ?? 0;
    if (sample < maxValid) {
      return sample % maxExclusive;
    }
  }
}

function chooseCharacter(pool) {
  if (typeof pool !== 'string' || pool.length === 0) {
    return '';
  }
  return pool[getSecureRandomInt(pool.length)] ?? '';
}

function shuffleCharacters(chars) {
  const output = Array.isArray(chars) ? [...chars] : [];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = getSecureRandomInt(index + 1);
    const temp = output[index];
    output[index] = output[swapIndex];
    output[swapIndex] = temp;
  }
  return output;
}

function buildSmartPassword(length) {
  const requiredPools = [LOWERCASE, UPPERCASE, DIGITS, SYMBOLS];
  const requiredCharacters = requiredPools.map((pool) => chooseCharacter(pool));
  const combinedPool = `${LOWERCASE}${UPPERCASE}${DIGITS}${SYMBOLS}`;
  const remaining = Math.max(0, length - requiredCharacters.length);
  for (let index = 0; index < remaining; index += 1) {
    requiredCharacters.push(chooseCharacter(combinedPool));
  }
  return shuffleCharacters(requiredCharacters).join('');
}

function buildRandomPassword(length, includeNumbers, includeSymbols) {
  let pool = `${LOWERCASE}${UPPERCASE}`;
  if (includeNumbers) {
    pool += DIGITS;
  }
  if (includeSymbols) {
    pool += SYMBOLS;
  }
  if (pool.length === 0) {
    pool = `${LOWERCASE}${UPPERCASE}`;
  }
  const chars = [];
  for (let index = 0; index < length; index += 1) {
    chars.push(chooseCharacter(pool));
  }
  return chars.join('');
}

function buildPinCode(length) {
  const chars = [];
  for (let index = 0; index < length; index += 1) {
    chars.push(chooseCharacter(DIGITS));
  }
  return chars.join('');
}

export function createDefaultGeneratorState() {
  return { ...DEFAULT_STATE };
}

export function normalizeGeneratorState(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    mode: normalizeMode(source.mode),
    useAsDefaultSuggestion: source.useAsDefaultSuggestion === true,
    randomLength: clampInteger(source.randomLength, RANDOM_LENGTH_MIN, RANDOM_LENGTH_MAX, DEFAULT_STATE.randomLength),
    randomIncludeNumbers: source.randomIncludeNumbers !== false,
    randomIncludeSymbols: source.randomIncludeSymbols !== false,
    pinLength: clampInteger(source.pinLength, PIN_LENGTH_MIN, PIN_LENGTH_MAX, DEFAULT_STATE.pinLength),
  };
}

export function generatePassword(input) {
  const state = normalizeGeneratorState(input);
  if (state.mode === PASSWORD_GENERATOR_MODES.PIN) {
    return buildPinCode(state.pinLength);
  }
  if (state.mode === PASSWORD_GENERATOR_MODES.RANDOM) {
    return buildRandomPassword(state.randomLength, state.randomIncludeNumbers, state.randomIncludeSymbols);
  }
  return buildSmartPassword(state.randomLength);
}

